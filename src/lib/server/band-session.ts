import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const cookieName = "swell-band-access";
const sessionSeconds = 90 * 24 * 60 * 60;

function signExpiry(expiry: string, password: string, secret: string) {
  return createHmac("sha256", secret).update(JSON.stringify([expiry, password])).digest();
}

export async function hasBandAccess() {
  const password = process.env.BAND_ACCESS_PASSWORD;
  const secret = process.env.BAND_SESSION_SECRET;
  if (!password || !secret) return false;

  const value = (await cookies()).get(cookieName)?.value ?? "";
  const session = /^(\d{10})\.([\w-]{43})$/.exec(value);
  if (!session || Number(session[1]) <= Math.floor(Date.now() / 1000)) return false;

  const signature = Buffer.from(session[2], "base64url");
  return timingSafeEqual(signature, signExpiry(session[1], password, secret));
}

export async function openBandSession(attempt: unknown) {
  const password = process.env.BAND_ACCESS_PASSWORD;
  const secret = process.env.BAND_SESSION_SECRET;
  if (!password || !secret) return "Band access is unavailable.";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (typeof attempt !== "string" || !timingSafeEqual(digest(attempt), digest(password))) {
    return "Incorrect password.";
  }

  const expiry = String(Math.floor(Date.now() / 1000) + sessionSeconds);
  const signature = signExpiry(expiry, password, secret).toString("base64url");
  (await cookies()).set(cookieName, `${expiry}.${signature}`, {
    httpOnly: true,
    maxAge: sessionSeconds,
    path: "/members",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return null;
}
