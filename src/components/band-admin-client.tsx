"use client";

import { useRouter } from "next/navigation";
import { CheckIcon, ClipboardIcon, PencilIcon, PlusIcon, Trash2Icon, UsersRoundIcon } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { AdminSectionNav } from "@/components/admin-section-nav";
import { AppShell } from "@/components/app-shell";
import { MemberThumbnail } from "@/components/member-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/hooks/use-admin";
import { createBand, deleteBand, listBands, listMembers, updateBand } from "@/lib/assignments";
import {
  partLabel,
  VOCAL_PART_SLUGS,
  type Band,
  type BandMember,
  type VocalPartSlug,
} from "@/lib/domain";

const UNASSIGNED_VOCAL_PART = "unassigned";
const STARTUP_MEMBER_ORDER = ["ike", "jackson", "joe", "sam", "cron"] as const;

function fillVocalPartMap(
  memberIds: string[],
  current: Partial<Record<string, VocalPartSlug>> = {},
  members: BandMember[] = [],
  bandTitle = "",
) {
  const used = new Set<VocalPartSlug>();
  const next: Partial<Record<string, VocalPartSlug>> = {};

  const memberMap = new Map(members.map((member) => [member.id, member]));
  const fillOrder = bandTitle.trim().toLowerCase().includes("startup")
    ? [...memberIds].sort((leftId, rightId) => {
        const leftName = memberMap.get(leftId)?.displayName.trim().toLowerCase() ?? "";
        const rightName = memberMap.get(rightId)?.displayName.trim().toLowerCase() ?? "";
        const leftOrder = STARTUP_MEMBER_ORDER.indexOf(leftName as (typeof STARTUP_MEMBER_ORDER)[number]);
        const rightOrder = STARTUP_MEMBER_ORDER.indexOf(rightName as (typeof STARTUP_MEMBER_ORDER)[number]);
        return (leftOrder < 0 ? 99 : leftOrder) - (rightOrder < 0 ? 99 : rightOrder);
      })
    : memberIds;
  fillOrder.forEach((memberId) => {
    const partSlug = current[memberId];
    if (partSlug && !used.has(partSlug)) {
      next[memberId] = partSlug;
      used.add(partSlug);
    }
  });
  memberIds.forEach((memberId) => {
    if (next[memberId]) return;
    const partSlug = VOCAL_PART_SLUGS.find((candidate) => !used.has(candidate));
    if (!partSlug) return;
    next[memberId] = partSlug;
    used.add(partSlug);
  });

  return next;
}

