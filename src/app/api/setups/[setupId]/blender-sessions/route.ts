import { NextResponse } from "next/server";
import { z } from "zod";
import { boundedJson, blenderError } from "@/lib/server/blender-api";
import { issueBlenderSession, requirePairingAdmin, validSetupId } from "@/lib/server/blender-auth";
import { getServerFirestore } from "@/lib/server/firebase-admin";
import { BlenderSyncError } from "@/lib/setup-designer/blender-sync";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ setupId: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const uid = await requirePairingAdmin(request), { setupId } = await context.params;
    const body = z.object({ allowDefinitions: z.boolean() }).strict().safeParse(await boundedJson(request));
    if (!body.success) throw new BlenderSyncError("invalid_request", "Choose whether dimension corrections are allowed.", 400);
    return NextResponse.json(await issueBlenderSession(uid, setupId, body.data.allowDefinitions), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return blenderError(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const uid = await requirePairingAdmin(request), { setupId } = await context.params; validSetupId(setupId);
    const body = z.object({ sessionId: z.string().regex(/^[a-f0-9]{32}$/) }).strict().safeParse(await boundedJson(request));
    if (!body.success) throw new BlenderSyncError("invalid_request", "Invalid connection.", 400);
    const ref = getServerFirestore().doc(`blenderSyncSessions/${body.data.sessionId}`), session = (await ref.get()).data();
    if (!session || session.uid !== uid || session.setupId !== setupId) throw new BlenderSyncError("permission", "Connection is not yours.", 403);
    await ref.update({ revoked: true });
    return NextResponse.json({ ok: true });
  } catch (error) { return blenderError(error); }
}
