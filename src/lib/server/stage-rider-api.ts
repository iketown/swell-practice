import { NextResponse } from "next/server";
import { requireServerAdmin, ServerRouteError } from "./admin-auth";

const headers = { "Cache-Control": "private, no-store" };
export const riderJson = (body: unknown) =>
  NextResponse.json(body, { headers });
export function riderFailure(e: unknown) {
  return NextResponse.json(
    {
      error:
        e instanceof ServerRouteError
          ? e.message
          : "The rider service is unavailable. Try again.",
    },
    { status: e instanceof ServerRouteError ? e.status : 503, headers },
  );
}

export async function requireRiderAdmin(request: Request) {
  if (
    !request.headers.get("Authorization")?.startsWith("Bearer ") ||
    request.headers.has("x-swell-demo")
  )
    throw new ServerRouteError(
      "Sign in with a Swell administrator account.",
      401,
    );
  await requireServerAdmin(request);
}
