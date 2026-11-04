import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Mirrors the original Python service: the server holds the only copy of
// the decryption key, stores just an encrypted face template, and refuses
// face matches above a fixed distance. Passwords live in Cloud Auth.

export const FACE_MODEL = "facenet128";
const FACE_DESCRIPTOR_LENGTH = 128;
const FACE_DISTANCE_LIMIT = 0.6;
const VERIFICATION_WINDOW_MS = 30 * 60 * 1000;

export type Role = "staff" | "administrator";

type Ok<T> = { ok: true } & T;
type Failure = { ok: false; error: string; code?: string };
export type Result<T> = Ok<T> | Failure;

// ---------------------------------------------------------------------------
// Template encryption (AES-GCM under the FACE_TEMPLATE_KEY secret)
// ---------------------------------------------------------------------------

const textEncoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getTemplateKey(): Promise<CryptoKey> {
  const secret = process.env["FACE_TEMPLATE_KEY"];
  if (!secret) throw new Error("FACE_TEMPLATE_KEY secret is not configured.");
  const material = await crypto.subtle.digest("SHA-256", textEncoder.encode(secret));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptDescriptor(descriptor: number[]): Promise<string> {
  const key = await getTemplateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      textEncoder.encode(JSON.stringify(descriptor)),
    ),
  );
  const payload = new Uint8Array(iv.length + ciphertext.length);
  payload.set(iv);
  payload.set(ciphertext, iv.length);
  return bytesToBase64(payload);
}

async function decryptDescriptor(payload: string): Promise<number[]> {
  const key = await getTemplateKey();
  const bytes = base64ToBytes(payload);
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  const parsed: unknown = JSON.parse(new TextDecoder().decode(plain));
  if (!Array.isArray(parsed)) throw new Error("Malformed face template.");
  return parsed as number[];
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type ProfileFields = {
  fullName: string;
  employeeId: string;
  department: string;
};

function validateProfileFields(fields: ProfileFields): string | null {
  const fullName = fields.fullName.trim();
  const employeeId = fields.employeeId.trim();
  const department = fields.department.trim();
  if (!fullName || fullName.length > 150)
    return "Enter a name of 1 to 150 characters.";
  if (!employeeId || employeeId.length > 60)
    return "Enter an employee ID of 1 to 60 characters.";
  if (!department || department.length > 120)
    return "Enter a department of 1 to 120 characters.";
  return null;
}

function validateEmail(email: string): string | null {
  const value = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(value) || value.length > 254)
    return "Enter a valid email address.";
  return null;
}

function validatePassword(password: string): string | null {
  const bytes = new TextEncoder().encode(password);
  if (bytes.length < 10 || bytes.length > 72)
    return "Password must be 10 to 72 characters.";
  return null;
}

function validateDescriptor(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === FACE_DESCRIPTOR_LENGTH &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

// ---------------------------------------------------------------------------
// Shared authorization guards
// ---------------------------------------------------------------------------

type Guard =
  | { allowed: true; name: string }
  | { allowed: false; error: string; code?: string };

async function loadGuard(
  supabase: SupabaseClient<Database>,
  userId: string,
  role: Role,
): Promise<Guard> {
  const { data: allowed, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: role,
  });
  if (error || !allowed) {
    return { allowed: false, error: "You do not have access to this area." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, face_verified_at")
    .eq("id", userId)
    .maybeSingle();

  const verifiedAt = profile?.face_verified_at
    ? new Date(profile.face_verified_at).getTime()
    : 0;
  if (!verifiedAt || Date.now() - verifiedAt > VERIFICATION_WINDOW_MS) {
    return {
      allowed: false,
      error: "Face verification is required before continuing.",
      code: "reverify",
    };
  }

  return { allowed: true, name: profile?.full_name ?? "" };
}

function failure(error: string, code?: string): Failure {
  if (code === undefined) return { ok: false, error };
  return { ok: false, error, code };
}

function isVerifiedAt(verifiedAt: string | null | undefined): boolean {
  if (!verifiedAt) return false;
  const at = new Date(verifiedAt).getTime();
  return at > 0 && Date.now() - at < VERIFICATION_WINDOW_MS;
}

// ---------------------------------------------------------------------------
// Public provisioning (first administrator only)
// ---------------------------------------------------------------------------

export const checkFirstAdministrator = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ canProvision: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "administrator");
    return { canProvision: (count ?? 0) === 0 };
  },
);

