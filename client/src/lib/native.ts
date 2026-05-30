import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform(); // "android" | "ios" | "web"

// ── API URL ───────────────────────────────────────────────────────────────────
// Native apps can't use a relative URL — they have no server at localhost.
export const TRPC_URL = isNative()
  ? "https://app.inspectrafire.ca/api/trpc"
  : "/api/trpc";

// ── Camera ────────────────────────────────────────────────────────────────────
export async function takePhoto(): Promise<{ base64: string; mimeType: string } | null> {
  if (!isNative()) return null;
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  const photo = await Camera.getPhoto({
    quality: 85,
    allowEditing: false,
    resultType: CameraResultType.Base64,
    source: CameraSource.Camera,
    saveToGallery: false,
  });
  if (!photo.base64String) return null;
  return { base64: photo.base64String, mimeType: `image/${photo.format ?? "jpeg"}` };
}

// ── Haptics ───────────────────────────────────────────────────────────────────
export async function vibrate(style: "light" | "medium" | "heavy" = "medium") {
  if (!isNative()) return;
  const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
  const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
  await Haptics.impact({ style: map[style] });
}

export async function vibrateSuccess() {
  if (!isNative()) return;
  const { Haptics, NotificationType } = await import("@capacitor/haptics");
  await Haptics.notification({ type: NotificationType.Success });
}

export async function vibrateError() {
  if (!isNative()) return;
  const { Haptics, NotificationType } = await import("@capacitor/haptics");
  await Haptics.notification({ type: NotificationType.Error });
}

// ── Network ───────────────────────────────────────────────────────────────────
export async function getIsOnline(): Promise<boolean> {
  if (!isNative()) return navigator.onLine;
  const { Network } = await import("@capacitor/network");
  const status = await Network.getStatus();
  return status.connected;
}

export function listenToNetwork(callback: (online: boolean) => void): () => void {
  if (!isNative()) {
    const on = () => callback(true);
    const off = () => callback(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }
  // Capacitor
  let handle: { remove: () => void } | null = null;
  import("@capacitor/network").then(({ Network }) => {
    Network.addListener("networkStatusChange", (status) => callback(status.connected)).then(
      (h) => { handle = h; }
    );
  });
  return () => { handle?.remove(); };
}
