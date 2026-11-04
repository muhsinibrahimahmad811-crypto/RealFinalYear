import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Digital Sign-In Auditor" },
      {
        name: "description",
        content: "Choose a new password for your Digital Sign-In Auditor account.",
      },
      { property: "og:title", content: "Set a new password — Digital Sign-In Auditor" },
      {
        property: "og:description",
        content: "Choose a new password for your Digital Sign-In Auditor account.",
      },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "muted" | "error" | "success"; text: string } | null>(
    null,
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus({ tone: "muted", text: "Updating your password…" });
    try {
      // Recovery sessions are exempt from the current-password requirement.
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setStatus({ tone: "error", text: error.message });
        return;
      }
      setStatus({ tone: "success", text: "Password updated. Opening the sign-in page…" });
      setTimeout(() => void navigate({ to: "/", replace: true }), 1200);
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not update the password.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="logo-badge">D</span>
          <div>
            <p className="eyebrow">Audu Bako Secretariat</p>
            <h1 className="text-lg font-semibold">Digital Sign-In Auditor</h1>
          </div>
        </div>
        <section className="panel-card">
          <p className="eyebrow">Password reset</p>
          <h2 className="mt-1 text-2xl font-semibold">Set a new password</h2>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            Opened from the password reset email. Choose a password of at least 10 characters.
          </p>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div>
              <label className="field-label" htmlFor="newPassword">
                New password
              </label>
              <input
                id="newPassword"
                className="field-input"
                type="password"
                autoComplete="new-password"
                placeholder="Enter a new password"
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Please wait…" : "Update password"}
            </button>
            {status ? (
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
            ) : null}
          </form>
        </section>
      </div>
    </div>
  );
}