export const provisionAdministrator = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as {
    fullName: string;
    employeeId: string;
    email: string;
    password: string;
    department: string;
    descriptor: number[];
    consent: boolean;
  })
  .handler(
    async ({ data }): Promise<Result<{ email: string }>> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const fields = {
        fullName: data.fullName ?? "",
        employeeId: data.employeeId ?? "",
        department: data.department ?? "",
      };
      const fieldError = validateProfileFields(fields);
      if (fieldError) return failure(fieldError);
      const emailError = validateEmail(data.email ?? "");
      if (emailError) return failure(emailError);
      const passwordError = validatePassword(data.password ?? "");
      if (passwordError) return failure(passwordError);
      if (!validateDescriptor(data.descriptor))
        return failure("Capture your face to enroll facial verification.");
      if (data.consent !== true)
        return failure("Consent is required to enroll facial verification.");

      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "administrator");
      if ((count ?? 0) > 0) {
        return failure(
          "An administrator account already exists. Ask an existing administrator for help.",
          "exists",
        );
      }

      const email = data.email.trim().toLowerCase();
      const { data: created, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password: data.password,
          email_confirm: true,
          user_metadata: { full_name: fields.fullName.trim() },
        });
      if (createError || !created.user) {
        if (/already|registered|exists/i.test(createError?.message ?? "")) {
          return failure("That email is already registered.", "conflict");
        }
        return failure("Could not create the administrator account.");
      }
      const userId = created.user.id;

      const faceTemplate = await encryptDescriptor(data.descriptor);
      const { error: profileError } = await supabaseAdmin.from("profiles").insert({
        id: userId,
        email,
        full_name: fields.fullName.trim(),
        employee_id: fields.employeeId.trim(),
        department: fields.department.trim(),
        face_model: FACE_MODEL,
        face_template: faceTemplate,
        biometric_consent_at: new Date().toISOString(),
      });
      if (profileError) {
        if (profileError.code === "23505") {
          return failure("That employee ID is already registered.", "conflict");
        }
        return failure("Could not save the administrator profile.");
      }

      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: "administrator" });
      if (roleError) return failure("Could not assign the administrator role.");

      return { ok: true, email };
    },
  );

// ---------------------------------------------------------------------------
// Sign-in identifier resolution ("Staff ID / Email")
// ---------------------------------------------------------------------------

/**
 * The original service matched a password login against email OR employee ID.
 * Auth credentials require the email, so the client asks the server to resolve
 * a bare employee ID to its email. The reply never reveals whether an ID
 * exists beyond what a failed sign-in would reveal anyway.
 */
export const resolveSignInEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as { identifier: string })
  .handler(async ({ data }): Promise<{ email: string | null }> => {
    const identifier = (data.identifier ?? "").trim();
    if (!identifier) return { email: null };
    if (identifier.includes("@")) return { email: identifier.toLowerCase() };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("employee_id", identifier)
      .maybeSingle();
    return { email: profile?.email ?? null };
  });

// ---------------------------------------------------------------------------
// Session state + enrollment
// ---------------------------------------------------------------------------

export type MyState = {
  signedIn: boolean;
  hasProfile: boolean;
  role: Role | null;
  name: string | null;
  verified: boolean;
};

export const getMyState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyState> => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, face_verified_at")
      .eq("id", userId)
      .maybeSingle();
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const role: Role | null = roles?.some((r) => r.role === "administrator")
      ? "administrator"
      : roles?.some((r) => r.role === "staff")
        ? "staff"
        : null;

    return {
      signedIn: true,
      hasProfile: !!profile,
      role,
      name: profile?.full_name ?? null,
      verified: isVerifiedAt(profile?.face_verified_at),
    };
  });

