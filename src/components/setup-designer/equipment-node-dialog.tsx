"use client";

import { ExternalLinkIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import {
  EquipmentIconEditor,
  cropEquipmentIcon,
  type PendingEquipmentIcon,
} from "@/components/setup-designer/equipment-icon-editor";
import { EquipmentPhotoGallery } from "@/components/setup-designer/equipment-photo-gallery";
import { EquipmentPortEditor } from "@/components/setup-designer/equipment-port-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { EquipmentNodeData, EquipmentTemplate, FulfillmentStatus, SetupNode } from "@/lib/setup-designer/domain";
import { updateEquipmentTemplateImages } from "@/lib/setup-designer/repository";

interface EquipmentNodeDialogProps {
  node: SetupNode | null;
  templates: EquipmentTemplate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (nodeId: string, data: EquipmentNodeData) => void;
  onDelete: (nodeId: string) => void;
  onTemplateUpdated: (template: EquipmentTemplate) => void;
}

export function EquipmentNodeDialog({ node, templates, open, onOpenChange, onSave, onDelete, onTemplateUpdated }: EquipmentNodeDialogProps) {
  const [draft, setDraft] = useState<EquipmentNodeData | null>(() => node ? structuredClone(node.data) : null);
  const [pendingIcon, setPendingIcon] = useState<PendingEquipmentIcon | null>(null);
  const [pendingDetailFiles, setPendingDetailFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const template = useMemo(() => templates.find((item) => item.id === draft?.templateId), [draft?.templateId, templates]);

  if (!node || !draft) return null;
  const nodeId = node.id;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft?.name.trim() || saving) return;
    setSaving(true);
    setError(null);
    setUploadProgress(0);
    try {
      let nextDraft: EquipmentNodeData = {
        ...draft,
        name: draft.name.trim(),
        assignedUnitLabel: draft.assignedUnitLabel?.trim() || undefined,
      };

      if (pendingIcon || pendingDetailFiles.length) {
        if (!template) throw new Error("This node is not linked to an equipment template, so its photos cannot be stored yet.");
        const iconFile = pendingIcon ? await cropEquipmentIcon(pendingIcon) : undefined;
        const updatedTemplate = await updateEquipmentTemplateImages(template, {
          iconFile,
          detailFiles: pendingDetailFiles,
        }, setUploadProgress);
        nextDraft = {
          ...nextDraft,
          templateVersion: updatedTemplate.version,
          ...(iconFile && updatedTemplate.image ? {
            image: {
              storagePath: updatedTemplate.image.storagePath,
              downloadUrl: updatedTemplate.image.downloadUrl,
              contentType: updatedTemplate.image.contentType,
            },
          } : {}),
        };
        onTemplateUpdated(updatedTemplate);
      }

      onSave(nodeId, nextDraft);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save these equipment photos.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Edit {node.data.name}</DialogTitle>
          <DialogDescription>Configure this setup instance, its exact ports, and the physical unit that will be used.</DialogDescription>
        </DialogHeader>
        <form id="equipment-node-form" onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
            <Field>
              <FieldLabel>Stage-plot icon</FieldLabel>
              <EquipmentIconEditor
                nodeName={draft.name}
                currentImageUrl={draft.image?.downloadUrl}
                currentFilename={template?.image?.filename}
                pendingIcon={pendingIcon}
                onPendingIconChange={setPendingIcon}
                disabled={saving}
              />
              <FieldDescription>This reusable icon is shown on every new diagram node made from this equipment.</FieldDescription>
            </Field>

            <FieldGroup className="grid content-start gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="node-name">Node name</FieldLabel>
                <Input id="node-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required disabled={saving} />
              </Field>
              <Field>
                <FieldLabel htmlFor="node-status">How will you supply it?</FieldLabel>
                <Select value={draft.fulfillment} onValueChange={(value) => {
                  if (!value) return;
                  const fulfillment = value as FulfillmentStatus;
                  setDraft({
                    ...draft,
                    fulfillment,
                    ...(fulfillment === "owned" ? {} : { assignedUnitId: undefined, assignedUnitLabel: undefined }),
                  });
                }} disabled={saving}>
                  <SelectTrigger id="node-status" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value="unplanned">Unplanned</SelectItem>
                    <SelectItem value="owned">Owned</SelectItem>
                    <SelectItem value="rent">Rent</SelectItem>
                    <SelectItem value="buy">Buy</SelectItem>
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
              {draft.fulfillment === "owned" ? (
                <>
                  {template?.ownedUnits.length ? (
                    <Field>
                      <FieldLabel htmlFor="node-owned-unit">Owned item / asset</FieldLabel>
                      <Select value={draft.assignedUnitId ?? "custom"} onValueChange={(value) => {
                        if (!value) return;
                        const unit = template.ownedUnits.find((item) => item.id === value);
                        setDraft({ ...draft, assignedUnitId: unit?.id, assignedUnitLabel: unit?.label ?? draft.assignedUnitLabel });
                      }} disabled={saving}>
                        <SelectTrigger id="node-owned-unit" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectGroup>
                          <SelectItem value="custom">Custom / not assigned</SelectItem>
                          {template.ownedUnits.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.label}</SelectItem>)}
                        </SelectGroup></SelectContent>
                      </Select>
                      <FieldDescription>Searchable tagged assets will replace this template-level list when Gear Inventory ships.</FieldDescription>
                    </Field>
                  ) : null}
                  {!draft.assignedUnitId ? (
                    <Field>
                      <FieldLabel htmlFor="node-asset-label">Temporary asset label</FieldLabel>
                      <Input id="node-asset-label" value={draft.assignedUnitLabel ?? ""} onChange={(event) => setDraft({ ...draft, assignedUnitId: undefined, assignedUnitLabel: event.target.value })} placeholder="Radial JDI #2" disabled={saving} />
                      <FieldDescription>The tagged asset inventory and “Create asset” page are planned, but not implemented yet.</FieldDescription>
                    </Field>
                  ) : null}
                </>
              ) : null}
            </FieldGroup>
          </FieldGroup>

          {template && (template.description || template.purchaseSource) ? (
            <FieldGroup className="rounded-lg border bg-muted/30 p-3">
              {template.description ? (
                <Field>
                  <FieldLabel>Gear description</FieldLabel>
                  <p className="text-sm text-muted-foreground">{template.description}</p>
                </Field>
              ) : null}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {template.purchaseSource ? (
                  <a href={template.purchaseSource.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-4">
                    {template.purchaseSource.vendor || "Product source"}
                    {template.purchaseSource.priceDisplay ? ` · ${template.purchaseSource.priceDisplay}` : template.purchaseSource.priceAmount != null ? ` · ${template.purchaseSource.priceCurrency ? `${template.purchaseSource.priceCurrency} ` : ""}${template.purchaseSource.priceAmount}` : ""}
                    <ExternalLinkIcon aria-hidden className="size-3.5" />
                  </a>
                ) : null}
              </div>
            </FieldGroup>
          ) : null}

          {template ? (
            <FieldGroup className="rounded-lg border bg-muted/30 p-3">
              <Field>
                <FieldLabel>Detail and port photos</FieldLabel>
                <EquipmentPhotoGallery
                  template={template}
                  pendingFiles={pendingDetailFiles}
                  onPendingFilesChange={setPendingDetailFiles}
                  disabled={saving}
                />
              </Field>
            </FieldGroup>
          ) : null}

          <FieldGroup className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
            <Field orientation="horizontal">
              <FieldLabel htmlFor="show-port-numbers">Show port numbers</FieldLabel>
              <Switch id="show-port-numbers" checked={draft.showPortNumbers} onCheckedChange={(checked) => setDraft({ ...draft, showPortNumbers: checked })} />
            </Field>
            <Field orientation="horizontal">
              <FieldLabel htmlFor="show-port-labels">Show port labels</FieldLabel>
              <Switch id="show-port-labels" checked={draft.showPortLabels} onCheckedChange={(checked) => setDraft({ ...draft, showPortLabels: checked })} />
            </Field>
          </FieldGroup>

          <EquipmentPortEditor
            ports={draft.ports}
            onChange={(ports) => setDraft({ ...draft, ports })}
            idPrefix={`equipment-node-${nodeId}`}
          />

          <Field>
            <FieldLabel htmlFor="node-notes">Setup notes</FieldLabel>
            <Textarea id="node-notes" value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Power from stage-left circuit." rows={3} disabled={saving} />
          </Field>
          {saving && (pendingIcon || pendingDetailFiles.length) ? <Progress value={uploadProgress} aria-label={`Equipment photo upload ${uploadProgress}% complete`} /> : null}
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </form>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="destructive" onClick={() => { onDelete(nodeId); onOpenChange(false); }} disabled={saving}>
            <Trash2Icon data-icon="inline-start" />
            Remove node
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="equipment-node-form" disabled={saving || !draft.name.trim()}>
              <SaveIcon data-icon="inline-start" />
              {saving ? "Saving..." : "Apply changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
