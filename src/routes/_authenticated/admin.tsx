import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminAttendance, adminUsers, getMyState, type MyState } from "@/lib/attendance-server";
import { DashboardShell } from "@/components/DashboardShell";
import { FaceVerifyPanel } from "@/components/FaceVerifyPanel";
import { formatTimestamp, signOutCompletely } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administration — Digital Sign-In Auditor" },
      {
        name: "description",
        content: "Review staff accounts and attendance activity for the Audu Bako Secretariat.",
      },
      { property: "og:title", content: "Administration — Digital Sign-In Auditor" },
      {
        property: "og:description",
        content: "Review staff accounts and attendance activity for the Audu Bako Secretariat.",
      },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getMyStateFn = useServerFn(getMyState);
  const adminUsersFn = useServerFn(adminUsers);
  const adminAttendanceFn = useServerFn(adminAttendance);

  const [signOutBusy, setSignOutBusy] = useState(false);

  const stateQuery = useQuery({
    queryKey: ["my-state"],
    queryFn: () => getMyStateFn(),
  });
  const state: MyState | undefined = stateQuery.data;

  const enabled = !!state?.hasProfile && state.verified;

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminUsersFn(),
    enabled,
  });
  const attendanceQuery = useQuery({
    queryKey: ["admin-attendance"],
    queryFn: () => adminAttendanceFn(),
    enabled,
  });

  async function handleSignOut() {
    setSignOutBusy(true);
    await signOutCompletely(queryClient, (options) => navigate(options as never));
    setSignOutBusy(false);
  }

  if (stateQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="status-message">Loading your dashboard…</p>
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

  if (!state.hasProfile || state.role !== "administrator") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="status-error">Administrator access is required.</p>
      </div>
    );
  }

  if (!state.verified) {
    return (
      <DashboardShell name={state.name} intro="Administrator portal" onSignOut={handleSignOut} signOutBusy={signOutBusy}>
        <FaceVerifyPanel
          heading="Verify your face to continue"
          description="Facial verification is required before the administrator dashboard unlocks."
          onVerified={async () => {
            await queryClient.invalidateQueries({ queryKey: ["my-state"] });
          }}
        />
      </DashboardShell>
    );
  }

  const users = usersQuery.data?.ok ? usersQuery.data.users : null;
  const records = attendanceQuery.data?.ok ? attendanceQuery.data.records : null;

  return (
    <DashboardShell name={state.name} intro="Administrator portal" onSignOut={handleSignOut} signOutBusy={signOutBusy}>
      <p className="-mt-3 text-sm text-muted-foreground">Review staff accounts and attendance activity.</p>

      <section className="panel-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Account management</p>
            <h3 className="mt-1 text-lg font-semibold">Registered accounts</h3>
          </div>
          <span className="pill-count">{users ? `${users.length} accounts` : "— accounts"}</span>
        </div>
        {users && users.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Employee ID</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.employeeId}>
                    <td>{user.fullName}</td>
                    <td>{user.employeeId}</td>
                    <td>{user.email}</td>
                    <td>{user.department}</td>
                    <td className="capitalize">{user.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="status-message">
            {usersQuery.isLoading ? "Loading accounts…" : "No accounts have been registered yet."}
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Showing up to 200 most recently created accounts.</p>
      </section>

      <section className="panel-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Attendance monitoring</p>
            <h3 className="mt-1 text-lg font-semibold">Staff attendance records</h3>
          </div>
          <span className="pill-count">
            {records ? `${records.length} records` : "— records"}
          </span>
        </div>
        {records && records.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Employee ID</th>
                  <th>Department</th>
                  <th>Sign-in</th>
                  <th>Sign-out</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.fullName}</td>
                    <td>{record.employeeId}</td>
                    <td>{record.department}</td>
                    <td>{formatTimestamp(record.signInAt)}</td>
                    <td>{formatTimestamp(record.signOutAt)}</td>
                    <td>{record.signOutAt ? "Complete" : "In progress"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="status-message">
            {attendanceQuery.isLoading
              ? "Loading attendance…"
              : "No attendance records have been submitted yet."}
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Showing up to 200 most recent attendance records.</p>
      </section>
    </DashboardShell>
  );
}

