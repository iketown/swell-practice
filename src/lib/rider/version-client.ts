"use client";
import { auth } from "@/lib/firebase";
import type { VersionAction } from "./versions";

export async function riderRequest<T>(
  query = "",
  action?: VersionAction,
): Promise<T> {
  const user = auth?.currentUser;
  if (!user) throw Error("Sign in to access rider versions.");
  const response = await fetch("/api/stage-plot/versions" + query, {
    cache: "no-store",
    method: action ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + (await user.getIdToken()),
      "Content-Type": "application/json",
    },
    body: action ? JSON.stringify(action) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "The rider could not be loaded.");
  return data as T;
}
