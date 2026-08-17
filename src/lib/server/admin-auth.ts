export class ServerRouteError extends Error {
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

function isLocalDemoRequest(request: Request) {
  if (process.env.NODE_ENV === "production") return false;
  if (request.headers.get("x-swell-demo") !== "1") return false;

  const sourceUrl = request.headers.get("origin") ?? request.headers.get("referer");
  if (!sourceUrl) return false;

  try {
    const hostname = new URL(sourceUrl).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export async function requireServerAdmin(request: Request) {
  if (isLocalDemoRequest(request)) return;

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!token || !firebaseApiKey) {
    throw new ServerRouteError("Administrator authentication is required.", 401);
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
    throw new ServerRouteError("Your Firebase session has expired.", 401);
  }

  const payload = (await response.json()) as { users?: Array<{ email?: string }> };
  const email = payload.users?.[0]?.email?.toLowerCase() ?? "";

  if (!email || !serverAdminEmails().includes(email)) {
    throw new ServerRouteError("Administrator access is required.", 403);
  }
}
