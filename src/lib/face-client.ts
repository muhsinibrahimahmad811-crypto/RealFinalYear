// Browser-side face descriptor extraction using @vladmandic/face-api.
// The library and its models are loaded lazily, in the browser only,
// the first time a face capture is requested. The server stores the
// resulting 128-number descriptor, never the camera image.

const FACE_API_MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";

type FaceApiModule = typeof import("@vladmandic/face-api");

let loadPromise: Promise<FaceApiModule> | null = null;

async function loadFaceApi(): Promise<FaceApiModule> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL),
      ]);
      return faceapi;
    })().catch((error: unknown) => {
      loadPromise = null;
      throw error;
    });
  }
  return loadPromise;
}

export const FACE_DESCRIPTOR_LENGTH = 128;

export async function extractFaceDescriptor(video: HTMLVideoElement): Promise<number[]> {
  const faceapi = await loadFaceApi();
  const detection = await faceapi
    .detectSingleFace(
      video,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }),
    )
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    throw new Error(
      "No clear face was detected. Face the camera in good lighting and try again.",
    );
  }

  const descriptor = Array.from(detection.descriptor);
  if (descriptor.length !== FACE_DESCRIPTOR_LENGTH) {
    throw new Error("The captured face could not be processed. Try again.");
  }
  return descriptor;
}
