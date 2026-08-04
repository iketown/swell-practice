"use client";

import { PlusIcon } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { GearLocation, GearLocationKind, GearParty, GearPartyKind } from "@/lib/gear/domain";
import { createGearLocation, createGearParty } from "@/lib/gear/repository";

const PARTY_KINDS: Array<{ value: GearPartyKind; label: string }> = [
  { value: "person", label: "Person" },
  { value: "band", label: "Band" },
  { value: "company", label: "Company" },
  { value: "provider", label: "Backline / provider" },
  { value: "vendor", label: "Vendor" },
];

const LOCATION_KINDS: Array<{ value: GearLocationKind; label: string }> = [
  { value: "house", label: "House" },
  { value: "vehicle", label: "Vehicle" },
  { value: "studio", label: "Studio" },
  { value: "venue", label: "Venue" },
  { value: "warehouse", label: "Warehouse" },
  { value: "container", label: "Container" },
  { value: "other", label: "Other" },
];

export function GearDirectoryDialog({
  open,
  onOpenChange,
  kind,
  onPartyCreated,
  onLocationCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "party" | "location";
  onPartyCreated?: (party: GearParty) => void;
  onLocationCreated?: (location: GearLocation) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<GearPartyKind | GearLocationKind>(kind === "party" ? "person" : "other");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setType(kind === "party" ? "person" : "other");
    setNotes("");
    setError(null);
  }

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (kind === "party") {
        const party = await createGearParty({ name, kind: type as GearPartyKind, notes });
        onPartyCreated?.(party);
      } else {
        const location = await createGearLocation({ name, kind: type as GearLocationKind, notes });
        onLocationCreated?.(location);
      }
      changeOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not create this ${kind}.`);
    } finally {
      setSaving(false);
    }
  }

  const options = kind === "party" ? PARTY_KINDS : LOCATION_KINDS;
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{kind === "party" ? "Add owner or provider" : "Add gear location"}</DialogTitle>
          <DialogDescription>
            {kind === "party"
              ? "Owners and providers are an open directory: band members, hired musicians, venues, and backline companies all fit the same model."
              : "Locations can be houses, cars, studios, venues, warehouses, or later a QR-tagged container."}
          </DialogDescription>
        </DialogHeader>
        <form id="gear-directory-form" onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="gear-directory-name">Name</FieldLabel>
              <Input id="gear-directory-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "party" ? "Touring guitarist" : "Cron's car"} required disabled={saving} />
            </Field>
            <Field>
              <FieldLabel htmlFor="gear-directory-type">Type</FieldLabel>
              <Select value={type} onValueChange={(value) => value && setType(value as GearPartyKind | GearLocationKind)} disabled={saving}>
                <SelectTrigger id="gear-directory-type" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="gear-directory-notes">Notes</FieldLabel>
              <Textarea id="gear-directory-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} disabled={saving} />
            </Field>
          </FieldGroup>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => changeOpen(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" form="gear-directory-form" disabled={saving || !name.trim()}>
            <PlusIcon data-icon="inline-start" />
            {saving ? "Adding..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
