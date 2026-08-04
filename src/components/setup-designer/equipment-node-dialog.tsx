"use client";

import { BoxesIcon, ExternalLinkIcon, PackagePlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import { GearAssetDialog } from "@/components/gear/gear-asset-dialog";
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
import { lifecycleLabel, type GearLocation, type GearParty, type InventoryAsset } from "@/lib/gear/domain";
import { findAssetAssignment } from "@/lib/setup-designer/asset-assignments";
import type { EquipmentNodeData, EquipmentTemplate, FulfillmentStatus, SetupNode } from "@/lib/setup-designer/domain";
import { updateEquipmentTemplateImages } from "@/lib/setup-designer/repository";

interface EquipmentNodeDialogProps {
  node: SetupNode | null;
  setupId: string;
  gearHref: string;
  templates: EquipmentTemplate[];
  assets: InventoryAsset[];
  parties: GearParty[];
  locations: GearLocation[];
  setupNodes: SetupNode[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (nodeId: string, data: EquipmentNodeData) => string | null;
  onDelete: (nodeId: string) => void;
  onTemplateUpdated: (template: EquipmentTemplate) => void;
  onAssetCreated: (asset: InventoryAsset) => void;
}

export function EquipmentNodeDialog({ node, setupId, gearHref, templates, assets, parties, locations, setupNodes, open, onOpenChange, onSave, onDelete, onTemplateUpdated, onAssetCreated }: EquipmentNodeDialogProps) {
  const [draft, setDraft] = useState<EquipmentNodeData | null>(() => node ? structuredClone(node.data) : null);
  const [pendingIcon, setPendingIcon] = useState<PendingEquipmentIcon | null>(null);
  const [pendingDetailFiles, setPendingDetailFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const template = useMemo(() => templates.find((item) => item.id === draft?.templateId), [draft?.templateId, templates]);
  const matchingAssets = useMemo(() => assets.filter((asset) => asset.definitionId === draft?.templateId && asset.lifecycleStatus !== "retired" && asset.lifecycleStatus !== "cancelled"), [assets, draft?.templateId]);
  const assetUsageById = useMemo(() => new Map(matchingAssets.flatMap((asset) => {
    const assignment = findAssetAssignment(setupNodes, asset.id, node?.id);
    return assignment ? [[asset.id, assignment] as const] : [];
  })), [matchingAssets, node?.id, setupNodes]);
  const selectedAssetConflict = draft?.fulfillment === "owned" && draft.assignedAssetId
    ? assetUsageById.get(draft.assignedAssetId)
    : undefined;
  const availableAssetCount = matchingAssets.filter((asset) => !assetUsageById.has(asset.id)).length;

  if (!node || !draft) return null;
  const nodeId = node.id;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft?.name.trim() || saving) return;
    if (selectedAssetConflict) {
      setError(`${draft.assignedAssetLabel || "This asset"} is already being used in this setup by ${selectedAssetConflict.nodeName}.`);
      return;
    }
    setSaving(true);
    setError(null);
    setUploadProgress(0);
    try {
      let nextDraft: EquipmentNodeData = {
        ...draft,
        name: draft.name.trim(),
        assignedAssetLabel: draft.assignedAssetLabel?.trim() || undefined,
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

      const saveError = onSave(nodeId, nextDraft);
      if (saveError) {
        setError(saveError);
        return;
      }
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
          <DialogDescription>{node.data.assemblyId
            ? `Configure ${node.data.transportEndpointLabel ?? "this snake endpoint"}. Asset and provider changes apply to the complete ${node.data.transport?.kind === "split-snake" ? "split snake" : "snake"}; port edits apply only to this side.`
            : "Configure this setup instance, its exact ports, and the asset or outside provider that will fulfill it."}</DialogDescription>
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
                    ...(fulfillment === "owned" ? { providerPartyId: undefined, providerPartyName: undefined } : { assignedAssetId: undefined, assignedAssetLabel: undefined, assignedUnitId: undefined, assignedUnitLabel: undefined }),
                    ...(fulfillment === "rent" ? {} : { providerPartyId: undefined, providerPartyName: undefined }),
                  });
                }} disabled={saving}>
                  <SelectTrigger id="node-status" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value="unplanned">Unplanned</SelectItem>
                    <SelectItem value="owned">Owned / planned asset</SelectItem>
                    <SelectItem value="rent">Outside provider</SelectItem>
                    <SelectItem value="buy">Needs purchase · not reserved</SelectItem>
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
              {draft.fulfillment === "owned" ? (
                <>
                  <Field className="sm:col-span-2" data-invalid={Boolean(selectedAssetConflict)}>
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div><FieldLabel htmlFor="node-inventory-asset">Exact gear asset</FieldLabel><FieldDescription>Select an on-hand or planned item. Planned assets already have their permanent QR identity.</FieldDescription></div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setAssetDialogOpen(true)} disabled={!template || saving}><PackagePlusIcon data-icon="inline-start" />Create planned asset</Button>
                        <Link href={gearHref} className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-4"><BoxesIcon className="size-3.5" aria-hidden />Open gear</Link>
                      </div>
                    </div>
                    <Select value={draft.assignedAssetId ?? "none"} onValueChange={(value) => {
                      if (!value || value === "none") {
                        setError(null);
                        setDraft({ ...draft, assignedAssetId: undefined, assignedAssetLabel: undefined });
                        return;
                      }
                      const existingAssignment = assetUsageById.get(value);
                      if (existingAssignment) {
                        setError(`Already being used in this setup by ${existingAssignment.nodeName}.`);
                        return;
                      }
                      const asset = matchingAssets.find((item) => item.id === value);
                      setError(null);
                      setDraft({ ...draft, assignedAssetId: asset?.id, assignedAssetLabel: asset?.label });
                    }} disabled={saving}>
                      <SelectTrigger id="node-inventory-asset" className="w-full" aria-invalid={Boolean(selectedAssetConflict)}><SelectValue /></SelectTrigger>
                      <SelectContent><SelectGroup>
                        <SelectItem value="none">Not assigned yet</SelectItem>
                        {matchingAssets.map((asset) => {
                          const assignment = assetUsageById.get(asset.id);
                          return (
                            <SelectItem key={asset.id} value={asset.id} disabled={Boolean(assignment)}>
                              <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                                <span className="truncate">{asset.label} · {lifecycleLabel(asset.lifecycleStatus)}</span>
                                {assignment ? <span className="shrink-0 text-xs font-medium text-destructive">Already used by {assignment.nodeName}</span> : null}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectGroup></SelectContent>
                    </Select>
                    {selectedAssetConflict ? <p className="text-sm font-medium text-destructive" role="alert">Already being used in this setup by {selectedAssetConflict.nodeName}. Choose another asset or a different fulfillment source.</p> : null}
                    {!matchingAssets.length ? <FieldDescription>No matching assets yet. Create a planned one without leaving this setup.</FieldDescription> : null}
                    {matchingAssets.length > 0 && availableAssetCount === 0 && !selectedAssetConflict ? <FieldDescription>Every matching asset is already used in this setup. Create another planned asset or choose an outside provider.</FieldDescription> : null}
                  </Field>
                  {!draft.assignedAssetId && template?.ownedUnits.length ? (
                    <Field className="sm:col-span-2">
                      <FieldLabel htmlFor="node-legacy-unit">Legacy owned-unit label</FieldLabel>
                      <Select value={draft.assignedUnitId ?? "none"} onValueChange={(value) => {
                        if (!value || value === "none") return setDraft({ ...draft, assignedUnitId: undefined, assignedUnitLabel: undefined });
                        const unit = template.ownedUnits.find((item) => item.id === value);
                        setDraft({ ...draft, assignedUnitId: unit?.id, assignedUnitLabel: unit?.label });
                      }} disabled={saving}>
                        <SelectTrigger id="node-legacy-unit" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectGroup><SelectItem value="none">No legacy assignment</SelectItem>{template.ownedUnits.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.label}</SelectItem>)}</SelectGroup></SelectContent>
                      </Select>
                      <FieldDescription>Older setup assignments remain readable while they are migrated to permanent gear assets.</FieldDescription>
                    </Field>
                  ) : null}
                </>
              ) : null}
              {draft.fulfillment === "rent" ? (
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="node-provider">Owner or outside provider</FieldLabel>
                  <Select value={draft.providerPartyId ?? "none"} onValueChange={(value) => {
                    if (!value || value === "none") return setDraft({ ...draft, providerPartyId: undefined, providerPartyName: undefined });
                    const party = parties.find((item) => item.id === value);
                    setDraft({ ...draft, providerPartyId: party?.id, providerPartyName: party?.name });
                  }} disabled={saving}>
                    <SelectTrigger id="node-provider" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup><SelectItem value="none">Provider not assigned</SelectItem>{parties.map((party) => <SelectItem key={party.id} value={party.id}>{party.name}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                  <FieldDescription>Use this for a hired musician, venue, rental house, or backline company supplying an equivalent item.</FieldDescription>
                </Field>
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
            {draft.assemblyId ? "Remove snake" : "Remove node"}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="equipment-node-form" disabled={saving || !draft.name.trim() || Boolean(selectedAssetConflict)}>
              <SaveIcon data-icon="inline-start" />
              {saving ? "Saving..." : "Apply changes"}
            </Button>
          </div>
        </DialogFooter>
        <GearAssetDialog
          open={assetDialogOpen}
          onOpenChange={setAssetDialogOpen}
          definitions={templates}
          assets={assets}
          parties={parties}
          locations={locations}
          initialDefinitionId={template?.id}
          initialLifecycle="planned"
          sourceSetupId={setupId}
          onSaved={(asset) => {
            onAssetCreated(asset);
            setDraft((current) => current ? { ...current, fulfillment: "owned", assignedAssetId: asset.id, assignedAssetLabel: asset.label } : current);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
