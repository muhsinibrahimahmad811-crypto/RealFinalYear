import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { enrollProfile } from "@/lib/attendance-server";
import { CameraCapture } from "@/components/CameraCapture";

export const Route = createFileRoute("/_authenticated/enroll")({
  head: () => ({
    meta: [
      { title: "Set up your account — Digital Sign-In Auditor" },
      {
        name: "description",
        content:
          "Finish setting up your staff account: name, employee ID, department, and an encrypted face template.",
      },
      { property: "og:title", content: "Set up your account — Digital Sign-In Auditor" },
      {
        property: "og:description",
        content: "Finish setting up your staff account with an encrypted face template.",
      },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EnrollPage,
});

function EnrollPage() {
  const navigate = useNavigate();
  const enrollProfileFn = useServerFn(enrollProfile);

  const [fullName, setFullName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [department, setDepartment] = useState("");
  const [descriptor, setDescriptor] = useState<number[] | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "muted" | "error" | "success"; text: string } | null>(
    null,
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!descriptor) {
      setStatus({ tone: "error", text: "Capture your face to enroll facial verification." });
      return;
    }
    setBusy(true);
    setStatus({ tone: "muted", text: "Saving your enrollment…" });
    try {
      const result = await enrollProfileFn({
        data: { fullName, employeeId, department, descriptor, consent },
      });
      if (!result.ok) {
        setStatus({ tone: "error", text: result.error });
        setDescriptor(null);
        setResetKey((k) => k + 1);
        return;
      }
      setStatus({ tone: "success", text: "Account ready. Opening your attendance dashboard…" });
      await navigate({ to: "/staff", replace: true });
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Enrollment failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-8 flex items-center gap-3">
          <span className="logo-badge">D</span>
          <div>
            <p className="eyebrow">Audu Bako Secretariat</p>
            <h1 className="text-lg font-semibold">Digital Sign-In Auditor</h1>
          </div>
        </div>
        <section className="panel-card">
          <p className="eyebrow">Create account</p>
          <h2 className="mt-1 text-2xl font-semibold">Finish setting up your account</h2>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            New self-service accounts are registered as staff. Administrator accounts are
            provisioned separately by an authorized administrator.
          </p>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="fullName">
                  Full name
                </label>
                <input
                  id="fullName"
                  className="field-input"
                  type="text"
                  placeholder="Enter full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="employeeId">
                  Employee ID
                </label>
                <input
                  id="employeeId"
                  className="field-input"
                  type="text"
                  placeholder="Enter employee ID"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="department">
                Department
              </label>
              <input
                id="department"
                className="field-input"
                type="text"
                placeholder="Department / Unit"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                required
              />
            </div>
            <div>
              <span className="field-label">Facial verification</span>
              <p className="mb-2 text-xs text-muted-foreground">
                Your camera frame is used to create an encrypted face template. The original image
                is not stored.
              </p>
              <CameraCapture
                onCaptured={(value) => setDescriptor(value)}
                resetKey={resetKey}
                compact
              />
            </div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                required
              />
              <span>
                I consent to facial verification and encrypted storage of my face template for
                account verification.
              </span>
            </label>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Please wait…" : "Create account"}
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