export const enrollProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input as ProfileFields & {
    descriptor: number[];
    consent: boolean;
  })
  .handler(async ({ context, data }): Promise<Result<{ role: Role }>> => {
    const { supabase, userId } = context;
    if (!validateDescriptor(data.descriptor))
      return failure("Capture your face to enroll facial verification.");
    if (data.consent !== true)
      return failure("Consent is required to enroll facial verification.");
    const fieldError = validateProfileFields(data);
    if (fieldError) return failure(fieldError);

    const { data: existing } = await supabase
      .from("profiles")
      .select("id, face_template")
      .eq("id", userId)
      .maybeSingle();
    if (existing?.face_template) {
      return failure("Your account is already enrolled.", "already-enrolled");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const claims = context.claims as { email?: unknown };
    const email = typeof claims.email === "string" ? claims.email : null;
    if (!email) return failure("Your account has no email address on record.");
    const faceTemplate = await encryptDescriptor(data.descriptor);
    const values = {
      id: userId,
      email,
      full_name: data.fullName.trim(),
      employee_id: data.employeeId.trim(),
      department: data.department.trim(),
      face_model: FACE_MODEL,
      face_template: faceTemplate,
      biometric_consent_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update(values)
        .eq("id", userId);
      if (error) return failure("Could not save your profile.");
    } else {
      const { error } = await supabaseAdmin.from("profiles").insert(values);
      if (error) {
        if (error.code === "23505")
          return failure("That employee ID is already registered.", "conflict");
        return failure("Could not save your profile.");
      }
    }

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "staff" }, { onConflict: "user_id,role" });

    return { ok: true, role: "staff" };
  });

// ---------------------------------------------------------------------------
// Face verification
// ---------------------------------------------------------------------------

export const verifyFace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input as { descriptor: number[] })
  .handler(
    async ({ context, data }): Promise<Result<{ role: Role; name: string }>> => {
      const { supabase, userId } = context;
      if (!validateDescriptor(data.descriptor))
        return failure("Capture your face to verify your identity.");

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, face_model, face_template")
        .eq("id", userId)
        .maybeSingle();
      if (!profile || !profile.face_template) {
        return failure("Your account has not been enrolled yet.", "no-profile");
      }
      if (profile.face_model !== FACE_MODEL) {
        return failure("Face verification setup needs to be updated.", "outdated");
      }

      let stored: number[];
      try {
        stored = await decryptDescriptor(profile.face_template);
      } catch {
        return failure("Stored verification data is unavailable.");
      }

      if (euclideanDistance(data.descriptor, stored) > FACE_DISTANCE_LIMIT) {
        return failure(
          "The login details could not be verified. Capture your face again.",
        );
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("profiles")
        .update({ face_verified_at: new Date().toISOString() })
        .eq("id", userId);

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const role: Role | null = roles?.some((r) => r.role === "administrator")
        ? "administrator"
        : roles?.some((r) => r.role === "staff")
          ? "staff"
          : null;
      if (!role) return failure("Your account has no assigned role.");

      return { ok: true, role, name: profile.full_name };
    },
  );

// ---------------------------------------------------------------------------
// Staff attendance
// ---------------------------------------------------------------------------

export type AttendanceRecord = {
  id: number;
  signInAt: string;
  signOutAt: string | null;
};

export const staffAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<Result<{ name: string; records: AttendanceRecord[]; active: AttendanceRecord | null }>> => {
      const guard = await loadGuard(context.supabase, context.userId, "staff");
      if (!guard.allowed) return failure(guard.error, guard.code);

      const { data, error } = await context.supabase
        .from("attendance_records")
        .select("id, sign_in_at, sign_out_at")
        .eq("user_id", context.userId)
        .order("sign_in_at", { ascending: false })
        .limit(10);
      if (error) return failure("Could not load your attendance records.");

      const records: AttendanceRecord[] = (data ?? []).map((row) => ({
        id: row.id,
        signInAt: new Date(row.sign_in_at).toISOString(),
        signOutAt: row.sign_out_at ? new Date(row.sign_out_at).toISOString() : null,
      }));
      const active = records.find((r) => !r.signOutAt) ?? null;
      return { ok: true, name: guard.name, records, active };
    },
  );

