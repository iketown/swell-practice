import { canonicalizeAssetTag } from "@/lib/gear/domain";

const GEAR_PATH = /^\/g\/([^/?#]+)\/?$/i;

function canonicalizePathTag(value: string) {
  try {
    return canonicalizeAssetTag(decodeURIComponent(value));
  } catch {
    return "";
  }
}

export function assetTagFromScannedValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const pathMatch = trimmed.match(GEAR_PATH);
  if (pathMatch) {
    return canonicalizePathTag(pathMatch[1]);
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const match = url.pathname.match(GEAR_PATH);
      return match ? canonicalizePathTag(match[1]) : "";
    } catch {
      return "";
    }
  }

  return canonicalizeAssetTag(trimmed);
}

export function cameraAccessErrorMessage(error: unknown) {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Camera access requires HTTPS. Open the deployed site, or use localhost while developing.";
  }

  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was blocked. Allow camera access in your browser settings, or enter asset tags manually.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No rear camera was available. Try another camera or enter asset tags manually.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The camera is busy or unavailable. Close other camera apps, then try again.";
  }
  return error instanceof Error
    ? error.message
    : "The camera could not start. You can still enter asset tags manually.";
}
