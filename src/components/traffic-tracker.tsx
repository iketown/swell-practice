"use client";

import { useEffect } from "react";

const recentlySent = new Map<string, number>();

export function TrafficTracker({
  member,
  mix,
  part,
  path,
  songSlug,
}: {
  member?: string;
  mix?: string;
  part?: string;
  path: string;
  songSlug: string;
}) {
  useEffect(() => {
    const eventKey = JSON.stringify({ member, mix, part, path, songSlug });
    const now = Date.now();
    if (now - (recentlySent.get(eventKey) ?? 0) < 5_000) return;
    recentlySent.set(eventKey, now);

    void fetch("/api/traffic", {
      body: JSON.stringify({
        member: member ?? null,
        mix: mix ?? null,
        part: part ?? null,
        path,
        referrer: document.referrer.slice(0, 2_048) || null,
        songSlug,
      }),
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      method: "POST",
    }).catch(() => undefined);
  }, [member, mix, part, path, songSlug]);

  return null;
}
