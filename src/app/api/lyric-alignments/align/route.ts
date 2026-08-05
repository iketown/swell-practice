import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
const MAX_LYRICS_CHARACTERS = 675_000;

type AlignmentRequest = {
  audioUrl?: unknown;
  contentType?: unknown;
  filename?: unknown;
  lyrics?: unknown;
};

class RouteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function serverAdminEmails() {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!token || !firebaseApiKey) {
    throw new RouteError("Administrator authentication is required.", 401);
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      body: JSON.stringify({ idToken: token }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    throw new RouteError("Your Firebase session has expired.", 401);
  }

  const payload = (await response.json()) as {
    users?: Array<{ email?: string }>;
  };
  const email = payload.users?.[0]?.email?.toLowerCase() ?? "";
  if (!email || !serverAdminEmails().includes(email)) {
    throw new RouteError("Administrator access is required.", 403);
  }
}

function validatedStorageUrl(value: unknown) {
  if (typeof value !== "string") {
    throw new RouteError("The song does not have a valid audio URL.", 400);
  }

  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RouteError("The song does not have a valid audio URL.", 400);
  }
  const expectedPrefix = bucket ? `/v0/b/${bucket}/o/` : "";

  if (
    url.protocol !== "https:" ||
    url.hostname !== "firebasestorage.googleapis.com" ||
    !expectedPrefix ||
    !url.pathname.startsWith(expectedPrefix)
  ) {
    throw new RouteError(
      "The alignment source must be an MP3 from this Firebase Storage project.",
      400,
    );
  }

  return url;
}

function errorMessageFromElevenLabs(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const payload = value as {
    detail?: unknown;
    message?: unknown;
  };
  if (typeof payload.detail === "string") return payload.detail;
  if (typeof payload.message === "string") return payload.message;
  if (payload.detail && typeof payload.detail === "object") {
    const detail = payload.detail as { message?: unknown };
    if (typeof detail.message === "string") return detail.message;
  }
  return "";
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new RouteError(
        "ELEVENLABS_API_KEY is not configured on the server.",
        503,
      );
    }

    const body = (await request.json()) as AlignmentRequest;
    const lyrics =
      typeof body.lyrics === "string" ? body.lyrics.trim() : "";
    const filename =
      typeof body.filename === "string" && body.filename.trim()
        ? body.filename.trim()
        : "alignment-source.mp3";
    const contentType =
      typeof body.contentType === "string" && body.contentType
        ? body.contentType
        : "audio/mpeg";

    if (!lyrics) {
      throw new RouteError("Lyrics are required for forced alignment.", 400);
    }
    if (lyrics.length > MAX_LYRICS_CHARACTERS) {
      throw new RouteError(
        `Lyrics must be ${MAX_LYRICS_CHARACTERS.toLocaleString()} characters or fewer.`,
        400,
      );
    }

    const audioUrl = validatedStorageUrl(body.audioUrl);
    const audioResponse = await fetch(audioUrl, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!audioResponse.ok) {
      throw new RouteError(
        "The source MP3 could not be downloaded from Firebase Storage.",
        502,
      );
    }

    const reportedSize = Number(
      audioResponse.headers.get("content-length") ?? 0,
    );
    if (reportedSize >= MAX_AUDIO_BYTES) {
      throw new RouteError("The source MP3 must be smaller than 200 MB.", 400);
    }

    const audioBytes = await audioResponse.arrayBuffer();
    if (audioBytes.byteLength >= MAX_AUDIO_BYTES) {
      throw new RouteError("The source MP3 must be smaller than 200 MB.", 400);
    }

    const form = new FormData();
    form.append(
      "file",
      new Blob([audioBytes], { type: contentType }),
      filename,
    );
    form.append("text", lyrics);

    const alignmentResponse = await fetch(
      "https://api.elevenlabs.io/v1/forced-alignment",
      {
        body: form,
        headers: {
          "xi-api-key": apiKey,
        },
        method: "POST",
        signal: AbortSignal.timeout(300_000),
      },
    );
    const payload: unknown = await alignmentResponse
      .json()
      .catch(() => null);

    if (!alignmentResponse.ok) {
      const detail = errorMessageFromElevenLabs(payload);
      throw new RouteError(
        detail
          ? `ElevenLabs could not align this song: ${detail}`
          : "ElevenLabs could not align this song.",
        alignmentResponse.status >= 500 ? 502 : alignmentResponse.status,
      );
    }

    return NextResponse.json(payload);
  } catch (caught) {
    if (caught instanceof RouteError) {
      return NextResponse.json(
        { error: caught.message },
        { status: caught.status },
      );
    }

    const isTimeout =
      caught instanceof DOMException && caught.name === "TimeoutError";
    return NextResponse.json(
      {
        error: isTimeout
          ? "The alignment request timed out. Try the song again."
          : "The alignment request failed before it completed.",
      },
      { status: isTimeout ? 504 : 500 },
    );
  }
}
