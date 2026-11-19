import { ServerRouteError } from "@/lib/server/admin-auth";
import { releaseCode } from "@/lib/rider/releases";
import {
  publicReleaseList,
  readIssuedRider,
  readRider,
} from "@/lib/server/stage-rider";
import {
  requireRiderAdmin,
  riderFailure,
  riderJson,
} from "@/lib/server/stage-rider-api";

export async function GET(request: Request) {
  try {
    const code = new URL(request.url).searchParams.get("code");
    if (code !== null) {
      if (!releaseCode.safeParse(code).success)
        throw new ServerRouteError("Invalid code.", 400);
      const release = (await publicReleaseList()).find(
        (row) => row.code === code,
      );
      if (!release) throw new ServerRouteError("Unknown edition.", 404);
      if (release.replacement)
        throw new ServerRouteError("An updated edition is required.", 409);
      return riderJson(await readIssuedRider(release));
    }
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
