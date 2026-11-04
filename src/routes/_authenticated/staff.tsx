import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getMyState, staffAttendance, staffSignIn, staffSignOut, type MyState } from "@/lib/attendance-server";
import { DashboardShell } from "@/components/DashboardShell";
import { FaceVerifyPanel } from "@/components/FaceVerifyPanel";
import { formatTimestamp, signOutCompletely } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({
    meta: [
      { title: "Staff attendance — Digital Sign-In Auditor" },
      {
        name: "description",
        content: "Record the start and end of your workday and review your recent attendance.",
      },
      { property: "og:title", content: "Staff attendance — Digital Sign-In Auditor" },
      {
        property: "og:description",
        content: "Record the start and end of your workday and review your recent attendance.",
      },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StaffPage,
});

function StaffPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const getMyStateFn = useServerFn(getMyState);
  const staffAttendanceFn = useServerFn(staffAttendance);
  const staffSignInFn = useServerFn(staffSignIn);
  const staffSignOutFn = useServerFn(staffSignOut);

  const [signOutBusy, setSignOutBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "muted" | "error" | "success"; text: string } | null>(
    null,
  );

  const stateQuery = useQuery({
    queryKey: ["my-state"],
    queryFn: () => getMyStateFn(),
  });

  const state: MyState | undefined = stateQuery.data;

  const attendanceQuery = useQuery({
    queryKey: ["staff-attendance"],
    queryFn: () => staffAttendanceFn(),
    enabled: !!state?.hasProfile && state.verified,
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["staff-attendance"] });
    await queryClient.invalidateQueries({ queryKey: ["my-state"] });
  }

  async function recordAttendance(action: "sign-in" | "sign-out") {
    setActionBusy(true);
    setMessage({ tone: "muted", text: "Saving attendance…" });
    try {
      const result = action === "sign-in" ? await staffSignInFn() : await staffSignOutFn();
      if (!result.ok) {
        if (result.code === "reverify") {
          await queryClient.invalidateQueries({ queryKey: ["my-state"] });
        }
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setMessage({ tone: "success", text: result.message });
      await refresh();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not update attendance.",
      });
    } finally {
      setActionBusy(false);
    }
  }

  if (stateQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="status-message">Loading your attendance…</p>
      </div>
    );
  }

  if (stateQuery.isError || !state?.signedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="status-error">Your session has ended. Sign in again from the home page.</p>
      </div>
    );
  }

  if (!state.hasProfile) {
    return <RedirectToEnroll />;
  }

  // Mirror of the original server behavior: non-staff roles never see this page.
  if (state.role !== "staff") {
    return <RedirectToDashboard />;
  }

  async function handleSignOut() {
    setSignOutBusy(true);
    await signOutCompletely(queryClient, (options) => navigate(options as never));
    setSignOutBusy(false);
    router.invalidate();
  }

  if (!state.verified) {
    return (
      <DashboardShell name={state.name} intro="Staff portal" onSignOut={handleSignOut} signOutBusy={signOutBusy}>
        <FaceVerifyPanel
          heading="Verify your face to continue"
          description="Facial verification is required before your attendance controls unlock."
          onVerified={async () => {
            await refresh();
          }}
        />
      </DashboardShell>
    );
  }

  const data = attendanceQuery.data;
  const active = data?.ok ? data.active : null;

  return (
    <DashboardShell name={state.name} intro="Staff portal" onSignOut={handleSignOut} signOutBusy={signOutBusy}>
      <p className="-mt-3 text-sm text-muted-foreground">Record the start and end of your workday.</p>

      <section className="panel-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Today's attendance</p>
            <h3 className="mt-1 text-lg font-semibold">Attendance status</h3>
            <p className="mt-2 text-sm font-medium text-foreground" aria-live="polite">
              {data?.ok ? (active ? "You are currently signed in." : "You are currently signed out.") : "Checking your status…"}
            </p>
            {data?.ok && active ? (
              <p className="text-sm text-muted-foreground">
                Signed in at {formatTimestamp(active.signInAt)}
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            {!active ? (
              <button
                type="button"
                className="btn-primary w-auto"
                disabled={actionBusy}
                onClick={() => recordAttendance("sign-in")}
              >
                Sign in
              </button>
            ) : null}
            {active ? (
              <button
                type="button"
                className="btn-primary btn-gold w-auto"
                disabled={actionBusy}
                onClick={() => recordAttendance("sign-out")}
              >
                Sign out for today
              </button>
            ) : null}
          </div>
        </div>
        {message ? (
          <p
            className={
              message.tone === "error"
                ? "status-error mt-4"
                : message.tone === "success"
                  ? "status-success mt-4"
                  : "status-message mt-4"
            }
            role="status"
            aria-live="polite"
          >
            {message.text}
          </p>
        ) : null}
      </section>

      <section className="panel-card">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Personal record</p>
            <h3 className="mt-1 text-lg font-semibold">Recent attendance</h3>
          </div>
        </div>
        {data?.ok && data.records.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sign-in</th>
                  <th>Sign-out</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((record) => (
                  <tr key={record.id}>
                    <td>{formatTimestamp(record.signInAt)}</td>
                    <td>{formatTimestamp(record.signOutAt)}</td>
                    <td>{record.signOutAt ? "Complete" : "In progress"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="status-message">No attendance records yet. Sign in to record your first day.</p>
        )}
      </section>
    </DashboardShell>
  );
}

function RedirectToEnroll() {
  const navigate = useNavigate();
  if (typeof window !== "undefined") {
    void navigate({ to: "/enroll", replace: true });
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="status-message">Opening account setup…</p>
    </div>
  );
}

function RedirectToDashboard() {
  const navigate = useNavigate();
  if (typeof window !== "undefined") {
    void navigate({ to: "/admin", replace: true });
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="status-message">Opening your dashboard…</p>
    </div>
  );
}
