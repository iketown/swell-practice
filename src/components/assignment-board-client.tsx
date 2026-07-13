"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, ArrowLeftIcon, CheckCircle2Icon, GripVerticalIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/hooks/use-admin";
import { getSongAssignments, listBands, saveAssignmentChanges, type AssignmentChange } from "@/lib/assignments";
import type { Band, EffectiveMemberAssignment, SongAssignmentBundle } from "@/lib/domain";
import { partLabel, samePartSlugs, sortPartSlugs } from "@/lib/domain";
import { cn } from "@/lib/utils";

interface SelectedPart {
  partSlug: string;
  fromMemberId: string | null;
}

export function AssignmentBoardClient({ songSlug }: { songSlug: string }) {
  const admin = useAdmin();
  const router = useRouter();
  const [bands, setBands] = useState<Band[]>([]);
  const [selectedBandId, setSelectedBandId] = useState<string | undefined>();
  const [bundle, setBundle] = useState<SongAssignmentBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPart, setSelectedPart] = useState<SelectedPart | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin.loading && !admin.isAdmin) router.replace("/");
  }, [admin.isAdmin, admin.loading, router]);

  const load = useCallback(async (bandId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [nextBands, nextBundle] = await Promise.all([listBands(), getSongAssignments(songSlug, bandId)]);
      setBands(nextBands);
      setBundle(nextBundle);
      setSelectedBandId(nextBundle?.band.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load assignments.");
    } finally {
      setLoading(false);
    }
  }, [songSlug]);

  useEffect(() => {
    if (!admin.isAdmin) return;
    let active = true;
    Promise.all([listBands(), getSongAssignments(songSlug)])
      .then(([nextBands, nextBundle]) => {
        if (!active) return;
        setBands(nextBands);
        setBundle(nextBundle);
        setSelectedBandId(nextBundle?.band.id);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load assignments.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [admin.isAdmin, songSlug]);

  const assignedPartSlugs = useMemo(() => new Set(bundle?.assignments.flatMap((item) => item.effectivePartSlugs) ?? []), [bundle]);
  const unassignedPartSlugs = bundle?.parts.filter((part) => !assignedPartSlugs.has(part.slug)).map((part) => part.slug) ?? [];
  const assignmentsNeedingDefaults = bundle?.assignments.filter((assignment) =>
    !samePartSlugs(assignment.defaultPartSlugs, assignment.effectivePartSlugs),
  ) ?? [];

  function applyAssignmentChanges(changes: AssignmentChange[], mode: "default" | "override") {
    const changeMap = new Map(changes.map((change) => [change.memberId, change.partSlugs]));
    setBundle((current) => {
      if (!current) return current;
      return {
        ...current,
        assignments: current.assignments.map((assignment) => {
          const nextParts = changeMap.get(assignment.member.id);
          if (!nextParts) return assignment;
          const createsFirstDefault = assignment.defaultPartSlugs.length === 0;
          const defaultPartSlugs = mode === "default" || createsFirstDefault ? nextParts : assignment.defaultPartSlugs;
          return {
            ...assignment,
            defaultPartSlugs,
            effectivePartSlugs: nextParts,
            hasOverride: !samePartSlugs(defaultPartSlugs, nextParts),
          };
        }),
      };
    });
  }

  async function persistAssignmentChanges(changes: AssignmentChange[], mode: "default" | "override") {
    if (!bundle || !changes.length || saving) return;
    const previousBundle = bundle;
    setSaving(true);
    setError(null);
    applyAssignmentChanges(changes, mode);
    try {
      await saveAssignmentChanges(bundle.song.id, bundle.band.id, changes, mode);
    } catch (caught) {
      setBundle(previousBundle);
      setError(caught instanceof Error ? caught.message : "Could not save this assignment.");
    } finally {
      setSaving(false);
    }
  }

  function buildMove(partSlug: string, fromMemberId: string | null, toMemberId: string | null) {
    if (!bundle || saving || fromMemberId === toMemberId) return;
    const nextByMember = new Map(bundle.assignments.map((item) => [item.member.id, [...item.effectivePartSlugs]]));
    if (fromMemberId) nextByMember.set(fromMemberId, (nextByMember.get(fromMemberId) ?? []).filter((slug) => slug !== partSlug));
    if (toMemberId) nextByMember.set(toMemberId, [...new Set([...(nextByMember.get(toMemberId) ?? []), partSlug])]);

    const changes = bundle.assignments.flatMap((item) => {
      const next = sortPartSlugs(nextByMember.get(item.member.id) ?? [], bundle.parts);
      return samePartSlugs(next, item.effectivePartSlugs) ? [] : [{ memberId: item.member.id, partSlugs: next }];
    });
    if (!changes.length) return;
    setSelectedPart(null);
    void persistAssignmentChanges(changes, "override");
  }

  async function resetOverride(assignment: EffectiveMemberAssignment) {
    await persistAssignmentChanges([{ memberId: assignment.member.id, partSlugs: assignment.defaultPartSlugs }], "override");
  }

  async function setMemberDefault(assignment: EffectiveMemberAssignment) {
    await persistAssignmentChanges([{ memberId: assignment.member.id, partSlugs: assignment.effectivePartSlugs }], "default");
  }

  async function setAllDefaults() {
    await persistAssignmentChanges(
      assignmentsNeedingDefaults.map((assignment) => ({
        memberId: assignment.member.id,
        partSlugs: assignment.effectivePartSlugs,
      })),
      "default",
    );
  }

  if (admin.loading || !admin.isAdmin) return null;

  if (loading && !bundle) {
    return <AppShell><Skeleton className="h-36 w-full" /><div className="grid gap-3 lg:grid-cols-3"><Skeleton className="h-56 w-full" /><Skeleton className="h-56 w-full" /><Skeleton className="h-56 w-full" /></div></AppShell>;
  }

  if (!bundle) {
    return (
      <AppShell>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Assignment board unavailable</EmptyTitle>
            <EmptyDescription>{error ?? "Create at least one band, then try this song again."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </AppShell>
    );
  }

  const hasUncoveredParts = unassignedPartSlugs.length > 0;

  return (
    <AppShell>
      <section className="swell-panel flex flex-col gap-5 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1">
            <Button render={<Link href="/assignments" />} variant="ghost" size="sm" nativeButton={false} className="mb-1 w-fit">
              <ArrowLeftIcon data-icon="inline-start" />
              All songs
            </Button>
            <p className="swell-page-kicker">Assignment board</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{bundle.song.title}</h1>
          </div>
          <div className="flex min-w-64 flex-col gap-2">
            <label htmlFor="assignment-band" className="text-sm font-medium">Band</label>
            <Select items={bands.map((band) => ({ label: band.title, value: band.id }))} value={selectedBandId} onValueChange={(value) => value && void load(value)}>
              <SelectTrigger id="assignment-band" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>{bands.map((band) => <SelectItem key={band.id} value={band.id}>{band.title}</SelectItem>)}</SelectGroup>
              </SelectContent>
            </Select>
            <span className="font-mono text-xs tracking-[0.12em] text-muted-foreground">{bundle.band.code}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">Default</Badge><span className="text-muted-foreground">Inherited for every band</span>
          <Badge>Changed</Badge><span className="text-muted-foreground">Different in this band, ready to set as default</span>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3" aria-live="polite">
        <div className="flex items-center gap-2">
          {hasUncoveredParts ? <AlertCircleIcon aria-hidden className="text-destructive" /> : <CheckCircle2Icon aria-hidden className="text-primary" />}
          <div>
            <p className="font-semibold">{hasUncoveredParts ? `${unassignedPartSlugs.length} uncovered ${unassignedPartSlugs.length === 1 ? "part" : "parts"}` : "Every part is covered"}</p>
            <p className="text-sm text-muted-foreground">{selectedPart ? `Selected ${partLabel(selectedPart.partSlug)}. Choose “Move here” in another zone.` : "Drag a part, or select it and choose another zone."}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedPart ? <Button variant="ghost" size="sm" onClick={() => setSelectedPart(null)} disabled={saving}><XIcon data-icon="inline-start" />Cancel move</Button> : null}
          <Button onClick={() => void setAllDefaults()} disabled={saving || !assignmentsNeedingDefaults.length}>
            {saving ? "Saving..." : assignmentsNeedingDefaults.length ? "Set all as default" : "All defaults set"}
          </Button>
        </div>
      </section>

      {error ? <p role="alert" className="rounded-lg border bg-card p-3 text-sm text-destructive">{error}</p> : null}

      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        {bundle.assignments.map((assignment) => (
          <AssignmentZone
            key={assignment.member.id}
            title={assignment.member.displayName}
            subtitle={assignment.hasOverride ? "Band change" : assignment.defaultPartSlugs.length ? "Using defaults" : "No defaults yet"}
            memberId={assignment.member.id}
            partSlugs={assignment.effectivePartSlugs}
            assignment={assignment}
            selectedPart={selectedPart}
            onSelectPart={setSelectedPart}
            onMove={buildMove}
            onReset={() => void resetOverride(assignment)}
            onSetDefault={() => void setMemberDefault(assignment)}
            saving={saving}
          />
        ))}
        <AssignmentZone
          title="Unassigned"
          subtitle={unassignedPartSlugs.length ? "Needs coverage" : "All clear"}
          memberId={null}
          partSlugs={unassignedPartSlugs}
          selectedPart={selectedPart}
          onSelectPart={setSelectedPart}
          onMove={buildMove}
          saving={saving}
        />
      </div>

    </AppShell>
  );
}

function AssignmentZone({
  title,
  subtitle,
  memberId,
  partSlugs,
  assignment,
  selectedPart,
  onSelectPart,
  onMove,
  onReset,
  onSetDefault,
  saving,
}: {
  title: string;
  subtitle: string;
  memberId: string | null;
  partSlugs: string[];
  assignment?: EffectiveMemberAssignment;
  selectedPart: SelectedPart | null;
  onSelectPart: (part: SelectedPart) => void;
  onMove: (partSlug: string, fromMemberId: string | null, toMemberId: string | null) => void;
  onReset?: () => void;
  onSetDefault?: () => void;
  saving: boolean;
}) {
  const isMoveTarget = Boolean(selectedPart && selectedPart.fromMemberId !== memberId);
  const needsDefault = Boolean(assignment && !samePartSlugs(assignment.defaultPartSlugs, assignment.effectivePartSlugs));

  return (
    <section
      aria-label={`${title} assignment drop zone`}
      className={cn(
        "flex min-h-48 flex-col gap-3 rounded-lg border-2 bg-card p-3 transition-[border-color,background-color] duration-200",
        isMoveTarget
          ? "border-primary bg-accent/35"
          : memberId
            ? "border-border"
            : partSlugs.length
              ? "border-dashed border-destructive/50"
              : "border-dashed border-primary/40",
      )}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const [partSlug, fromMemberId] = event.dataTransfer.getData("text/plain").split("|");
        if (partSlug) onMove(partSlug, fromMemberId === "unassigned" ? null : fromMemberId, memberId);
      }}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1">
          {assignment && onSetDefault ? (
            <Button variant={needsDefault ? "default" : "secondary"} size="sm" onClick={onSetDefault} disabled={saving || !needsDefault}>
              {needsDefault ? "Set as default" : "Default set"}
            </Button>
          ) : null}
          {assignment?.hasOverride && onReset ? (
            <Button variant="ghost" size="icon-sm" onClick={onReset} disabled={saving} aria-label={`Reset ${title} to defaults`}>
              <RotateCcwIcon />
            </Button>
          ) : null}
          <Badge variant={memberId ? "outline" : "secondary"}>{partSlugs.length}</Badge>
        </div>
      </header>

      {isMoveTarget && selectedPart ? (
        <Button size="sm" onClick={() => onMove(selectedPart.partSlug, selectedPart.fromMemberId, memberId)}>
          Move {partLabel(selectedPart.partSlug)} here
        </Button>
      ) : null}

      <div className="flex flex-wrap content-start gap-2">
        {partSlugs.map((partSlug) => {
          const isOverride = Boolean(assignment && !assignment.defaultPartSlugs.includes(partSlug));
          const selected = selectedPart?.partSlug === partSlug && selectedPart.fromMemberId === memberId;
          return (
            <button
              key={partSlug}
              type="button"
              draggable
              aria-pressed={selected}
              className={cn(
                "group/part inline-flex min-h-10 items-center gap-1.5 rounded-md border-2 px-2.5 py-1.5 text-sm font-semibold shadow-sm outline-none transition-[transform,background-color,box-shadow] duration-200 focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-px",
                isOverride ? "border-primary bg-primary text-primary-foreground" : "border-foreground/25 bg-secondary text-secondary-foreground",
                selected && "ring-3 ring-ring/40",
              )}
              onClick={() => onSelectPart({ partSlug, fromMemberId: memberId })}
              onDragStart={(event) => event.dataTransfer.setData("text/plain", `${partSlug}|${memberId ?? "unassigned"}`)}
            >
              <GripVerticalIcon aria-hidden />
              {partLabel(partSlug)}
              {isOverride ? <span className="sr-only">Override</span> : null}
            </button>
          );
        })}
        {!partSlugs.length ? <p className="text-sm text-muted-foreground">{memberId ? "No parts for this song" : "Nothing waiting for coverage"}</p> : null}
      </div>
    </section>
  );
}
