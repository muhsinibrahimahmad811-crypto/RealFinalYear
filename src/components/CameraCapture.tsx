import { useEffect, useRef, useState } from "react";
import { extractFaceDescriptor } from "@/lib/face-client";

type CameraState = "idle" | "starting" | "ready" | "capturing" | "captured";

type CameraCaptureProps = {
  onCaptured: (descriptor: number[]) => void;
  /** Change this value to clear a previously captured face. */
  resetKey?: number;
  compact?: boolean;
};

export function CameraCapture({ onCaptured, resetKey = 0, compact = false }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>("idle");
  const [status, setStatus] = useState<{ tone: "muted" | "error" | "success"; text: string }>({
    tone: "muted",
    text: "No face captured.",
  });

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    if (resetKey > 0) {
      stopCamera();
      setState("idle");
      setStatus({ tone: "muted", text: "No face captured." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus({
        tone: "error",
        text: "Camera access requires HTTPS or localhost and a supported browser.",
      });
      return;
    }
    setState("starting");
    setStatus({ tone: "muted", text: "Requesting camera permission…" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setState("ready");
      setStatus({ tone: "muted", text: "Camera ready. Position your face and capture." });
    } catch (error) {
      setState("idle");
      setStatus({
        tone: "error",
        text:
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in your browser settings."
            : "Could not start the camera. Check that it is connected and not in use by another app.",
      });
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || state !== "ready") return;
    setState("capturing");
    setStatus({ tone: "muted", text: "Reading your face…" });
    try {
      const descriptor = await extractFaceDescriptor(video);
      stopCamera();
      setState("captured");
      setStatus({ tone: "success", text: "Face captured." });
      onCaptured(descriptor);
    } catch (error) {
      setState("ready");
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not read your face.",
      });
    }
  }

  function stop() {
    stopCamera();
    setState("idle");
    setStatus({ tone: "muted", text: "No face captured." });
  }

  return (
    <div className="camera-panel">
      <video
        ref={videoRef}
        className={state === "ready" || state === "capturing" ? "camera-video" : "hidden"}
        autoPlay
        muted
        playsInline
      />
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
      <div className="flex flex-wrap gap-2">
        {state === "idle" || state === "starting" ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={start}
            disabled={state === "starting"}
          >
            Open camera
          </button>
        ) : null}
        {state === "ready" || state === "capturing" ? (
          <button
            type="button"
            className="btn-secondary btn-gold"
            onClick={capture}
            disabled={state === "capturing"}
          >
            {state === "capturing" ? "Capturing…" : "Capture face"}
          </button>
        ) : null}
        {state === "ready" || state === "capturing" ? (
          <button type="button" className="btn-secondary" onClick={stop}>
            Stop camera
          </button>
        ) : null}
        {state === "captured" ? (
          <button type="button" className="btn-secondary" onClick={stop}>
            Recapture face
          </button>
        ) : null}
      </div>
      {compact ? null : (
        <p className="text-xs text-muted-foreground">
          Your camera frame is used to create an encrypted face template. The original image is
          never stored.
        </p>
      )}
    </div>
  );
}
