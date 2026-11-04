import type { ReactNode } from "react";

type DashboardShellProps = {
  name: string | null;
  intro: string;
  onSignOut: () => void;
  signOutBusy?: boolean;
  children: ReactNode;
};

export function DashboardShell({ name, intro, onSignOut, signOutBusy, children }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="logo-badge">D</span>
            <div>
              <p className="eyebrow">Audu Bako Secretariat</p>
              <h1 className="text-lg font-semibold">Digital Sign-In Auditor</h1>
            </div>
          </div>
          <button type="button" className="btn-logout" onClick={onSignOut} disabled={signOutBusy}>
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <p className="eyebrow">{intro}</p>
        <h2 className="mt-1 text-2xl font-semibold">
          {name ? `Welcome, ${name}` : "Loading your dashboard…"}
        </h2>
        <div className="mt-6 grid gap-6">{children}</div>
      </main>
    </div>
  );
}
