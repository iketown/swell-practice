import { ServerRouteError } from "@/lib/server/admin-auth";
import {
  changeVersion,
  listVersions,
  listRevisions,
  readVersion,
} from "@/lib/server/stage-rider";
import {
  requireRiderAdmin,
  riderFailure,
  riderJson,
} from "@/lib/server/stage-rider-api";
import {
  versionAction,
  versionIdSchema,
  revisionSchema,
} from "@/lib/rider/versions";

export async function GET(request: Request) {
  try {
    await requireRiderAdmin(request);
    const query = new URL(request.url).searchParams;
    const id = query.get("id");
    if (id === null) return riderJson(await listVersions());
    if (!versionIdSchema.safeParse(id).success)
      throw new ServerRouteError("Invalid version.", 400);
    if (query.has("history")) return riderJson(await listRevisions(id));
    const value = query.get("revision");
    if (
      value !== null &&
      (!/^\d+$/.test(value) || !revisionSchema.safeParse(Number(value)).success)
    )
      throw new ServerRouteError("Invalid revision.", 400);
    return riderJson(
      await readVersion(id, value === null ? undefined : Number(value)),
    );
  } catch (e) {
    return riderFailure(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireRiderAdmin(request);
    const body = await request.text();
    if (Buffer.byteLength(body) > 800000)
      throw new ServerRouteError(
        "This revision is too large. Reduce uploaded artwork before saving.",
        413,
      );
    let value: unknown;
    try {
      value = JSON.parse(body);
    } catch {
      throw new ServerRouteError("Invalid request.", 400);
    }
    const action = versionAction.safeParse(value);
    if (!action.success)
      throw new ServerRouteError(action.error.issues[0].message, 400);
    return riderJson(await changeVersion(action.data));
  } catch (e) {
    return riderFailure(e);
  }
}