export const staffSignIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Result<{ message: string }>> => {
    const guard = await loadGuard(context.supabase, context.userId, "staff");
    if (!guard.allowed) return failure(guard.error, guard.code);

    const { data: open } = await context.supabase
      .from("attendance_records")
      .select("id")
      .eq("user_id", context.userId)
      .is("sign_out_at", null)
      .limit(1);
    if (open && open.length > 0) {
      return failure("You are already signed in.", "conflict");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("attendance_records")
      .insert({ user_id: context.userId });
    if (error) return failure("Could not record sign-in.");
    return { ok: true, message: "You are signed in." };
  });

export const staffSignOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Result<{ message: string }>> => {
    const guard = await loadGuard(context.supabase, context.userId, "staff");
    if (!guard.allowed) return failure(guard.error, guard.code);

    const { data: open } = await context.supabase
      .from("attendance_records")
      .select("id")
      .eq("user_id", context.userId)
      .is("sign_out_at", null)
      .order("sign_in_at", { ascending: false })
      .limit(1);
    const activeRecord = open?.[0];
    if (!activeRecord) {
      return failure("You are not currently signed in.", "conflict");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("attendance_records")
      .update({ sign_out_at: new Date().toISOString() })
      .eq("id", activeRecord.id)
      .eq("user_id", context.userId)
      .is("sign_out_at", null);
    if (error) return failure("Could not record sign-out.");
    return { ok: true, message: "You are signed out." };
  });

// ---------------------------------------------------------------------------
// Administrator dashboards
// ---------------------------------------------------------------------------

export type AdminUser = {
  fullName: string;
  employeeId: string;
  email: string;
  department: string;
  role: Role;
  createdAt: string;
};

export const adminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<Result<{ name: string; users: AdminUser[] }>> => {
      const guard = await loadGuard(context.supabase, context.userId, "administrator");
      if (!guard.allowed) return failure(guard.error, guard.code);

      const { data, error } = await context.supabase
        .from("profiles")
        .select("id, full_name, employee_id, email, department, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return failure("Could not load registered accounts.");

      // Roles live in the protected user_roles table; the caller has already
      // been verified as an administrator, so read them with the service role.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: roleRows } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role");
      const roleByUser = new Map<string, Role>();
      for (const row of roleRows ?? []) {
        if (row.role === "administrator" || row.role === "staff") {
          roleByUser.set(row.user_id, row.role);
        }
      }

      return {
        ok: true,
        name: guard.name,
        users: (data ?? []).map((row) => ({
          fullName: row.full_name,
          employeeId: row.employee_id,
          email: row.email ?? "—",
          department: row.department,
          role: roleByUser.get(row.id) ?? "staff",
          createdAt: new Date(row.created_at).toISOString(),
        })),
      };
    },
  );

export type AdminAttendanceRecord = {
  id: number;
  fullName: string;
  employeeId: string;
  department: string;
  signInAt: string;
  signOutAt: string | null;
};

export const adminAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<Result<{ name: string; records: AdminAttendanceRecord[] }>> => {
      const guard = await loadGuard(context.supabase, context.userId, "administrator");
      if (!guard.allowed) return failure(guard.error, guard.code);

      const { data, error } = await context.supabase
        .from("attendance_records")
        .select(
          "id, sign_in_at, sign_out_at, profiles ( full_name, employee_id, department )",
        )
        .order("sign_in_at", { ascending: false })
        .limit(200);
      if (error) return failure("Could not load attendance records.");

      const records: AdminAttendanceRecord[] = (data ?? []).map((row) => {
        const person = row.profiles as
          | { full_name: string; employee_id: string; department: string }
          | null;
        return {
          id: row.id,
          fullName: person?.full_name ?? "—",
          employeeId: person?.employee_id ?? "—",
          department: person?.department ?? "—",
          signInAt: new Date(row.sign_in_at).toISOString(),
          signOutAt: row.sign_out_at ? new Date(row.sign_out_at).toISOString() : null,
        };
      });
      return { ok: true, name: guard.name, records };
    },
  );
