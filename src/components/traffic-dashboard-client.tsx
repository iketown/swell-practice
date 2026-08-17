"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpDownIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminSectionNav } from "@/components/admin-section-nav";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdmin } from "@/hooks/use-admin";

type TrafficEvent = {
  deviceType: string;
  id: string;
  ip: string;
  location: {
    city: string | null;
    country: string | null;
    region: string | null;
    timezone: string | null;
  };
  member: string | null;
  mix: string | null;
  part: string | null;
  path: string;
  referrer: string | null;
  songSlug: string;
  userAgent: string;
  visitedAt: string | null;
  visitorId: string;
};

type SortKey = "ip" | "location" | "member" | "page" | "visitedAt" | "visitorId";
type SortDirection = "asc" | "desc";

type BrowserHistory = {
  activeDays: string[];
  events: TrafficEvent[];
  firstSeen: number;
  ips: string[];
  lastSeen: number;
  members: string[];
  visitorId: string;
};

function timestamp(event: TrafficEvent) {
  const value = event.visitedAt ? Date.parse(event.visitedAt) : 0;
  return Number.isFinite(value) ? value : 0;
}

function locationLabel(event: TrafficEvent) {
  return [event.location.city, event.location.region, event.location.country].filter(Boolean).join(", ") || "Unknown";
}

function shortVisitorId(visitorId: string) {
  return visitorId === "unknown" ? visitorId : `browser-${visitorId.slice(0, 8)}`;
}

function eventUrl(event: TrafficEvent) {
  const query = new URLSearchParams();
  if (event.mix) query.set("mix", event.mix);
  if (event.part) query.set("part", event.part);
  if (event.member) query.set("member", event.member);
  const suffix = query.toString();
  return suffix ? `${event.path}?${suffix}` : event.path;
}

