import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getServerAuth, getServerFirestore } from "@/lib/server/firebase-admin";
import { BlenderSyncError } from "@/lib/setup-designer/blender-sync";

export function validSetupId(value: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new BlenderSyncError("invalid_setup", "Invalid setup ID.", 400);
}
export async function verifyBlenderActor(uid: string) {
  const user = await getServerAuth().getUser(uid);
  const emails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase());
  if (user.disabled || !user.email || !emails.includes(user.email.toLowerCase())) throw new BlenderSyncError("permission", "Administrator access is required.", 403);
  return user.uid;
}
export async function requirePairingAdmin(request: Request) {
  const match = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "");
  if (!match) throw new BlenderSyncError("authentication", "Sign in to connect Blender.", 401);
  try {
    const decoded = await getServerAuth().verifyIdToken(match[1], true);
    return await verifyBlenderActor(decoded.uid);
  } catch (error) {
    if (error instanceof BlenderSyncError) throw error;
    throw new BlenderSyncError("authentication", "Your sign-in expired. Sign in again.", 401);
  }
}
export async function issueBlenderSession(uid: string, setupId: string, allowDefinitions: boolean) {
  validSetupId(setupId);
  await verifyBlenderActor(uid);
  const db = getServerFirestore();
  const setup = await db.doc(`setups/${setupId}`).get();
  if (!setup.exists || setup.data()?.status === "archived") throw new BlenderSyncError("missing_setup", "Setup not found.", 404);
  const sessionId = randomBytes(16).toString("hex"), secret = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  await db.doc(`blenderSyncSessions/${sessionId}`).create({ uid, setupId, allowDefinitions, expiresAt, revoked: false, createdAt: Date.now(), secretHash: createHash("sha256").update(secret).digest("hex") });
  return { sessionId, token: `${sessionId}.${secret}`, expiresAt };
}
export async function requireBlenderSession(request: Request, setupId: string) {
  validSetupId(setupId);
  const match = /^Swell ([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(request.headers.get("authorization") ?? "");
  if (!match) throw new BlenderSyncError("authentication", "Connect Blender from the setup page.", 401);
  const reference = getServerFirestore().doc(`blenderSyncSessions/${match[1]}`);
  const session = (await reference.get()).data();
  const supplied = createHash("sha256").update(match[2]).digest();
  const expected = Buffer.from(typeof session?.secretHash === "string" ? session.secretHash : "", "hex");
  if (!session || expected.length !== supplied.length || !timingSafeEqual(expected, supplied) || session.revoked || session.expiresAt <= Date.now()) throw new BlenderSyncError("authentication", "Connection expired or revoked. Reconnect from the website.", 401);
  if (session.setupId !== setupId) throw new BlenderSyncError("permission", "Connection belongs to another setup.", 403);
  await verifyBlenderActor(session.uid);
  return { uid: String(session.uid), allowDefinitions: session.allowDefinitions === true, reference };
}
