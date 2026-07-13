"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLinkIcon, MailIcon, PencilIcon, PhoneIcon, PlusIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { AdminSectionNav } from "@/components/admin-section-nav";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAdmin } from "@/hooks/use-admin";
import { createMember, deleteMember, listMembers, updateMember } from "@/lib/assignments";
import type { BandMember } from "@/lib/domain";

type MemberInput = Omit<BandMember, "id" | "slug">;

const emptyMember: MemberInput = {
  firstName: "",
  lastName: "",
  displayName: "",
  email: "",
  phone: "",
  notes: "",
};

export function MemberAdminClient() {
  const admin = useAdmin();
  const router = useRouter();
  const [members, setMembers] = useState<BandMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMember, setEditingMember] = useState<BandMember | "new" | null>(null);
  const [form, setForm] = useState<MemberInput>(emptyMember);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingMember, setDeletingMember] = useState<BandMember | null>(null);

  useEffect(() => {
    if (!admin.loading && !admin.isAdmin) router.replace("/");
  }, [admin.isAdmin, admin.loading, router]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setMembers(await listMembers(true));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!admin.isAdmin) return;
    let active = true;
    listMembers(true)
      .then((items) => {
        if (active) setMembers(items);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [admin.isAdmin]);

  function openForm(member?: BandMember) {
    setEditingMember(member ?? "new");
    setForm(member ? {
      firstName: member.firstName,
      lastName: member.lastName,
      displayName: member.displayName,
      email: member.email ?? "",
      phone: member.phone ?? "",
      notes: member.notes ?? "",
    } : emptyMember);
    setError(null);
  }

  function updateField(field: keyof MemberInput, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editingMember === "new") await createMember(form);
      else if (editingMember) await updateMember(editingMember, form);
      setEditingMember(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this member.");
    } finally {
      setSaving(false);
    }
  }

  if (admin.loading || !admin.isAdmin) return null;

  return (
    <AppShell>
      <section className="swell-panel flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
        <div className="grid gap-1">
          <p className="swell-page-kicker">Owner tools</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Members</h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            One person record carries defaults across every band they join.
          </p>
        </div>
        <Button onClick={() => openForm()}>
          <PlusIcon data-icon="inline-start" />
          Add member
        </Button>
      </section>

      <AdminSectionNav />

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
          <CardDescription>{loading ? "Loading members" : `${members.length} people available for band lineups`}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : members.length ? (
            <div className="divide-y rounded-lg border bg-card">
              {members.map((member) => (
                <article key={member.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h2 className="font-semibold">{member.displayName}</h2>
                      <span className="text-sm text-muted-foreground">{member.firstName} {member.lastName}</span>
                      <Badge variant="secondary">/{member.slug}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {member.email ? <span className="inline-flex items-center gap-1"><MailIcon aria-hidden className="size-3.5" />{member.email}</span> : null}
                      {member.phone ? <span className="inline-flex items-center gap-1"><PhoneIcon aria-hidden className="size-3.5" />{member.phone}</span> : null}
                      {!member.email && !member.phone ? <span>No contact details yet</span> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button render={<Link href={`/members/${member.slug}`} />} variant="secondary" size="sm" nativeButton={false}>
                      <ExternalLinkIcon data-icon="inline-start" />
                      Member page
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openForm(member)}>
                      <PencilIcon data-icon="inline-start" />
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setDeletingMember(member)}>
                      <Trash2Icon data-icon="inline-start" />
                      Delete
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><UsersIcon aria-hidden /></EmptyMedia>
                <EmptyTitle>No members yet</EmptyTitle>
                <EmptyDescription>Add the first person, then include them in a band.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editingMember)} onOpenChange={(open) => (!open && !saving ? setEditingMember(null) : undefined)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingMember === "new" ? "Add member" : "Edit member"}</DialogTitle>
            <DialogDescription>Display name becomes the friendly member-page URL.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="flex flex-col gap-4">
            <FieldGroup className="sm:grid sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="member-first-name">First name</FieldLabel>
                <Input id="member-first-name" value={form.firstName} onChange={(event) => updateField("firstName", event.target.value)} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="member-last-name">Last name</FieldLabel>
                <Input id="member-last-name" value={form.lastName} onChange={(event) => updateField("lastName", event.target.value)} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="member-display-name">Display name</FieldLabel>
                <Input id="member-display-name" value={form.displayName} onChange={(event) => updateField("displayName", event.target.value)} placeholder={form.firstName || "Ike"} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="member-email">Contact email</FieldLabel>
                <Input id="member-email" type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="member-phone">Phone</FieldLabel>
                <Input id="member-phone" type="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
              </Field>
              <Field className="sm:col-span-2" data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="member-notes">Notes</FieldLabel>
                <Textarea id="member-notes" value={form.notes} onChange={(event) => updateField("notes", event.target.value)} aria-invalid={Boolean(error)} />
                <FieldDescription>{error ?? "Private admin context, such as preferred roles or scheduling notes."}</FieldDescription>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingMember(null)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving || !form.firstName.trim() || !form.lastName.trim() || !form.displayName.trim()}>
                {saving ? "Saving..." : "Save member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletingMember)} onOpenChange={(open) => (!open ? setDeletingMember(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete member</DialogTitle>
            <DialogDescription>
              {deletingMember ? `Delete ${deletingMember.displayName}? This also removes them from bands and deletes their defaults and overrides.` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingMember(null)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              if (!deletingMember) return;
              await deleteMember(deletingMember.id);
              setDeletingMember(null);
              await refresh();
            }}>Delete member</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
