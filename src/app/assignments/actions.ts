"use server";

import { hasVerifiedAdminToken } from "@/lib/server/admin-auth";

export async function verifyAssignmentAccess(token: string) {
  return hasVerifiedAdminToken(token);
}
