"use server";

import { redirect } from "next/navigation";

import { hasVerifiedAdminToken } from "@/lib/server/admin-auth";
import { hasBandAccess, openBandSession } from "@/lib/server/band-session";
import { readBandMemberParts } from "@/lib/server/member-library";

export async function unlockBand(_previous: string | null, formData: FormData) {
  return openBandSession(formData.get("password"));
}

export async function loadBandMemberParts(memberSlug: string, bandId?: string, token?: string) {
  if (typeof memberSlug !== "string" || !memberSlug) return null;
  if (!(await hasBandAccess())) redirect(`/members/${encodeURIComponent(memberSlug)}`);

  const includeUnpublished = await hasVerifiedAdminToken(token);
  return readBandMemberParts(memberSlug, bandId, includeUnpublished);
}
