import { ServerRouteError } from "@/lib/server/admin-auth";
import { readRider } from "@/lib/server/stage-rider";
import {
  requireRiderAdmin,
  riderFailure,
  riderJson,
} from "@/lib/server/stage-rider-api";

export async function GET(request: Request) {
  try {
    const internal = new URL(request.url).searchParams.get("workspace") === "1";
    if (internal) await requireRiderAdmin(request);
    return riderJson(await readRider(internal));
  } catch (e) {
    return riderFailure(e);
  }
}

// Older open tabs used this endpoint to overwrite the public rider directly.
export async function PUT(request: Request) {
  try {
    await requireRiderAdmin(request);
    throw new ServerRouteError(
      "Your browser draft is preserved. Reload the page and open Edit plot to save it as a version revision.",
      409,
    );
  } catch (e) {
    return riderFailure(e);
  }
}
