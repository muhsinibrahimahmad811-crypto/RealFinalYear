import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { verifyFace, type Role } from "@/lib/attendance-server";
import { CameraCapture } from "@/components/CameraCapture";

type FaceVerifyPanelProps = {
  heading: string;
  description: string;
  onVerified: (role: Role, name: string) => void;
};

/** Inline face re-verification for an already signed-in user. */
export function FaceVerifyPanel({ heading, description, onVerified }: FaceVerifyPanelProps) {
  const verifyFaceFn = useServerFn(verifyFace);
  const [descriptor, setDescriptor] = useState<number[] | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "muted" | "error" | "success"; text: string }>({
    tone: "muted",
    text: "Face verification required.",
  });

  async function handleVerify() {
    if (!descriptor) {
      setStatus({ tone: "error", text: "Capture your face first." });
      return;
    }
    setBusy(true);
    setStatus({ tone: "muted", text: "Verifying your face…" });
    try {
      const result = await verifyFaceFn({ data: { descriptor } });
      if (!result.ok) {
        setStatus({ tone: "error", text: result.error });
        setDescriptor(null);
        setResetKey((k) => k + 1);
        return;
      }
      setStatus({ tone: "success", text: "Identity verified." });
      onVerified(result.role, result.name);
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Verification failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-card max-w-xl">
      <p className="eyebrow">Identity check</p>
      <h3 className="mt-1 text-lg font-semibold">{heading}</h3>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">{description}</p>
      <CameraCapture
        onCaptured={(value) => setDescriptor(value)}
        resetKey={resetKey}
        compact
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary max-w-56" onClick={handleVerify} disabled={busy}>
          {busy ? "Verifying…" : "Verify my face"}
        </button>
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
      </div>
    </section>
  );
}