function formatDateTime(value: number) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDay(day: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${day}T12:00:00`));
}

function compareText(left: string | null, right: string | null) {
  return (left ?? "").localeCompare(right ?? "", undefined, { numeric: true, sensitivity: "base" });
}

async function requestTrafficEvents(token: string, isDemoAdmin: boolean) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (isDemoAdmin) headers["x-swell-demo"] = "1";

  const response = await fetch("/api/traffic?limit=1000", {
    cache: "no-store",
    headers,
  });
  const payload = (await response.json()) as { error?: string; events?: TrafficEvent[] };
  if (!response.ok) throw new Error(payload.error ?? "Traffic data could not be loaded.");
  return payload.events ?? [];
}

export function TrafficDashboardClient() {
  const admin = useAdmin();
  const router = useRouter();
  const [events, setEvents] = useState<TrafficEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("visitedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    if (!admin.loading && !admin.isAdmin) router.replace("/");
  }, [admin.isAdmin, admin.loading, router]);

  const loadEvents = useCallback(async () => {
    if (!admin.isAdmin) return;

    try {
      const token = admin.user ? await admin.user.getIdToken() : "";
      setEvents(await requestTrafficEvents(token, admin.isDemoAdmin));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Traffic data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [admin.isAdmin, admin.isDemoAdmin, admin.user]);

  useEffect(() => {
    if (!admin.isAdmin) return;

    let active = true;
    const tokenPromise = admin.user ? admin.user.getIdToken() : Promise.resolve("");
    tokenPromise
      .then((token) => requestTrafficEvents(token, admin.isDemoAdmin))
      .then((nextEvents) => {
        if (!active) return;
        setEvents(nextEvents);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Traffic data could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [admin.isAdmin, admin.isDemoAdmin, admin.user]);

  const filteredEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return events;

    return events.filter((event) => [
      event.ip,
      event.visitorId,
      shortVisitorId(event.visitorId),
      event.member,
      event.mix,
      event.part,
      event.path,
      event.songSlug,
      event.deviceType,
      event.location.city,
      event.location.region,
      event.location.country,
      event.location.timezone,
      event.referrer,
      event.userAgent,
    ].some((value) => value?.toLowerCase().includes(normalized)));
  }, [events, query]);

  const sortedEvents = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filteredEvents].sort((left, right) => {
      if (sortKey === "visitedAt") return (timestamp(left) - timestamp(right)) * direction;
      if (sortKey === "location") return compareText(locationLabel(left), locationLabel(right)) * direction;
      if (sortKey === "page") return compareText(eventUrl(left), eventUrl(right)) * direction;
      return compareText(left[sortKey], right[sortKey]) * direction;
    });
  }, [filteredEvents, sortDirection, sortKey]);

  const browserHistory = useMemo(() => {
    const grouped = new Map<string, TrafficEvent[]>();
    for (const event of filteredEvents) {
      grouped.set(event.visitorId, [...(grouped.get(event.visitorId) ?? []), event]);
    }

    return [...grouped.entries()].map(([visitorId, browserEvents]): BrowserHistory => {
      const times = browserEvents.map(timestamp).filter(Boolean);
      const activeDays = new Set(browserEvents.flatMap((event) => {
        const time = timestamp(event);
        return time ? [new Date(time).toISOString().slice(0, 10)] : [];
      }));

      return {
        activeDays: [...activeDays].sort().reverse(),
        events: browserEvents,
        firstSeen: times.length ? Math.min(...times) : 0,
        ips: [...new Set(browserEvents.map((event) => event.ip))],
        lastSeen: times.length ? Math.max(...times) : 0,
        members: [...new Set(browserEvents.flatMap((event) => event.member ? [event.member] : []))],
        visitorId,
      };
    }).sort((left, right) => right.lastSeen - left.lastSeen);
  }, [filteredEvents]);

  const uniqueIps = new Set(filteredEvents.map((event) => event.ip)).size;
  const memberHints = new Set(filteredEvents.flatMap((event) => event.member ? [event.member] : [])).size;

  function changeSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "visitedAt" ? "desc" : "asc");
  }

  function inspectBrowser(visitorId: string) {
    setQuery(visitorId);
    requestAnimationFrame(() => document.getElementById("page-views")?.scrollIntoView({ block: "start" }));
  }

  function refreshEvents() {
    setLoading(true);
    setError(null);
    void loadEvents();
  }

  if (admin.loading || !admin.isAdmin) return null;

  return (
    <AppShell>
      <section className="swell-panel flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
        <div className="grid gap-1">
          <p className="swell-page-kicker">Owner tools</p>
          <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Traffic</h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Song-page activity grouped by a first-party browser cookie. IP address and member-link attribution are useful clues, not verified identity.
          </p>
        </div>
        <Badge variant="secondary">Last 1,000 page views</Badge>
      </section>

      <AdminSectionNav />

      <Card>
        <CardHeader>
          <CardTitle>Find activity</CardTitle>
          <CardDescription>Search any IP, browser ID, member hint, song, part, device, or location.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <SearchIcon aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search traffic"
                className="pl-9"
                placeholder="Search 73.21…, jackson, california-girls, voc_2…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Button variant="outline" onClick={refreshEvents} disabled={loading}>
              <RefreshCwIcon data-icon="inline-start" />
              {loading ? "Refreshing" : "Refresh"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {filteredEvents.length.toLocaleString()} page views · {browserHistory.length.toLocaleString()} browser IDs · {uniqueIps.toLocaleString()} IPs · {memberHints.toLocaleString()} member hints
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <TrafficSkeleton />
      ) : error ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Traffic data is unavailable</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : events.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No song visits yet</EmptyTitle>
            <EmptyDescription>Open a `/songs/[song-slug]` page once traffic storage is configured.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Browser history</CardTitle>
              <CardDescription>Active days make return visits easy to spot. Select a browser ID to isolate its page history.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Browser ID</TableHead>
                    <TableHead>Member hint</TableHead>
                    <TableHead>IP addresses</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead>Active days</TableHead>
                    <TableHead>First seen</TableHead>
                    <TableHead>Last seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {browserHistory.map((browser) => (
                    <TableRow key={browser.visitorId}>
                      <TableCell className="font-mono">
                        <Button variant="ghost" size="xs" onClick={() => inspectBrowser(browser.visitorId)}>
                          {shortVisitorId(browser.visitorId)}
                        </Button>
                      </TableCell>
                      <TableCell>
                        {browser.members.length ? (
                          <div className="flex flex-wrap gap-1">
                            {browser.members.map((member) => <Badge key={member} variant="outline">{member}</Badge>)}
                          </div>
                        ) : <span className="text-muted-foreground">None</span>}
                      </TableCell>
                      <TableCell className="max-w-56 font-mono text-xs">{browser.ips.join(", ")}</TableCell>
                      <TableCell className="text-right tabular-nums">{browser.events.length}</TableCell>
                      <TableCell className="max-w-72 text-sm">
                        {browser.activeDays.slice(0, 4).map(formatDay).join(", ")}
                        {browser.activeDays.length > 4 ? ` +${browser.activeDays.length - 4}` : ""}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatDateTime(browser.firstSeen)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatDateTime(browser.lastSeen)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card id="page-views">
            <CardHeader>
              <CardTitle>Page views</CardTitle>
              <CardDescription>Each row is one recorded song-page visit. Repeat renders within 15 seconds are collapsed.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label="Visit" column="visitedAt" active={sortKey} direction={sortDirection} onSort={changeSort} />
                    <SortableHead label="IP address" column="ip" active={sortKey} direction={sortDirection} onSort={changeSort} />
                    <SortableHead label="Browser ID" column="visitorId" active={sortKey} direction={sortDirection} onSort={changeSort} />
                    <SortableHead label="Member hint" column="member" active={sortKey} direction={sortDirection} onSort={changeSort} />
                    <SortableHead label="Song / selection" column="page" active={sortKey} direction={sortDirection} onSort={changeSort} />
                    <SortableHead label="Location" column="location" active={sortKey} direction={sortDirection} onSort={changeSort} />
                    <TableHead>Device</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatDateTime(timestamp(event))}</TableCell>
                      <TableCell className="font-mono text-xs">{event.ip}</TableCell>
                      <TableCell className="font-mono text-xs" title={event.visitorId}>{shortVisitorId(event.visitorId)}</TableCell>
                      <TableCell>
                        {event.member ? <Badge variant="outline">{event.member}</Badge> : <span className="text-muted-foreground">None</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-48 flex-col gap-0.5">
                          <Link href={eventUrl(event)} className="font-medium hover:underline">{event.songSlug}</Link>
                          <span className="text-xs text-muted-foreground">
                            {[event.mix && `mix: ${event.mix}`, event.part && `part: ${event.part}`].filter(Boolean).join(" · ") || "No selection parameters"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-40 text-sm">
                        <span>{locationLabel(event)}</span>
                        {event.location.timezone ? <span className="block text-xs text-muted-foreground">{event.location.timezone}</span> : null}
                      </TableCell>
                      <TableCell className="capitalize">{event.deviceType}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}

function SortableHead({
  active,
  column,
  direction,
  label,
  onSort,
}: {
  active: SortKey;
  column: SortKey;
  direction: SortDirection;
  label: string;
  onSort: (column: SortKey) => void;
}) {
  const selected = active === column;
  const Icon = !selected ? ArrowUpDownIcon : direction === "asc" ? ArrowUpIcon : ArrowDownIcon;

  return (
    <TableHead aria-sort={selected ? direction === "asc" ? "ascending" : "descending" : "none"}>
      <Button variant="ghost" size="xs" onClick={() => onSort(column)}>
        {label}
        <Icon data-icon="inline-end" />
      </Button>
    </TableHead>
  );
}

function TrafficSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-label="Loading traffic data">
      <Skeleton className="h-60 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
