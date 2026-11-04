import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CameraCapture } from "@/components/CameraCapture";
import { FaceVerifyPanel } from "@/components/FaceVerifyPanel";
import {
  checkFirstAdministrator,
  getMyState,
  provisionAdministrator,
  resolveSignInEmail,
  verifyFace,
  type Role,
} from "@/lib/attendance-server";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Sign in — Digital Sign-In Auditor",
      },
      {
        name: "description",
        content:
          "Secure attendance control and identity verification for staff and administrators of the Audu Bako Secretariat.",
      },
      { property: "og:title", content: "Sign in — Digital Sign-In Auditor" },
      {
        property: "og:description",
        content:
          "Facial-verified sign-in, timestamped audit trail, and attendance reporting for the Audu Bako Secretariat.",
      },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

type Mode = "signIn" | "signUp" | "forgot" | "provision";
type Status = { tone: "muted" | "error" | "success"; text: string } | null;

function LoginPage() {
  const navigate = useNavigate();
  const getMyStateFn = useServerFn(getMyState);
  const verifyFaceFn = useServerFn(verifyFace);
  const checkFirstAdministratorFn = useServerFn(checkFirstAdministrator);
  const provisionAdministratorFn = useServerFn(provisionAdministrator);
  const resolveSignInEmailFn = useServerFn(resolveSignInEmail);

  const [mode, setMode] = useState<Mode>("signIn");
  const [signedInFaceCheck, setSignedInFaceCheck] = useState(false);
  const [canProvision, setCanProvision] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  // Sign-in form
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loginDescriptor, setLoginDescriptor] = useState<number[] | null>(null);
  const [loginResetKey, setLoginResetKey] = useState(0);

  // Sign-up form
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  // Password reset form
  const [forgotEmail, setForgotEmail] = useState("");

  // Provisioning form
  const [adminName, setAdminName] = useState("");
  const [adminEmployeeId, setAdminEmployeeId] = useState("");
  const [adminDepartment, setAdminDepartment] = useState("");
  const [adminDescriptor, setAdminDescriptor] = useState<number[] | null>(null);
  const [adminResetKey, setAdminResetKey] = useState(0);
  const [adminConsent, setAdminConsent] = useState(false);

  function goToDashboard(role: Role) {
    navigate({ to: role === "administrator" ? "/admin" : "/staff", replace: true });
  }

  useEffect(() => {
    let active = true;
    (async () => {
      // Not signed in yet: getMyState rejects with Unauthorized — that is normal here.
      const [stateResult, provisioningResult] = await Promise.allSettled([
        getMyStateFn(),
        checkFirstAdministratorFn(),
      ]);
      if (!active) return;
      if (provisioningResult.status === "fulfilled") {
        setCanProvision(provisioningResult.value.canProvision);
      }
      if (stateResult.status === "rejected") return;
      const state = stateResult.value;
      if (state.hasProfile && state.verified && state.role) {
        goToDashboard(state.role);
        return;
      }
      if (!state.hasProfile) {
        await navigate({ to: "/enroll", replace: true });
        return;
      }
      setSignedInFaceCheck(true);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus({ tone: "muted", text: "Checking your details…" });
    try {
      const resolved = await resolveSignInEmailFn({
        data: { identifier: identifier.trim() },
      });
      if (!resolved.email) {
        setStatus({ tone: "error", text: "The login details could not be verified." });
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: resolved.email,
        password,
      });
      if (error) {
        setStatus({ tone: "error", text: "The login details could not be verified." });
        return;
      }

      if (!loginDescriptor) {
        setStatus({ tone: "error", text: "Capture your face to verify your sign-in." });
        return;
      }
      setStatus({ tone: "muted", text: "Verifying your face…" });
      const result = await verifyFaceFn({ data: { descriptor: loginDescriptor } });
      if (!result.ok) {
        if (result.code === "no-profile") {
          await navigate({ to: "/enroll", replace: true });
          return;
        }
        setStatus({ tone: "error", text: result.error });
        setLoginDescriptor(null);
        setLoginResetKey((k) => k + 1);
        return;
      }
      setStatus({ tone: "success", text: "Identity verified." });
      goToDashboard(result.role);
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Sign-in failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus({ tone: "muted", text: "Creating your account…" });
    try {
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail.trim().toLowerCase(),
        password: signupPassword,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) {
        setStatus({ tone: "error", text: error.message });
        return;
      }
      if (data.session) {
        await navigate({ to: "/enroll", replace: true });
        return;
      }
      setStatus({
        tone: "success",
        text: "Account created. Check your email for a confirmation link, then sign in to finish setting up your face template.",
      });
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Sign-up failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus({ tone: "muted", text: "Sending the reset link…" });
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setStatus({ tone: "error", text: error.message });
        return;
      }
      setStatus({ tone: "success", text: "Password reset email sent. Check your inbox." });
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not send the reset email.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleProvision(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!adminDescriptor) {
      setStatus({ tone: "error", text: "Capture your face to enroll facial verification." });
      return;
    }
    setBusy(true);
    setStatus({ tone: "muted", text: "Creating the administrator account…" });
    try {
      const result = await provisionAdministratorFn({
        data: {
          fullName: adminName,
          employeeId: adminEmployeeId,
          email: signupEmail || identifier,
          password: signupPassword || password,
          department: adminDepartment,
          descriptor: adminDescriptor,
          consent: adminConsent,
        },
      });
      if (!result.ok) {
        setStatus({ tone: "error", text: result.error });
        setAdminDescriptor(null);
        setAdminResetKey((k) => k + 1);
        return;
      }
      setStatus({
        tone: "success",
        text: "Administrator account created. Sign in with your new details and your enrolled face.",
      });
      setMode("signIn");
      setIdentifier(result.email);
      setCanProvision(false);
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Provisioning failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (signedInFaceCheck) {
    return (
      <SignedInFaceCheck
        onVerified={(role) => goToDashboard(role)}
        onSignOut={async () => {
          await supabase.auth.signOut();
          setSignedInFaceCheck(false);
        }}
      />
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="grid min-h-screen lg:grid-cols-[1fr_1.15fr]">
        {/* Brand panel */}
        <section className="brand-panel relative hidden flex-col justify-between p-10 lg:flex">
          <div className="flex items-center gap-4">
            <span className="logo-badge">D</span>
            <div>
              <p className="eyebrow">Audu Bako Secretariat</p>
              <h1 className="text-xl font-semibold text-white">Digital Sign-In Auditor</h1>
            </div>
          </div>
          <div className="max-w-md">
            <h2 className="text-3xl font-semibold leading-snug text-white">
              Verified sign-in, timestamped audit trail, attendance reporting.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/70">
              Secure attendance control and identity verification for staff and visitors. Every
              sign-in is confirmed with your password and your enrolled face.
            </p>
            <ul className="mt-8 grid gap-3 text-sm font-medium text-white/85">
              <li className="flex items-center gap-3">
                <span className="inline-block h-1.5 w-6 rounded-full bg-gold" />
                Facial-verified sign-in
              </li>
              <li className="flex items-center gap-3">
                <span className="inline-block h-1.5 w-6 rounded-full bg-gold" />
                Timestamped audit trail
              </li>
              <li className="flex items-center gap-3">
                <span className="inline-block h-1.5 w-6 rounded-full bg-gold" />
                Attendance reporting
              </li>
            </ul>
          </div>
          <p className="text-xs text-white/50">
            This is a student-project prototype, not a production biometric system.
          </p>
        </section>

        {/* Form panel */}
        <section className="flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <span className="logo-badge">D</span>
              <div>
                <p className="eyebrow">Audu Bako Secretariat</p>
                <h1 className="text-lg font-semibold">Digital Sign-In Auditor</h1>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted p-1">
              {(["signIn", "signUp"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={
                    mode === value
                      ? "rounded-lg bg-card px-3 py-2 text-sm font-semibold shadow-sm"
                      : "rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground"
                  }
                  onClick={() => {
                    setMode(value);
                    setStatus(null);
                  }}
                >
                  {value === "signIn" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>

            {mode === "signIn" ? (
              <form className="grid gap-4" onSubmit={handleSignIn}>
                <div>
                  <p className="eyebrow">Welcome back</p>
                  <h2 className="text-2xl font-semibold">Access your dashboard</h2>
                </div>
                <div>
                  <label className="field-label" htmlFor="identifier">
                    Staff ID / Email
                  </label>
                  <input
                    id="identifier"
                    className="field-input"
                    type="text"
                    autoComplete="username"
                    placeholder="Enter staff ID or email"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    className="field-input"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <span className="field-label">Facial verification</span>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Capture your face to verify your sign-in.
                  </p>
                  <CameraCapture
                    onCaptured={(value) => setLoginDescriptor(value)}
                    resetKey={loginResetKey}
                    compact
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    className="text-muted-foreground underline-offset-4 hover:underline"
                    onClick={() => {
                      setMode("forgot");
                      setStatus(null);
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? "Please wait…" : "Login"}
                </button>
                <StatusLine status={status} />
                {canProvision ? (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                    onClick={() => {
                      setMode("provision");
                      setStatus(null);
                    }}
                  >
                    Provision the first administrator account
                  </button>
                ) : null}
              </form>
            ) : null}

            {mode === "signUp" ? (
              <form className="grid gap-4" onSubmit={handleSignUp}>
                <div>
                  <p className="eyebrow">Create account</p>
                  <h2 className="text-2xl font-semibold">Register as staff</h2>
                </div>
                <div>
                  <label className="field-label" htmlFor="signupEmail">
                    Email
                  </label>
                  <input
                    id="signupEmail"
                    className="field-input"
                    type="email"
                    autoComplete="email"
                    placeholder="name@secretariat.gov"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="signupPassword">
                    Password
                  </label>
                  <input
                    id="signupPassword"
                    className="field-input"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Create password (10+ characters)"
                    minLength={10}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <span className="field-label">Facial verification</span>
                  <p className="mb-2 text-xs text-muted-foreground">
                    After confirming your email you will finish setup on the enrollment page: your
                    name, employee ID, department, and an encrypted face template. The original
                    image is never stored.
                  </p>
                </div>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? "Please wait…" : "Create account"}
                </button>
                <StatusLine status={status} />
              </form>
            ) : null}

            {mode === "forgot" ? (
              <form className="grid gap-4" onSubmit={handleForgot}>
                <div>
                  <p className="eyebrow">Password reset</p>
                  <h2 className="text-2xl font-semibold">Send a reset link</h2>
                </div>
                <div>
                  <label className="field-label" htmlFor="forgotEmail">
                    Email
                  </label>
                  <input
                    id="forgotEmail"
                    className="field-input"
                    type="email"
                    autoComplete="email"
                    placeholder="name@secretariat.gov"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? "Please wait…" : "Send reset link"}
                </button>
                <StatusLine status={status} />
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => {
                    setMode("signIn");
                    setStatus(null);
                  }}
                >
                  Back to sign in
                </button>
              </form>
            ) : null}

            {mode === "provision" ? (
              <form className="grid gap-4" onSubmit={handleProvision}>
                <div>
                  <p className="eyebrow">Protected setup</p>
                  <h2 className="text-2xl font-semibold">Provision first administrator</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Available only while the secretariat has no administrator account.
                    Administrator access is never self-service afterwards.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="field-label" htmlFor="adminName">
                      Full name
                    </label>
                    <input
                      id="adminName"
                      className="field-input"
                      type="text"
                      placeholder="Enter full name"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="adminEmployeeId">
                      Employee ID
                    </label>
                    <input
                      id="adminEmployeeId"
                      className="field-input"
                      type="text"
                      placeholder="Enter employee ID"
                      value={adminEmployeeId}
                      onChange={(e) => setAdminEmployeeId(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="field-label" htmlFor="adminEmail">
                    Email
                  </label>
                  <input
                    id="adminEmail"
                    className="field-input"
                    type="email"
                    placeholder="admin@secretariat.gov"
                    value={signupEmail || identifier}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="adminPassword">
                    Password
                  </label>
                  <input
                    id="adminPassword"
                    className="field-input"
                    type="password"
                    placeholder="Create password (10+ characters)"
                    minLength={10}
                    value={signupPassword || password}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="adminDepartment">
                    Department
                  </label>
                  <input
                    id="adminDepartment"
                    className="field-input"
                    type="text"
                    placeholder="Department / Unit"
                    value={adminDepartment}
                    onChange={(e) => setAdminDepartment(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <span className="field-label">Facial verification</span>
                  <CameraCapture
                    onCaptured={(value) => setAdminDescriptor(value)}
                    resetKey={adminResetKey}
                    compact
                  />
                </div>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={adminConsent}
                    onChange={(e) => setAdminConsent(e.target.checked)}
                    required
                  />
                  <span>
                    I consent to facial verification and encrypted storage of my face template for
                    account verification.
                  </span>
                </label>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? "Please wait…" : "Create administrator account"}
                </button>
                <StatusLine status={status} />
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => {
                    setMode("signIn");
                    setStatus(null);
                  }}
                >
                  Back to sign in
                </button>
              </form>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p
      className={
        status.tone === "error"
          ? "status-error"
          : status.tone === "success"
            ? "status-success"
            : "status-message"
      }
      role="status"
      aria-live="polite"
    >
      {status.text}
    </p>
  );
}

function SignedInFaceCheck({
  onVerified,
  onSignOut,
}: {
  onVerified: (role: Role, name: string) => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="grid w-full max-w-xl justify-items-center gap-6">
        <div className="flex items-center gap-3">
          <span className="logo-badge">D</span>
          <div>
            <p className="eyebrow">Audu Bako Secretariat</p>
            <h1 className="text-lg font-semibold">Digital Sign-In Auditor</h1>
          </div>
        </div>
        <FaceVerifyPanel
          heading="Verify your face to continue"
          description="You are signed in, but this session still needs facial verification before your dashboard opens."
          onVerified={onVerified}
        />
        <button type="button" className="btn-logout" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
