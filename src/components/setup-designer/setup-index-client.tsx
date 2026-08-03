"use client";

import { ArchiveIcon, CopyIcon, ExternalLinkIcon, PackageOpenIcon, PencilIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAdmin } from "@/hooks/use-admin";
import type { SetupMetadata } from "@/lib/setup-designer/domain";
import { archiveSetup, createSetup, duplicateSetup, listSetups, renameSetup } from "@/lib/setup-designer/repository";

export function SetupIndexClient() {
  const admin = useAdmin();
  const router = useRouter();
  const setupHref = (path: string) => admin.isDemoAdmin ? `${path}?demo=1` : path;
  const [setups, setSetups] = useState<SetupMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState<SetupMetadata | null>(null);
  const [editing, setEditing] = useState<SetupMetadata | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);

  useEffect(() => {
    if (!admin.loading && !admin.isAdmin) router.replace("/");
  }, [admin.isAdmin, admin.loading, router]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSetups(await listSetups());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load setups.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!admin.isAdmin) return;
    let active = true;
    listSetups()
      .then((items) => { if (active) setSetups(items); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load setups."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [admin.isAdmin]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const id = await createSetup(name, description, admin.user?.uid ?? "demo-admin");
      setCreating(false);
      setName("");
      setDescription("");
      router.push(setupHref(`/setups/${id}`));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not create this setup.");
    } finally {
      setSaving(false);
    }
  }

  async function duplicate(setup: SetupMetadata) {
    setWorkingId(setup.id);
    try {
      const id = await duplicateSetup(setup.id, admin.user?.uid ?? "demo-admin");
      toast.success("Setup duplicated.");
      router.push(setupHref(`/setups/${id}`));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not duplicate this setup.");
    } finally {
      setWorkingId(null);
    }
  }

  async function confirmArchive() {
    if (!archiving) return;
    setWorkingId(archiving.id);
    try {
      await archiveSetup(archiving.id, admin.user?.uid ?? "demo-admin");
      toast.success("Setup archived.");
      setArchiving(null);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not archive this setup.");
    } finally {
      setWorkingId(null);
    }
  }

  function beginEdit(setup: SetupMetadata) {
    setEditing(setup);
    setEditName(setup.name);
    setEditDescription(setup.description ?? "");
  }

  async function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      await renameSetup(editing.id, editName, editDescription, admin.user?.uid ?? "demo-admin");
      setEditing(null);
      toast.success("Setup details updated.");
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not update this setup.");
    } finally {
      setSaving(false);
    }
  }

  if (admin.loading || !admin.isAdmin) return null;

  return (
    <AppShell>
      <section className="swell-panel flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
        <div className="grid gap-1">
          <p className="swell-page-kicker">Signal planner</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Setups</h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">Plan every port, cable, and piece of equipment for studio, live, and video rigs.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={setupHref("/setups/equipment")} className={buttonVariants({ variant: "outline" })}><PackageOpenIcon data-icon="inline-start" />Equipment library</Link>
          <Button onClick={() => setCreating(true)}><PlusIcon data-icon="inline-start" />New setup</Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Active setups</h2><p className="text-sm text-muted-foreground">Duplicate a working rig before making a variant.</p></div>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}><RefreshCwIcon data-icon="inline-start" />Refresh</Button>
        </div>
        {loading ? <div className="flex flex-col gap-2"><Skeleton className="h-24" /><Skeleton className="h-24" /></div> : error ? (
          <Empty><EmptyHeader><EmptyTitle>Could not load setups</EmptyTitle><EmptyDescription>{error}</EmptyDescription></EmptyHeader></Empty>
        ) : setups.length ? (
          <div className="overflow-hidden rounded-lg border bg-card">
            {setups.map((setup) => (
              <div key={setup.id} className="flex flex-col gap-3 border-b p-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <Link href={setupHref(`/setups/${setup.id}`)} className="font-semibold hover:underline">{setup.name}</Link>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{setup.description || "No description"}</p>
                  <div className="mt-2 flex flex-wrap gap-2"><Badge variant="secondary">{setup.nodeCount} gear</Badge><Badge variant="secondary">{setup.cableCount} cables</Badge><Badge variant="outline">Revision {setup.revision}</Badge></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={setupHref(`/setups/${setup.id}`)} className={buttonVariants({ variant: "secondary", size: "sm" })}><ExternalLinkIcon data-icon="inline-start" />Open</Link>
                  <Button variant="outline" size="sm" onClick={() => beginEdit(setup)}><PencilIcon data-icon="inline-start" />Edit details</Button>
                  <Button variant="outline" size="sm" onClick={() => void duplicate(setup)} disabled={workingId === setup.id}><CopyIcon data-icon="inline-start" />{workingId === setup.id ? "Working..." : "Duplicate"}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setArchiving(setup)}><ArchiveIcon data-icon="inline-start" />Archive</Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty><EmptyHeader><EmptyTitle>No setups yet</EmptyTitle><EmptyDescription>Create a setup, then add microphones, instruments, D.I.s, stage boxes, mixers, and cables.</EmptyDescription></EmptyHeader><Button onClick={() => setCreating(true)}><PlusIcon data-icon="inline-start" />Create first setup</Button></Empty>
        )}
      </section>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>New setup</DialogTitle><DialogDescription>Start an empty signal plan. Equipment is added from the editor.</DialogDescription></DialogHeader>
          <form id="new-setup-form" onSubmit={create} className="flex flex-col gap-4">
            <FieldGroup>
              <Field><FieldLabel htmlFor="setup-name">Name</FieldLabel><Input id="setup-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Live · Main stage" required /></Field>
              <Field><FieldLabel htmlFor="setup-description">Description</FieldLabel><Textarea id="setup-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Full-band setup with the X32 and stage box." rows={3} /></Field>
            </FieldGroup>
          </form>
          <DialogFooter><Button variant="outline" onClick={() => setCreating(false)} disabled={saving}>Cancel</Button><Button type="submit" form="new-setup-form" disabled={!name.trim() || saving}>{saving ? "Creating..." : "Create setup"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(archiving)} onOpenChange={(open) => !open && setArchiving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Archive {archiving?.name}?</AlertDialogTitle><AlertDialogDescription>This removes it from the active list but keeps its saved graph and equipment references.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void confirmArchive()}>Archive setup</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit setup details</DialogTitle><DialogDescription>Rename this setup or clarify what this variation is for. The saved diagram stays unchanged.</DialogDescription></DialogHeader>
          <form id="edit-setup-form" onSubmit={saveMetadata} className="flex flex-col gap-4">
            <FieldGroup>
              <Field><FieldLabel htmlFor="edit-setup-name">Name</FieldLabel><Input id="edit-setup-name" value={editName} onChange={(event) => setEditName(event.target.value)} required /></Field>
              <Field><FieldLabel htmlFor="edit-setup-description">Description</FieldLabel><Textarea id="edit-setup-description" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} rows={3} /></Field>
            </FieldGroup>
          </form>
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button><Button type="submit" form="edit-setup-form" disabled={!editName.trim() || saving}>{saving ? "Saving..." : "Save details"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