export function BandAdminClient() {
  const admin = useAdmin();
  const router = useRouter();
  const [bands, setBands] = useState<Band[]>([]);
  const [members, setMembers] = useState<BandMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingBand, setEditingBand] = useState<Band | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [vocalPartByMemberId, setVocalPartByMemberId] =
    useState<Partial<Record<string, VocalPartSlug>>>({});
  const [sourceBandId, setSourceBandId] = useState("blank");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingBand, setDeletingBand] = useState<Band | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const memberMap = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  useEffect(() => {
    if (!admin.loading && !admin.isAdmin) router.replace("/");
  }, [admin.isAdmin, admin.loading, router]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextBands, nextMembers] = await Promise.all([listBands(), listMembers()]);
      setBands(nextBands);
      setMembers(nextMembers);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!admin.isAdmin) return;
    let active = true;
    Promise.all([listBands(), listMembers()])
      .then(([nextBands, nextMembers]) => {
        if (!active) return;
        setBands(nextBands);
        setMembers(nextMembers);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [admin.isAdmin]);

  function openCreate() {
    const sourceBand = bands[0];
    const memberIds = sourceBand?.memberIds ?? [];
    setEditingBand("new");
    setTitle("");
    setSelectedMemberIds(memberIds);
    setVocalPartByMemberId(fillVocalPartMap(memberIds, sourceBand?.vocalPartByMemberId, members, sourceBand?.title));
    setSourceBandId(sourceBand?.id ?? "blank");
    setError(null);
  }

  function openEdit(band: Band) {
    setEditingBand(band);
    setTitle(band.title);
    setSelectedMemberIds(band.memberIds);
    setVocalPartByMemberId(fillVocalPartMap(band.memberIds, band.vocalPartByMemberId, members, band.title));
    setSourceBandId("blank");
    setError(null);
  }

  function useSourceBand(bandId: string | null) {
    const value = bandId ?? "blank";
    const sourceBand = bands.find((band) => band.id === value);
    const memberIds = sourceBand?.memberIds ?? [];
    setSourceBandId(value);
    setSelectedMemberIds(memberIds);
    setVocalPartByMemberId(fillVocalPartMap(memberIds, sourceBand?.vocalPartByMemberId, members, sourceBand?.title));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editingBand === "new") {
        await createBand(title, selectedMemberIds, vocalPartByMemberId);
      } else if (editingBand) {
        await updateBand(editingBand, title, selectedMemberIds, vocalPartByMemberId);
      }
      setEditingBand(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this band.");
    } finally {
      setSaving(false);
    }
  }

  function toggleMember(memberId: string, checked: boolean) {
    setSelectedMemberIds((current) => {
      const next = checked ? [...current, memberId] : current.filter((id) => id !== memberId);
      setVocalPartByMemberId((parts) => {
        if (checked) return fillVocalPartMap(
          next,
          parts,
          members,
          editingBand && editingBand !== "new" ? editingBand.title : title,
        );
        return Object.fromEntries(
          Object.entries(parts).filter(([id]) => id !== memberId),
        );
      });
      return next;
    });
  }

  function setMemberVocalPart(memberId: string, value: string | null) {
    setVocalPartByMemberId((current) => {
      const next = { ...current };
      if (!value || value === UNASSIGNED_VOCAL_PART) {
        delete next[memberId];
        return next;
      }
      next[memberId] = value as VocalPartSlug;
      return next;
    });
  }

  if (admin.loading || !admin.isAdmin) return null;

  return (
    <AppShell>
      <section className="swell-panel flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
        <div className="grid gap-1">
          <p className="swell-page-kicker">Owner tools</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Bands</h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Build a lineup from an existing band, then swap only the people who changed.
          </p>
        </div>
        <Button onClick={openCreate} disabled={!members.length}>
          <PlusIcon data-icon="inline-start" />
          New band
        </Button>
      </section>

      <AdminSectionNav />

      <Card>
        <CardHeader>
          <CardTitle>Saved lineups</CardTitle>
          <CardDescription>Five-character codes identify a band without exposing a long database ID.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : bands.length ? (
            <div className="divide-y rounded-lg border bg-card">
              {bands.map((band) => (
                <article key={band.id} className="flex flex-col gap-4 p-3 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">{band.title}</h2>
                        <Badge variant="outline" className="font-mono tracking-[0.12em]">{band.code}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{band.memberIds.length} members</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={async () => {
                        await navigator.clipboard.writeText(band.code);
                        setCopiedCode(band.code);
                        window.setTimeout(() => setCopiedCode(null), 1600);
                      }}>
                        {copiedCode === band.code ? <CheckIcon data-icon="inline-start" /> : <ClipboardIcon data-icon="inline-start" />}
                        {copiedCode === band.code ? "Copied" : "Copy code"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(band)}>
                        <PencilIcon data-icon="inline-start" />
                        Edit lineup
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setDeletingBand(band)}>
                        <Trash2Icon data-icon="inline-start" />
                        Delete
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2" aria-label={`${band.title} members`}>
                    {[...band.memberIds].sort((left, right) => {
                      const leftPart = band.vocalPartByMemberId[left];
                      const rightPart = band.vocalPartByMemberId[right];
                      return (leftPart ? VOCAL_PART_SLUGS.indexOf(leftPart) : 99)
                        - (rightPart ? VOCAL_PART_SLUGS.indexOf(rightPart) : 99);
                    }).map((memberId) => {
                      const member = memberMap.get(memberId);
                      const vocalPart = band.vocalPartByMemberId[memberId];
                      return (
                        <div key={memberId} className="flex items-center gap-1.5 rounded-lg border bg-muted/25 p-1.5 pr-2">
                          <MemberThumbnail displayName={member?.displayName ?? "Unknown member"} photoUrl={member?.photoUrl} />
                          {vocalPart ? (
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {partLabel(vocalPart)}
                            </Badge>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><UsersRoundIcon aria-hidden /></EmptyMedia>
                <EmptyTitle>No bands yet</EmptyTitle>
                <EmptyDescription>Create a lineup after adding members.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editingBand)} onOpenChange={(open) => (!open && !saving ? setEditingBand(null) : undefined)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingBand === "new" ? "Create band" : "Edit band"}</DialogTitle>
            <DialogDescription>
              Choose the lineup and each member’s default vocal part. Vocal part order controls the columns on the assignment board.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="flex flex-col gap-5">
            <FieldGroup>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="band-title">Band title</FieldLabel>
                <Input id="band-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Band C · Joe out, Al in" aria-invalid={Boolean(error)} required />
                <FieldDescription>{error ?? (editingBand === "new" ? "A five-character code is generated automatically." : `Band code ${editingBand ? editingBand.code : ""} stays the same.`)}</FieldDescription>
              </Field>
              {editingBand === "new" && bands.length ? (
                <Field>
                  <FieldLabel htmlFor="source-band">Start from</FieldLabel>
                  <Select
                    items={[
                      { label: "Blank lineup", value: "blank" },
                      ...bands.map((band) => ({ label: band.title, value: band.id })),
                    ]}
                    value={sourceBandId}
                    onValueChange={useSourceBand}
                  >
                    <SelectTrigger id="source-band" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="blank">Blank lineup</SelectItem>
                        {bands.map((band) => <SelectItem key={band.id} value={band.id}>{band.title}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>Copies the roster and its default vocal-part order. Song arrangements stay separate.</FieldDescription>
                </Field>
              ) : null}
              <FieldSet>
                <FieldLegend>Members</FieldLegend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {members.map((member) => {
                    const selected = selectedMemberIds.includes(member.id);
                    const selectedPart = vocalPartByMemberId[member.id] ?? UNASSIGNED_VOCAL_PART;
                    const usedByAnotherMember = new Set(
                      Object.entries(vocalPartByMemberId).flatMap(([id, partSlug]) =>
                        id !== member.id && partSlug ? [partSlug] : [],
                      ),
                    );

                    return (
                      <div key={member.id} className="grid gap-2 rounded-lg border bg-card p-3">
                        <Field orientation="horizontal">
                          <Checkbox id={`band-member-${member.id}`} checked={selected} onCheckedChange={(checked) => toggleMember(member.id, checked === true)} />
                          <FieldContent>
                            <FieldLabel htmlFor={`band-member-${member.id}`}>{member.displayName}</FieldLabel>
                            <FieldDescription>{member.firstName} {member.lastName}</FieldDescription>
                          </FieldContent>
                        </Field>
                        {selected ? (
                          <Field>
                            <FieldLabel htmlFor={`band-vocal-${member.id}`}>Default vocal part</FieldLabel>
                            <Select
                              items={[
                                { label: "Not on assignment board", value: UNASSIGNED_VOCAL_PART },
                                ...VOCAL_PART_SLUGS.map((partSlug) => ({ label: partLabel(partSlug), value: partSlug })),
                              ]}
                              value={selectedPart}
                              onValueChange={(value) => setMemberVocalPart(member.id, value)}
                            >
                              <SelectTrigger id={`band-vocal-${member.id}`} className="w-full"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value={UNASSIGNED_VOCAL_PART}>Not on assignment board</SelectItem>
                                  {VOCAL_PART_SLUGS.map((partSlug) => (
                                    <SelectItem key={partSlug} value={partSlug} disabled={usedByAnotherMember.has(partSlug)}>
                                      {partLabel(partSlug)}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </Field>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <FieldDescription>
                  The five vocal parts must be unique. Members without a part will not receive a column on /assignments.
                </FieldDescription>
              </FieldSet>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingBand(null)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving || !title.trim() || !selectedMemberIds.length}>
                {saving ? "Saving..." : editingBand === "new" ? `Create band with ${selectedMemberIds.length}` : "Save lineup"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletingBand)} onOpenChange={(open) => (!open ? setDeletingBand(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete band</DialogTitle>
            <DialogDescription>{deletingBand ? `Delete ${deletingBand.title} and its band-only overrides? Member defaults will stay intact.` : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingBand(null)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              if (!deletingBand) return;
              await deleteBand(deletingBand.id);
              setDeletingBand(null);
              await refresh();
            }}>Delete band</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
