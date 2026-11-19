import { NextResponse } from "next/server";
import { boundedJson, blenderError } from "@/lib/server/blender-api";
import { requireBlenderSession } from "@/lib/server/blender-auth";
import { commitBlenderPatch, readBlenderSnapshot } from "@/lib/server/blender-store";
import { BlenderPatchSchema } from "@/lib/setup-designer/blender-contract";
import { BlenderSyncError } from "@/lib/setup-designer/blender-sync";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ setupId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { setupId } = await context.params; await requireBlenderSession(request, setupId);
    return NextResponse.json(await readBlenderSnapshot(setupId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return blenderError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const { setupId } = await context.params, access = await requireBlenderSession(request, setupId);
    const parsed = BlenderPatchSchema.safeParse(await boundedJson(request));
    if (!parsed.success || parsed.data.setupId !== setupId) throw new BlenderSyncError("invalid_request", "Invalid equipment patch or setup mismatch.", 400);
    return NextResponse.json(await commitBlenderPatch(parsed.data, access), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return blenderError(error); }
}
