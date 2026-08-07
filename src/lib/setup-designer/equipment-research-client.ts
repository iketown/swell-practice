"use client";

import { auth } from "@/lib/firebase";
import type { ImportedEquipmentDraft } from "@/lib/setup-designer/domain";

async function equipmentApiHeaders() {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : "";
  const demoMode = new URLSearchParams(window.location.search).get("demo") === "1";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (demoMode) headers["X-Swell-Demo"] = "1";
  return headers;
}

async function responseError(response: Response, fallback: string) {
  const payload: unknown = await response.json().catch(() => null);
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
    ? payload.error
    : fallback;
}

export async function researchEquipmentUrl(url: string) {
  const response = await fetch("/api/equipment/research", {
    body: JSON.stringify({ url }),
    headers: await equipmentApiHeaders(),
    method: "POST",
  });
  if (!response.ok) throw new Error(await responseError(response, "The product page could not be researched."));

  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || !("ports" in payload) || !Array.isArray(payload.ports)) {
    throw new Error("The product research response was not usable.");
  }
  return payload as ImportedEquipmentDraft;
}

export async function downloadEquipmentReferenceImages(urls: string[]) {
  const headers = await equipmentApiHeaders();
  const files: File[] = [];
  let failedCount = 0;

  for (const [index, url] of urls.entries()) {
    const response = await fetch("/api/equipment/research", {
      body: JSON.stringify({ imageUrl: url }),
      headers,
      method: "POST",
    });
    if (!response.ok) {
      failedCount += 1;
      continue;
    }
    const blob = await response.blob();
    const filename = filenameFromContentDisposition(response.headers.get("content-disposition"))
      ?? filenameFromUrl(url, `product-photo-${index + 1}.${extensionForContentType(blob.type)}`);
    files.push(new File([blob], filename, { type: blob.type }));
  }

  return { files, failedCount };
}

function filenameFromContentDisposition(value: string | null) {
  const match = value?.match(/filename="([^"]+)"/i);
  return match?.[1];
}

function filenameFromUrl(value: string, fallback: string) {
  try {
    const filename = new URL(value).pathname.split("/").filter(Boolean).pop();
    return filename && /\.(?:jpe?g|png|webp)$/i.test(filename) ? filename : fallback;
  } catch {
    return fallback;
  }
}

function extensionForContentType(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}
