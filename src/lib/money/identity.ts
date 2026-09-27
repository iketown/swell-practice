import type { Person } from "@/lib/money/domain";

export function founderForEmail(
  signedInEmail: string | null | undefined,
  configured: { ikeEmail?: string; chrisEmail?: string },
): Person | null {
  const email = signedInEmail?.trim().toLowerCase();
  const ike = configured.ikeEmail?.trim().toLowerCase();
  const chris = configured.chrisEmail?.trim().toLowerCase();
  if (!email || !ike || !chris || ike === chris) return null;
  if (email === ike) return "ike";
  if (email === chris) return "chris";
  return null;
}
