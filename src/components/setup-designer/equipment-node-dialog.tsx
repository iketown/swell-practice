"use client";

import { ArrowRightLeftIcon, CableIcon, ExternalLinkIcon, PackagePlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { GearAssetDialog } from "@/components/gear/gear-asset-dialog";
import {
  EquipmentIconEditor,
  cropEquipmentIcon,
  type PendingEquipmentIcon,
} from "@/components/setup-designer/equipment-icon-editor";
import type { EquipmentImageSource } from "@/components/setup-designer/equipment-image-source-picker";
import { EquipmentPhotoGallery } from "@/components/setup-designer/equipment-photo-gallery";
import { EquipmentPortEditor } from "@/components/setup-designer/equipment-port-editor";
import {
  cropEquipmentStageImage,
  EquipmentStageImageEditor,
  type PendingEquipmentStageImage,
} from "@/components/setup-designer/equipment-stage-image-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { lifecycleLabel, type GearLocation, type GearParty, type InventoryAsset } from "@/lib/gear/domain";
import { findAssetAssignment, type AssetAssignment } from "@/lib/setup-designer/asset-assignments";
import { cableAssemblyPortDescription } from "@/lib/setup-designer/breakout-cables";
import { formatCableDefinitionEnd } from "@/lib/setup-designer/cable-definitions";
import type { EquipmentNodeData, EquipmentTemplate, FulfillmentStatus, SetupNode } from "@/lib/setup-designer/domain";
import { updateEquipmentTemplateImages } from "@/lib/setup-designer/repository";

interface EquipmentNodeDialogProps {
  node: SetupNode | null;
  setupId: string;
  templates: EquipmentTemplate[];
  assets: InventoryAsset[];
  parties: GearParty[];
  locations: GearLocation[];
  setupNodes: SetupNode[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (nodeId: string, data: EquipmentNodeData, options?: { reassignAssetFromNodeId?: string }) => string | null;
  onDelete: (nodeId: string) => void;
  onTemplateUpdated: (template: EquipmentTemplate) => void;
  onAssetCreated: (asset: InventoryAsset) => void;
}

export function EquipmentNodeDialog(props: EquipmentNodeDialogProps) {
  if (props.node?.data.cableAssembly) return <CableAssemblyNodeDialog {...props} />;
  return <StandardEquipmentNodeDialog {...props} />;
}

function CableAssemblyNodeDialog({ node, open, onOpenChange, onSave, onDelete }: EquipmentNodeDialogProps) {
  const [name, setName] = useState(node?.data.name ?? "");
  const [notes, setNotes] = useState(node?.data.notes ?? "");
  if (!node?.data.cableAssembly) return null;
  const assembly = node.data.cableAssembly;
  const inputs = node.data.ports.filter((port) => port.direction === "input");
  const outputs = node.data.ports.filter((port) => port.direction === "output");
  const breakout = inputs.length > 1 || outputs.length > 1;
  const connectedInventory = assembly.connectedInventory;
  const cableLabel = connectedInventory ? "connected assembly" : breakout ? "breakout cable" : "cable";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    const error = onSave(node!.id, {
      ...node!.data,
      name: name.trim(),
      notes: notes.trim() || undefined,
    });
    if (!error) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {cableLabel}</DialogTitle>
          <DialogDescription>{connectedInventory ? "These inventory items stay physically connected, check in together, and appear here through their exposed connectors." : breakout ? "Every connector leg belongs to one physical cable in Runs, Match, SIGNAL, and STAGE." : "This node represents one specific physical cable in the signal chain."}</DialogDescription>
        </DialogHeader>
        <form id="breakout-cable-node-form" onSubmit={submit} className="flex flex-col gap-5">
          <div className="grid gap-3 rounded-lg border bg-muted/25 p-3">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-md border bg-background" style={{ color: assembly.color }}><CableIcon aria-hidden className="size-4" /></span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{node.data.name}</p><p className="text-xs text-muted-foreground">{inputs.length} inputs → {outputs.length} outputs</p></div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {connectedInventory ? connectedInventory.memberAssetTags.map((assetTag) => <Badge key={assetTag} variant="secondary">{assetTag}</Badge>) : (
                <>
                  <Badge variant="secondary">End 1: {formatCableDefinitionEnd(assembly.ends.end1)}</Badge>
                  <Badge variant="secondary">End 2: {formatCableDefinitionEnd(assembly.ends.end2)}</Badge>
                </>
              )}
            </div>
          </div>

          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="breakout-node-name">Setup label</FieldLabel>
              <Input id="breakout-node-name" value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field>
              <FieldLabel>{connectedInventory ? "Assembly inputs" : breakout ? "Input legs" : "Input connector"}</FieldLabel>
              <div className="flex flex-col gap-1.5">{inputs.map((port) => <Badge key={port.id} variant="outline" className="justify-start">{cableAssemblyPortDescription(port)}</Badge>)}</div>
            </Field>
            <Field>
              <FieldLabel>{connectedInventory ? "Assembly outputs" : breakout ? "Output legs" : "Output connector"}</FieldLabel>
              <div className="flex flex-col gap-1.5">{outputs.map((port) => <Badge key={port.id} variant="outline" className="justify-start">{cableAssemblyPortDescription(port)}</Badge>)}</div>
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="breakout-node-notes">Setup notes</FieldLabel>
              <Textarea id="breakout-node-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={breakout ? "Left and right mixer returns to headphone amp." : "Extension after the 10 ft breakout."} rows={3} />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="destructive" onClick={() => { onDelete(node.id); onOpenChange(false); }}>
            <Trash2Icon data-icon="inline-start" />
            Remove {cableLabel}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" form="breakout-cable-node-form" disabled={!name.trim()}><SaveIcon data-icon="inline-start" />Apply changes</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StandardEquipmentNodeDialog({ node, setupId, templates, assets, parties, locations, setupNodes, open, onOpenChange, onSave, onDelete, onTemplateUpdated, onAssetCreated }: EquipmentNodeDialogProps) {
  const [draft, setDraft] = useState<EquipmentNodeData | null>(() => node ? structuredClone(node.data) : null);
  const [pendingIcon, setPendingIcon] = useState<PendingEquipmentIcon | null>(null);
  const [pendingStageImage, setPendingStageImage] = useState<PendingEquipmentStageImage | null>(null);
  const [pendingDetailFiles, setPendingDetailFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [pendingAssetReassignment, setPendingAssetReassignment] = useState<{ asset: InventoryAsset; assignment: AssetAssignment } | null>(null);
  const [approvedAssetReassignment, setApprovedAssetReassignment] = useState<AssetAssignment | null>(null);
  const assignedAssetId = draft?.assignedAssetId;
  const draftTemplateId = draft?.templateId;
  const template = useMemo(() => templates.find((item) => item.id === draft?.templateId), [draft?.templateId, templates]);
  const templateById = useMemo(() => new Map(templates.map((item) => [item.id, item])), [templates]);
  const partyById = useMemo(() => new Map(parties.map((party) => [party.id, party])), [parties]);
  const locationById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);
  const eligibleAssets = useMemo(() => assets
    .filter((asset) => (
      asset.id === assignedAssetId
      || (asset.lifecycleStatus !== "retired" && asset.lifecycleStatus !== "cancelled")
    ))
    .sort((left, right) => {
      if (left.id === assignedAssetId) return -1;
      if (right.id === assignedAssetId) return 1;
      const leftMatchesDefinition = Boolean(draftTemplateId && left.definitionId === draftTemplateId);
      const rightMatchesDefinition = Boolean(draftTemplateId && right.definitionId === draftTemplateId);
      if (leftMatchesDefinition !== rightMatchesDefinition) return leftMatchesDefinition ? -1 : 1;
      return left.label.localeCompare(right.label) || left.assetTag.localeCompare(right.assetTag);
    }), [assets, assignedAssetId, draftTemplateId]);
  const assetUsageById = useMemo(() => new Map(eligibleAssets.flatMap((asset) => {
    const assignment = findAssetAssignment(setupNodes, asset.id, node?.id);
    return assignment ? [[asset.id, assignment] as const] : [];
  })), [eligibleAssets, node?.id, setupNodes]);
  const assetSearchTextById = useMemo(() => new Map(eligibleAssets.map((asset) => {
    const assetTemplate = templateById.get(asset.definitionId);
    const owner = asset.ownerPartyId ? partyById.get(asset.ownerPartyId) : undefined;
    const location = asset.currentLocationId ? locationById.get(asset.currentLocationId) : undefined;
    return [asset.id, inventoryAssetSearchText(asset, assetTemplate, owner?.name, location?.name)] as const;
  })), [eligibleAssets, locationById, partyById, templateById]);
  const selectedAssetConflict = draft?.fulfillment === "owned" && draft.assignedAssetId
    ? assetUsageById.get(draft.assignedAssetId)
    : undefined;
  const approvedSelectedAssetReassignment = selectedAssetConflict
    && approvedAssetReassignment?.assetId === selectedAssetConflict.assetId
    && approvedAssetReassignment.nodeId === selectedAssetConflict.nodeId
    ? approvedAssetReassignment
    : undefined;
  const blockingAssetConflict = approvedSelectedAssetReassignment ? undefined : selectedAssetConflict;
  const availableAssetCount = eligibleAssets.filter((asset) => !assetUsageById.has(asset.id)).length;
  const selectedAsset = useMemo(() => assets.find((asset) => asset.id === draft?.assignedAssetId), [assets, draft?.assignedAssetId]);
  const equipmentImageSources = useMemo<EquipmentImageSource[]>(() => [
    ...(draft?.image?.downloadUrl ? [{
      id: `signal:node:${draft.image.storagePath}`,
      url: draft.image.downloadUrl,
      filename: template?.image?.filename || `${draft.name}-signal`,
      label: "Current SIGNAL icon",
      kind: "signal" as const,
    }] : []),
    ...(template?.image?.downloadUrl ? [{
      id: `signal:definition:${template.image.storagePath}`,
      url: template.image.downloadUrl,
      filename: template.image.filename,
      label: "Definition SIGNAL icon",
      kind: "signal" as const,
    }] : []),
    ...(draft?.stageImage?.downloadUrl ? [{
      id: `stage:node:${draft.stageImage.storagePath}`,
      url: draft.stageImage.downloadUrl,
      filename: template?.stageImage?.filename || `${draft.name}-stage`,
      label: "Current STAGE image",
      kind: "stage" as const,
    }] : []),
    ...(template?.stageImage?.downloadUrl ? [{
      id: `stage:definition:${template.stageImage.storagePath}`,
      url: template.stageImage.downloadUrl,
      filename: template.stageImage.filename,
      label: "Definition STAGE image",
      kind: "stage" as const,
    }] : []),
    ...(template?.detailImages ?? []).map((image, index) => ({
      id: `detail:${image.storagePath}`,
      url: image.downloadUrl,
      filename: image.filename,
      label: image.filename || `Detail photo ${index + 1}`,
      kind: "detail" as const,
    })),
    ...(template?.referenceImages ?? []).map((image, index) => ({
      id: `reference:${image.url}`,
      url: image.url,
      filename: filenameFromUrl(image.url, `reference-${index + 1}`),
      label: image.altText || `Web reference ${index + 1}`,
      kind: "reference" as const,
    })),
    ...(selectedAsset ? selectedAsset.photos.map((image, index) => ({
      id: `asset:${selectedAsset.id}:${image.storagePath}`,
      url: image.downloadUrl,
      filename: image.filename,
      label: `${selectedAsset.label} · ${image.filename || `Photo ${index + 1}`}`,
      kind: "asset" as const,
    })) : []),
  ], [draft, selectedAsset, template]);

  if (!node || !draft) return null;
  const nodeId = node.id;
  const stageWidthFeet = node.stagePosition?.widthFeet ?? 1;
  const stageDepthFeet = node.stagePosition?.depthFeet ?? 1;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft?.name.trim() || saving) return;
    if (blockingAssetConflict) {
      setError(`${draft.assignedAssetLabel || "This asset"} is already being used in this setup by ${blockingAssetConflict.nodeName}.`);
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
      };

      if (pendingIcon || pendingStageImage || pendingDetailFiles.length) {
        if (!template) throw new Error("This node is not linked to an equipment template, so its photos cannot be stored yet.");
        const iconFile = pendingIcon ? await cropEquipmentIcon(pendingIcon) : undefined;
        const stageAspect = Math.max(0.05, stageWidthFeet / Math.max(0.05, stageDepthFeet));
        const stageFile = pendingStageImage ? await cropEquipmentStageImage(pendingStageImage, stageAspect) : undefined;
        const updatedTemplate = await updateEquipmentTemplateImages(template, {
          iconFile,
          stageFile,
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
          ...(stageFile && updatedTemplate.stageImage ? {
            stageImage: {
              storagePath: updatedTemplate.stageImage.storagePath,
              downloadUrl: updatedTemplate.stageImage.downloadUrl,
              contentType: updatedTemplate.stageImage.contentType,
            },
          } : {}),
        };
        onTemplateUpdated(updatedTemplate);
      }

      const saveError = onSave(nodeId, nextDraft, approvedSelectedAssetReassignment ? {
        reassignAssetFromNodeId: approvedSelectedAssetReassignment.nodeId,
      } : undefined);
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

  function applyAssetSelection(asset: InventoryAsset | null, reassignment?: AssetAssignment) {
    setError(null);
    setApprovedAssetReassignment(reassignment ?? null);
    if (!asset) {
      setDraft({
        ...draft!,
        assignedAssetId: undefined,
        assignedAssetLabel: undefined,
        showInSignalView: template?.showInSignalView ?? draft!.showInSignalView,
      });
      return;
    }
    setDraft({
      ...draft!,
      assignedAssetId: asset.id,
      assignedAssetLabel: asset.label,
      showInSignalView: asset.stageOnly ? false : template?.showInSignalView ?? draft!.showInSignalView,
    });
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
              <FieldLabel>SIGNAL diagram icon</FieldLabel>
              <EquipmentIconEditor
                nodeName={draft.name}
                currentImageUrl={draft.image?.downloadUrl}
                currentFilename={template?.image?.filename}
                sourceImages={equipmentImageSources}
                pendingDetailFiles={pendingDetailFiles}
                pendingIcon={pendingIcon}
                onPendingIconChange={setPendingIcon}
                disabled={saving}
              />
              <FieldDescription>This reusable square icon is used in the logical SIGNAL diagram.</FieldDescription>
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
                  setApprovedAssetReassignment(null);
                  setDraft({
                    ...draft,
                    fulfillment,
                    ...(fulfillment === "owned" ? { providerPartyId: undefined, providerPartyName: undefined } : { assignedAssetId: undefined, assignedAssetLabel: undefined }),
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
                  <Field className="sm:col-span-2" data-invalid={Boolean(blockingAssetConflict)}>
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div><FieldLabel htmlFor="node-inventory-asset">Exact gear asset</FieldLabel><FieldDescription>Select an on-hand or planned item. Planned assets already have their permanent QR identity.</FieldDescription></div>
                      <Button type="button" variant="outline" size="sm" onClick={() => setAssetDialogOpen(true)} disabled={!template || saving}><PackagePlusIcon data-icon="inline-start" />Create planned asset</Button>
                    </div>
                    <Combobox
                      items={eligibleAssets}
                      value={selectedAsset ?? null}
                      onValueChange={(asset) => {
                        if (!asset) {
                          applyAssetSelection(null);
                          return;
                        }
                        const existingAssignment = assetUsageById.get(asset.id);
                        if (existingAssignment) {
                          setPendingAssetReassignment({ asset, assignment: existingAssignment });
                          return;
                        }
                        applyAssetSelection(asset);
                      }}
                      itemToStringLabel={(asset) => `${asset.label} · ${asset.assetTag}`}
                      itemToStringValue={(asset) => asset.id}
                      isItemEqualToValue={(item, value) => item.id === value.id}
                      filter={(asset, query) => inventoryAssetMatchesSearch(assetSearchTextById.get(asset.id) ?? "", query)}
                      autoHighlight
                      disabled={saving}
                    >
                      <ComboboxInput
                        id="node-inventory-asset"
                        className="w-full"
                        placeholder="Search inventory by name, ID, tag, owner, or location..."
                        showClear
                        aria-invalid={Boolean(blockingAssetConflict)}
                      />
                      <ComboboxContent side="bottom" align="start" sideOffset={4}>
                        <ComboboxEmpty>No inventory matches that search.</ComboboxEmpty>
                        <ComboboxList>
                          {(asset) => {
                            const assignment = assetUsageById.get(asset.id);
                            const assetTemplate = templateById.get(asset.definitionId);
                            const owner = asset.ownerPartyId ? partyById.get(asset.ownerPartyId) : undefined;
                            const location = asset.currentLocationId ? locationById.get(asset.currentLocationId) : undefined;
                            return (
                              <ComboboxItem key={asset.id} value={asset}>
                                <span className="flex min-w-0 flex-1 items-center justify-between gap-4 py-0.5">
                                  <span className="flex min-w-0 flex-col">
                                    <span className="truncate font-medium">
                                      {asset.label} · {asset.assetTag}{assignment ? " · Assigned" : ""}
                                    </span>
                                    <span className="truncate text-xs text-muted-foreground">
                                      {lifecycleLabel(asset.lifecycleStatus)}
                                      {assetTemplate ? ` · ${assetTemplate.manufacturer ? `${assetTemplate.manufacturer} ` : ""}${assetTemplate.model || assetTemplate.name}` : " · No reusable definition"}
                                      {owner ? ` · ${owner.name}` : ""}
                                      {location ? ` · ${location.name}` : ""}
                                    </span>
                                  </span>
                                  {assignment
                                    ? <Badge variant="outline" className="max-w-52 shrink-0 truncate">Used by {assignment.nodeName}</Badge>
                                    : draftTemplateId && asset.definitionId === draftTemplateId
                                      ? <span className="shrink-0 text-xs text-muted-foreground">Definition match</span>
                                      : null}
                                </span>
                              </ComboboxItem>
                            );
                          }}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                    {approvedSelectedAssetReassignment ? <FieldDescription>Will be reassigned from {approvedSelectedAssetReassignment.nodeName} when you apply these changes.</FieldDescription> : null}
                    {blockingAssetConflict ? <p className="text-sm font-medium text-destructive" role="alert">Already being used in this setup by {blockingAssetConflict.nodeName}. Choose it again to confirm reassignment, or select another asset.</p> : null}
                    {!eligibleAssets.length ? <FieldDescription>No eligible inventory assets yet. Create a planned one without leaving this setup.</FieldDescription> : null}
                    {eligibleAssets.length > 0 && availableAssetCount === 0 && !blockingAssetConflict ? <FieldDescription>Every inventory asset is currently assigned. Reassign one here or create another planned asset.</FieldDescription> : null}
                  </Field>
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

          <FieldGroup className="rounded-lg border bg-muted/30 p-3">
            <Field>
              <FieldLabel>STAGE overhead image</FieldLabel>
              <EquipmentStageImageEditor
                nodeName={draft.name}
                widthInches={stageWidthFeet * 12}
                depthInches={stageDepthFeet * 12}
                currentImageUrl={draft.stageImage?.downloadUrl}
                currentFilename={template?.stageImage?.filename}
                sourceImages={equipmentImageSources}
                pendingDetailFiles={pendingDetailFiles}
                pendingImage={pendingStageImage}
                onPendingImageChange={setPendingStageImage}
                disabled={saving}
              />
              <FieldDescription>This reusable overhead photo fills the object’s exact physical footprint in STAGE. Set dimensions before opening this dialog so the crop matches them.</FieldDescription>
            </Field>
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

          <FieldSet className="rounded-lg border bg-muted/30 p-3">
            <FieldLegend>Power dependencies</FieldLegend>
            <FieldDescription>Override the reusable definition for this setup instance.</FieldDescription>
            <FieldGroup className="gap-3">
              <Field orientation="horizontal">
                <div className="flex flex-1 flex-col gap-1">
                  <FieldLabel htmlFor="node-needs-power-source">Needs power source</FieldLabel>
                  <FieldDescription>Keep this item within reach of a stage power drop or other power source.</FieldDescription>
                </div>
                <Switch
                  id="node-needs-power-source"
                  checked={draft.needsPowerSource === true || draft.needsPowerAdapter === true}
                  onCheckedChange={(checked) => setDraft({
                    ...draft,
                    needsPowerSource: checked,
                    needsPowerAdapter: checked ? draft.needsPowerAdapter : false,
                  })}
                />
              </Field>
              <Field orientation="horizontal">
                <div className="flex flex-1 flex-col gap-1">
                  <FieldLabel htmlFor="node-needs-power-adapter">Needs power adapter</FieldLabel>
                  <FieldDescription>Bring the separate adapter carrying this item’s same four-digit label.</FieldDescription>
                </div>
                <Switch
                  id="node-needs-power-adapter"
                  checked={draft.needsPowerAdapter === true}
                  onCheckedChange={(checked) => setDraft({
                    ...draft,
                    needsPowerSource: checked ? true : draft.needsPowerSource,
                    needsPowerAdapter: checked,
                  })}
                />
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldGroup className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
            <Field orientation="horizontal" className="sm:col-span-2">
              <div className="flex flex-1 flex-col gap-1">
                <FieldLabel htmlFor="show-in-signal">Show in SIGNAL</FieldLabel>
                <FieldDescription>Turn this off for stands, furniture, and other gear that only needs physical placement.</FieldDescription>
              </div>
              <Switch id="show-in-signal" checked={draft.showInSignalView !== false} onCheckedChange={(checked) => setDraft({ ...draft, showInSignalView: checked })} />
            </Field>
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
          {saving && (pendingIcon || pendingStageImage || pendingDetailFiles.length) ? <Progress value={uploadProgress} aria-label={`Equipment photo upload ${uploadProgress}% complete`} /> : null}
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </form>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="destructive" onClick={() => { onDelete(nodeId); onOpenChange(false); }} disabled={saving}>
            <Trash2Icon data-icon="inline-start" />
            {draft.assemblyId ? "Remove snake" : "Remove node"}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="equipment-node-form" disabled={saving || !draft.name.trim() || Boolean(blockingAssetConflict)}>
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
            setApprovedAssetReassignment(null);
            setDraft((current) => current ? {
              ...current,
              fulfillment: "owned",
              assignedAssetId: asset.id,
              assignedAssetLabel: asset.label,
              showInSignalView: asset.stageOnly ? false : template?.showInSignalView ?? current.showInSignalView,
            } : current);
          }}
        />
        <AlertDialog
          open={Boolean(pendingAssetReassignment)}
          onOpenChange={(reassignmentOpen) => {
            if (!reassignmentOpen) setPendingAssetReassignment(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <ArrowRightLeftIcon aria-hidden />
              </AlertDialogMedia>
              <AlertDialogTitle>Reassign {pendingAssetReassignment?.asset.label}?</AlertDialogTitle>
              <AlertDialogDescription>
                This physical item is already used by {pendingAssetReassignment?.assignment.nodeName} in this setup. Reassigning it here removes that connection and makes this instance the only one using it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => {
                if (!pendingAssetReassignment) return;
                applyAssetSelection(pendingAssetReassignment.asset, pendingAssetReassignment.assignment);
                setPendingAssetReassignment(null);
              }}>
                Reassign gear to this instance
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function filenameFromUrl(value: string, fallback: string) {
  try {
    const filename = new URL(value).pathname.split("/").filter(Boolean).pop();
    return filename || fallback;
  } catch {
    return fallback;
  }
}

function inventoryAssetSearchText(
  asset: InventoryAsset,
  assetTemplate: EquipmentTemplate | undefined,
  ownerName?: string,
  locationName?: string,
) {
  return [
    asset.label,
    asset.assetTag,
    asset.serialNumber,
    ...(asset.tags ?? []),
    assetTemplate?.name,
    assetTemplate?.manufacturer,
    assetTemplate?.model,
    assetTemplate?.category,
    ownerName,
    locationName,
    lifecycleLabel(asset.lifecycleStatus),
  ].filter(Boolean).join(" ").normalize("NFKD").toLocaleLowerCase();
}

function inventoryAssetMatchesSearch(searchText: string, query: string) {
  const normalizedQuery = query.trim().normalize("NFKD").toLocaleLowerCase();
  if (!normalizedQuery) return true;
  if (searchText.includes(normalizedQuery)) return true;
  const compactQuery = normalizedQuery.replace(/[^a-z0-9]/g, "");
  return Boolean(compactQuery) && searchText.replace(/[^a-z0-9]/g, "").includes(compactQuery);
}
