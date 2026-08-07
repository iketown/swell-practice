"use client";

import { Trash2Icon, UnplugIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CABLE_CONNECTOR_TYPES, connectorSnapshot } from "@/lib/setup-designer/catalog";
import type { CableEdge, ConnectorSnapshot, FulfillmentStatus } from "@/lib/setup-designer/domain";

export function CableInspector({ edge, onChange, onDelete }: { edge: CableEdge; onChange: (edge: CableEdge) => void; onDelete: (edgeId: string) => void }) {
  const data = edge.data;
  const measuredOnStage = Boolean(data.stageRoute);
  const updateData = (patch: Partial<CableEdge["data"]>) => onChange({ ...edge, data: { ...data, ...patch } });

  return (
    <div className="flex flex-col gap-4 p-3">
      <div>
        <h3 className="text-sm font-semibold">Cable run</h3>
        <p className="text-xs text-muted-foreground">Physical cable from source to destination.</p>
      </div>
      <div className="flex gap-2 rounded-md border bg-muted/30 p-2.5">
        <UnplugIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <p className="text-xs font-semibold">Repatch on the canvas</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Drag either highlighted cable endpoint to another compatible port. Cable details stay with the run.</p>
        </div>
      </div>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="cable-name">Name</FieldLabel>
          <Input id="cable-name" value={data.name ?? ""} onChange={(event) => updateData({ name: event.target.value })} placeholder="Vocal 3 to stage box" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <CableEndFields label="Source end" value={data.endA} onChange={(endA) => updateData({ endA })} />
          <CableEndFields label="Destination end" value={data.endB} onChange={(endB) => updateData({ endB })} />
        </div>
        <div className="grid grid-cols-[1fr_5.5rem] gap-2">
          <Field>
            <FieldLabel htmlFor="cable-length">{measuredOnStage ? "Required length" : "Estimated length"}</FieldLabel>
            <Input id="cable-length" type="number" min={0} value={data.estimatedLength ?? ""} onChange={(event) => updateData({ estimatedLength: event.target.value ? Number(event.target.value) : undefined })} placeholder="25" readOnly={measuredOnStage} />
            {measuredOnStage ? <p className="text-xs text-muted-foreground">Calculated from the STAGE route.</p> : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="cable-unit">Unit</FieldLabel>
            <Select value={data.lengthUnit} onValueChange={(value) => value && updateData({ lengthUnit: value as "ft" | "m" })}>
              <SelectTrigger id="cable-unit" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="ft">ft</SelectItem><SelectItem value="m">m</SelectItem></SelectGroup></SelectContent>
            </Select>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="cable-status">How will you supply it?</FieldLabel>
          <Select value={data.fulfillment} onValueChange={(value) => value && updateData({ fulfillment: value as FulfillmentStatus })}>
            <SelectTrigger id="cable-status" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="unplanned">Unplanned</SelectItem>
              <SelectItem value="owned">Owned</SelectItem>
              <SelectItem value="rent">Rent</SelectItem>
              <SelectItem value="buy">Buy</SelectItem>
            </SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="cable-inventory">Inventory cable</FieldLabel>
          <Input id="cable-inventory" value={data.assignedInventoryLabel ?? ""} placeholder="Not assigned" readOnly />
          <FieldDescription>Use the Match tab to assign a tagged cable from inventory.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="cable-color">Cable color</FieldLabel>
          <div className="grid grid-cols-[3rem_1fr] gap-2">
            <Input id="cable-color" type="color" value={data.color} onChange={(event) => updateData({ color: event.target.value })} className="cursor-pointer p-1" />
            <Input aria-label="Cable color value" value={data.color} onChange={(event) => updateData({ color: event.target.value })} />
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="cable-notes">Notes</FieldLabel>
          <Textarea id="cable-notes" value={data.notes ?? ""} onChange={(event) => updateData({ notes: event.target.value })} placeholder="Run along downstage edge." rows={3} />
        </Field>
        <Field data-invalid={Boolean(data.exception)}>
          <FieldLabel htmlFor="cable-exception">Compatibility exception</FieldLabel>
          <Textarea id="cable-exception" value={data.exception?.reason ?? ""} onChange={(event) => updateData({ exception: event.target.value.trim() ? { reason: event.target.value } : undefined })} placeholder="Leave blank when the connection is normal." rows={2} aria-invalid={Boolean(data.exception)} />
        </Field>
      </FieldGroup>
      <Button variant="destructive" onClick={() => onDelete(edge.id)}>
        <Trash2Icon data-icon="inline-start" />
        Remove cable
      </Button>
    </div>
  );
}

function CableEndFields({ label, value, onChange }: { label: string; value: ConnectorSnapshot; onChange: (value: ConnectorSnapshot) => void }) {
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border bg-muted/25 p-2">
      <legend className="px-1 text-xs font-semibold">{label}</legend>
      <Select value={value.typeId} onValueChange={(typeId) => typeId && onChange(connectorSnapshot(typeId, value.gender, value.specification))}>
        <SelectTrigger aria-label={`${label} connector`} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>{CABLE_CONNECTOR_TYPES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
      <Select value={value.gender} onValueChange={(gender) => gender && onChange(connectorSnapshot(value.typeId, gender as ConnectorSnapshot["gender"], value.specification))}>
        <SelectTrigger aria-label={`${label} gender`} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="female">Female</SelectItem><SelectItem value="male">Male</SelectItem><SelectItem value="none">None</SelectItem></SelectGroup></SelectContent>
      </Select>
    </fieldset>
  );
}
