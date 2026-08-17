import { createHash, randomUUID } from "node:crypto";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireServerAdmin, ServerRouteError } from "@/lib/server/admin-auth";
import { getServerFirestore } from "@/lib/server/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "swell_visitor";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const EVENT_RETENTION_DAYS = 90;
const MAX_DASHBOARD_EVENTS = 1_000;
const DEDUPE_WINDOW_MS = 15_000;

const TrafficEventSchema = z.object({
  member: z.string().trim().min(1).max(80).regex(/^[a-z0-9_-]+$/i).nullable(),
  mix: z.string().trim().min(1).max(80).regex(/^[a-z0-9_-]+$/i).nullable(),
  part: z.string().trim().min(1).max(80).regex(/^[a-z0-9_-]+$/i).nullable(),
  path: z.string().trim().min(1).max(240).regex(/^\/songs\/[a-z0-9][a-z0-9_-]*$/i),
  referrer: z.string().trim().max(2_048).nullable(),
  songSlug: z.string().trim().min(1).max(160).regex(/^[a-z0-9][a-z0-9_-]*$/i),
});

type TrafficLocation = {
  city: string | null;
  country: string | null;
  region: string | null;
  timezone: string | null;
};

function requestIp(request: Request) {
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    ?? request.headers.get("x-forwarded-for")
    ?? request.headers.get("x-real-ip")
    ?? "";
  const first = forwarded.split(",")[0]?.trim();
  return first && first.length <= 64 ? first : "local";
}

function decodedHeader(request: Request, name: string) {
  const value = request.headers.get(name)?.trim();
  if (!value) return null;

  try {
    return decodeURIComponent(value).slice(0, 160);
  } catch {
    return value.slice(0, 160);
  }
}

function requestLocation(request: Request): TrafficLocation {
  return {
    city: decodedHeader(request, "x-vercel-ip-city"),
    country: decodedHeader(request, "x-vercel-ip-country"),
    region: decodedHeader(request, "x-vercel-ip-country-region"),
    timezone: decodedHeader(request, "x-vercel-ip-timezone"),
  };
}

function deviceType(userAgent: string) {
  if (/bot|crawler|spider|preview|facebookexternalhit/i.test(userAgent)) return "bot";
  if (/ipad|tablet|android(?!.*mobile)/i.test(userAgent)) return "tablet";
  if (/iphone|ipod|android.*mobile|windows phone/i.test(userAgent)) return "mobile";
  return "desktop";
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function dateValue(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) {
      return NextResponse.json({ error: "Cross-site traffic events are not accepted." }, { status: 403 });
    }

    const parsed = TrafficEventSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid traffic event." }, { status: 400 });
    }

    const existingVisitorId = request.cookies.get(VISITOR_COOKIE)?.value;
    const visitorId = existingVisitorId && /^[a-f0-9-]{36}$/i.test(existingVisitorId)
      ? existingVisitorId
      : randomUUID();
    const now = Date.now();
    const dedupeBucket = Math.floor(now / DEDUPE_WINDOW_MS);
    const eventId = createHash("sha256")
      .update([
        visitorId,
        parsed.data.path,
        parsed.data.mix ?? "",
        parsed.data.part ?? "",
        parsed.data.member ?? "",
        String(dedupeBucket),
      ].join("\u0000"))
      .digest("hex")
      .slice(0, 32);
    const userAgent = (request.headers.get("user-agent") ?? "unknown").slice(0, 500);

    await getServerFirestore().collection("trafficEvents").doc(eventId).set({
      ...parsed.data,
      deviceType: deviceType(userAgent),
      expiresAt: Timestamp.fromMillis(now + EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1_000),
      ip: requestIp(request),
      language: (request.headers.get("accept-language") ?? "").slice(0, 160) || null,
      location: requestLocation(request),
      userAgent,
      visitedAt: FieldValue.serverTimestamp(),
      visitorId,
    });

    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "no-store");

    if (visitorId !== existingVisitorId) {
      response.cookies.set(VISITOR_COOKIE, visitorId, {
        httpOnly: true,
        maxAge: COOKIE_MAX_AGE_SECONDS,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }

    return response;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Traffic storage is unavailable.";
    console.error("Traffic event could not be stored:", message);
    return NextResponse.json({ error: "Traffic storage is unavailable." }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireServerAdmin(request);

    const requestedLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "500", 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), MAX_DASHBOARD_EVENTS)
      : 500;
    const snapshot = await getServerFirestore()
      .collection("trafficEvents")
      .orderBy("visitedAt", "desc")
      .limit(limit)
      .get();
    const events = snapshot.docs.map((document) => {
      const data = document.data();
      const location = data.location && typeof data.location === "object"
        ? data.location as Partial<TrafficLocation>
        : {};

      return {
        deviceType: typeof data.deviceType === "string" ? data.deviceType : "unknown",
        id: document.id,
        ip: typeof data.ip === "string" ? data.ip : "unknown",
        location: {
          city: typeof location.city === "string" ? location.city : null,
          country: typeof location.country === "string" ? location.country : null,
          region: typeof location.region === "string" ? location.region : null,
          timezone: typeof location.timezone === "string" ? location.timezone : null,
        },
        member: typeof data.member === "string" ? data.member : null,
        mix: typeof data.mix === "string" ? data.mix : null,
        part: typeof data.part === "string" ? data.part : null,
        path: typeof data.path === "string" ? data.path : "",
        referrer: typeof data.referrer === "string" ? data.referrer : null,
        songSlug: typeof data.songSlug === "string" ? data.songSlug : "unknown",
        userAgent: typeof data.userAgent === "string" ? data.userAgent : "unknown",
        visitedAt: dateValue(data.visitedAt),
        visitorId: typeof data.visitorId === "string" ? data.visitorId : "unknown",
      };
    });

    return NextResponse.json(
      { events },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (caught) {
    if (caught instanceof ServerRouteError) {
      return NextResponse.json({ error: caught.message }, { status: caught.status });
    }

    const message = caught instanceof Error ? caught.message : "Traffic data is unavailable.";
    const configurationError = message.includes("Firebase Admin is not configured");
    return NextResponse.json(
      {
        error: configurationError
          ? "Traffic storage needs Firebase Admin credentials on the server."
          : "Traffic data could not be loaded.",
      },
      { status: configurationError ? 503 : 500 },
    );
  }
}
