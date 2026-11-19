import { NextResponse } from "next/server";
import { BlenderSyncError } from "@/lib/setup-designer/blender-sync";
export async function boundedJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new BlenderSyncError("invalid_request", "JSON body is required.", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 256 * 1024) { await reader.cancel(); throw new BlenderSyncError("too_large", "Request is too large.", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new BlenderSyncError("invalid_request", "Invalid JSON.", 400); }
}
export function blenderError(error: unknown) {
  if (error instanceof BlenderSyncError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  console.error("Blender operation failed", error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json({ error: { code: "server_error", message: "Sync failed. Your local changes are retained; try again." } }, { status: 500 });
}
