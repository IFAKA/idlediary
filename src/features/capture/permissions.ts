export type CameraPermissionState = "prompt" | "granted" | "denied" | "unsupported";

export async function getCameraPermissionState(): Promise<CameraPermissionState> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "unsupported";
  }

  if (!navigator.permissions?.query) {
    return "prompt";
  }

  try {
    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    if (status.state === "granted" || status.state === "denied") {
      return status.state;
    }
    return "prompt";
  } catch {
    return "prompt";
  }
}
