"use client";

import { CableIcon, CameraIcon, CopyPlusIcon, ExternalLinkIcon, LoaderCircleIcon, PackageIcon, PackagePlusIcon, PlusIcon, SaveIcon, SparklesIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";

import { GearLabelPrinter } from "@/components/gear/gear-label-printer";
import { CableColorSwatch } from "@/components/gear/cable-color-swatch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ASSET_LIFECYCLE_OPTIONS,
  CABLE_COLOR_OPTIONS,
  CABLE_INVENTORY_TAG,
  cableColorLabel,
  createInventoryAssetCode,
  formatCableAssetLabel,
  inferInventoryAssetCodeGroup,
  isCableInventoryAsset,
  isInventoryAssetCode,
  MAX_INVENTORY_TAG_LENGTH,
  MAX_INVENTORY_TAGS,
  normalizeAssetPurchaseUrl,
  normalizeCableLengthInches,
  normalizeInventoryAssetCode,
  normalizeInventoryTags,
  type GearLocation,
  type GearParty,
  type InventoryAsset,
  type InventoryAssetLifecycle,
} from "@/lib/gear/domain";
import { saveInventoryAsset } from "@/lib/gear/repository";
import { formatCableDefinitionEnd, isCableDefinition } from "@/lib/setup-designer/cable-definitions";
import type { EquipmentTemplate, ImportedEquipmentDraft } from "@/lib/setup-designer/domain";
import { downloadEquipmentReferenceImages, researchEquipmentUrl } from "@/lib/setup-designer/equipment-research-client";
import { portGroupDisplayName, summarizePortGroups } from "@/lib/setup-designer/ports";
import { createEquipmentTemplate, updateEquipmentTemplateImages } from "@/lib/setup-designer/repository";

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const NO_DEFINITION_VALUE = "__no_definition__";
type RegistrationKind = "gear" | "cables";

export function GearAssetDialog({
  open,
  onOpenChange,
  definitions,
  assets,
  parties,
  locations,
  asset,
  duplicateFrom,
  initialDefinitionId,
  initialLifecycle = "planned",
  sourceSetupId,
  onDefinitionCreated,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definitions: EquipmentTemplate[];
  assets: InventoryAsset[];
  parties: GearParty[];
  locations: GearLocation[];
  asset?: InventoryAsset;
  duplicateFrom?: InventoryAsset;
  initialDefinitionId?: string;
  initialLifecycle?: InventoryAssetLifecycle;
  sourceSetupId?: string;
  onDefinitionCreated?: (definition: EquipmentTemplate) => void;
  onSaved: (asset: InventoryAsset) => void;
}) {
  const firstGearDefinition = definitions.find((item) => !isCableDefinition(item));
  const startingDefinitionId = asset?.definitionId ?? duplicateFrom?.definitionId ?? initialDefinitionId ?? firstGearDefinition?.id ?? "";
  const startingDefinition = definitions.find((item) => item.id === startingDefinitionId);
  const existingAssetTags = assets.filter((item) => item.id !== asset?.id).map((item) => item.assetTag);
  const inheritedPhotos = asset?.photos ?? duplicateFrom?.photos ?? [];
  const startingTags = normalizeInventoryTags([
    ...(asset?.tags ?? duplicateFrom?.tags ?? []),
    ...(startingDefinition && isCableDefinition(startingDefinition) ? [CABLE_INVENTORY_TAG] : []),
  ]);
  const startsAsCable = isCableInventoryAsset({ tags: startingTags });
  const startingCableLengthInches = normalizeCableLengthInches(asset?.cableLengthInches ?? duplicateFrom?.cableLengthInches);
  const startingAssetCodeGroup = asset?.assetCodeGroup ?? duplicateFrom?.assetCodeGroup ?? inferInventoryAssetCodeGroup({
    isCable: startsAsCable,
    label: asset?.label ?? duplicateFrom?.label,
    tags: startingTags,
    definitionName: startingDefinition?.name,
    definitionCategory: startingDefinition?.category,
  });
  const startingAssetTag = asset && isInventoryAssetCode(asset.assetTag)
    ? asset.assetTag
    : createInventoryAssetCode(existingAssetTags, startingAssetCodeGroup);
  const [definitionId, setDefinitionId] = useState(startingDefinitionId);
  const [registrationKind, setRegistrationKind] = useState<RegistrationKind>(startsAsCable ? "cables" : "gear");
  const [label, setLabel] = useState(asset?.label ?? duplicateFrom?.label ?? (startingDefinition ? `${startingDefinition.name}${initialLifecycle === "planned" ? " · planned" : ""}` : ""));
  const [assetTag, setAssetTag] = useState(startingAssetTag);
  const [lifecycleStatus, setLifecycleStatus] = useState<InventoryAssetLifecycle>(asset?.lifecycleStatus ?? duplicateFrom?.lifecycleStatus ?? initialLifecycle);
  const [stageOnly, setStageOnly] = useState(asset?.stageOnly ?? duplicateFrom?.stageOnly ?? startingDefinition?.showInSignalView === false);
  const [ownerPartyId, setOwnerPartyId] = useState(asset?.ownerPartyId ?? duplicateFrom?.ownerPartyId ?? "");
  const [currentLocationId, setCurrentLocationId] = useState(asset?.currentLocationId ?? "");
  const [serialNumber, setSerialNumber] = useState(asset?.serialNumber ?? "");
  const [purchaseUrl, setPurchaseUrl] = useState(asset?.purchaseUrl ?? duplicateFrom?.purchaseUrl ?? "");
  const [notes, setNotes] = useState(asset?.notes ?? duplicateFrom?.notes ?? "");
  const [selectedTags, setSelectedTags] = useState(startingTags);
  const [cableManufacturer, setCableManufacturer] = useState(asset?.cableManufacturer ?? duplicateFrom?.cableManufacturer ?? "");
  const [cableColor, setCableColor] = useState<NonNullable<InventoryAsset["cableColor"]>>(asset?.cableColor ?? duplicateFrom?.cableColor ?? "black");
  const [cableLengthFeet, setCableLengthFeet] = useState(startingCableLengthInches ? measurementInputValue(startingCableLengthInches / 12) : "");
  const [cableLengthInches, setCableLengthInches] = useState(startingCableLengthInches ? measurementInputValue(startingCableLengthInches) : "");
  const [tagDraft, setTagDraft] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [productUrl, setProductUrl] = useState("");
  const [researchResult, setResearchResult] = useState<ImportedEquipmentDraft | null>(null);
  const [selectedReferenceUrls, setSelectedReferenceUrls] = useState<Set<string>>(new Set());
  const [widthInches, setWidthInches] = useState("");
  const [depthInches, setDepthInches] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [weightPounds, setWeightPounds] = useState("");
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cableAssetSelected = registrationKind === "cables";
  const definition = useMemo(() => definitions.find((item) => item.id === definitionId), [definitionId, definitions]);
  const selectableDefinitions = useMemo(() => definitions.filter((item) => item.id === definitionId || (cableAssetSelected ? isCableDefinition(item) : !isCableDefinition(item))), [cableAssetSelected, definitionId, definitions]);
  const importedPortGroups = useMemo(() => researchResult ? summarizePortGroups(researchResult.ports) : [], [researchResult]);
  const tagSuggestions = useMemo(() => {
    const selectedKeys = new Set(selectedTags.map((tag) => tag.toLocaleLowerCase()));
    return normalizeInventoryTags(assets.flatMap((item) => item.tags ?? []))
      .filter((tag) => tag.toLocaleLowerCase() !== CABLE_INVENTORY_TAG.toLocaleLowerCase())
      .filter((tag) => !selectedKeys.has(tag.toLocaleLowerCase()))
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 8);
  }, [assets, selectedTags]);
  const canResearchDefinition = !asset && !duplicateFrom && !initialDefinitionId && !cableAssetSelected;
  const physicalStatus = lifecycleStatus === "active" || lifecycleStatus === "awaiting_check_in";
  const normalizedCableLengthInches = normalizeCableLengthInches(Number(cableLengthInches));
  const cableLengthIssue = cableAssetSelected && !normalizedCableLengthInches
    ? "Enter the cable length in feet or inches."
    : null;
  const cableDefinitionIssue = cableAssetSelected && !asset && !duplicateFrom && (!definition || !isCableDefinition(definition))
    ? "Choose a cable definition before registering this cable."
    : null;
  const showCableLengthIssue = Boolean(cableLengthFeet || cableLengthInches) && Boolean(cableLengthIssue);
  const normalizedPurchaseUrl = normalizeAssetPurchaseUrl(purchaseUrl);
  const purchaseUrlIssue = purchaseUrl.trim() && !normalizedPurchaseUrl
    ? "Use a complete http:// or https:// URL."
    : null;
  const selectedAssetCodeGroup = asset?.assetCodeGroup ?? inferInventoryAssetCodeGroup({
    isCable: cableAssetSelected,
    label,
    tags: selectedTags,
    definitionName: researchResult?.name ?? definition?.name,
    definitionCategory: researchResult?.category ?? definition?.category,
  });
  const canonicalAssetTag = normalizeInventoryAssetCode(assetTag);
  const duplicateAsset = assets.find((item) => item.id !== asset?.id && item.assetTag.trim() === canonicalAssetTag);
  const assetTagIssue = !isInventoryAssetCode(canonicalAssetTag)
    ? "Inventory IDs use exactly four digits from 0001 through 9999."
    : duplicateAsset
      ? `${canonicalAssetTag} is already assigned to ${duplicateAsset.label}.`
      : null;

  function changeRegistrationKind(value: string | null, tags = selectedTags) {
    if (value !== "gear" && value !== "cables") return;
    const nextIsCable = value === "cables";
    const nextDefinition = definitions.find((item) => isCableDefinition(item) === nextIsCable);
    const previousDefault = definition ? `${definition.name}${initialLifecycle === "planned" ? " · planned" : ""}` : "";
    const nextDefault = nextDefinition ? `${nextDefinition.name}${initialLifecycle === "planned" ? " · planned" : ""}` : "";
    const nextLabel = !label || label === previousDefault ? nextDefault : label;
    const tagsWithoutCable = tags.filter((tag) => tag.toLocaleLowerCase() !== CABLE_INVENTORY_TAG.toLocaleLowerCase());
    const nextTags = nextIsCable
      ? normalizeInventoryTags([CABLE_INVENTORY_TAG, ...tagsWithoutCable]).slice(0, MAX_INVENTORY_TAGS)
      : tags.filter((tag) => tag.toLocaleLowerCase() !== CABLE_INVENTORY_TAG.toLocaleLowerCase());

    setRegistrationKind(value);
    setDefinitionId(nextDefinition?.id ?? "");
    setResearchResult(null);
    setResearchError(null);
    setSelectedTags(nextTags);
    setTagError(null);
    setLabel(nextLabel);
    if (!asset) {
      const nextGroup = inferInventoryAssetCodeGroup({
        isCable: nextIsCable,
        label: nextLabel,
        tags: nextTags,
        definitionName: nextDefinition?.name,
        definitionCategory: nextDefinition?.category,
      });
      setAssetTag(createInventoryAssetCode(existingAssetTags, nextGroup));
    }
    if (!asset) setStageOnly(nextDefinition ? nextDefinition.showInSignalView === false : true);
  }

  function chooseDefinition(value: string | null) {
    if (!value) return;
    const nextDefinitionId = value === NO_DEFINITION_VALUE ? "" : value;
    const next = definitions.find((item) => item.id === nextDefinitionId);
    const previousDefault = definition ? `${definition.name}${initialLifecycle === "planned" ? " · planned" : ""}` : "";
    setDefinitionId(nextDefinitionId);
    setResearchResult(null);
    setResearchError(null);
    if (!asset) setStageOnly(next ? next.showInSignalView === false : true);
    if (next && isCableDefinition(next) && !cableAssetSelected) {
      setSelectedTags((current) => normalizeInventoryTags([...current, CABLE_INVENTORY_TAG]));
    }
    if (!label || label === previousDefault) setLabel(next ? `${next.name}${lifecycleStatus === "planned" ? " · planned" : ""}` : "");
    if (!asset) {
      const nextIsCable = Boolean(next && isCableDefinition(next));
      const nextTags = nextIsCable ? normalizeInventoryTags([...selectedTags, CABLE_INVENTORY_TAG]) : selectedTags;
      const nextGroup = inferInventoryAssetCodeGroup({
        isCable: nextIsCable,
        label: next?.name ?? label,
        tags: nextTags,
        definitionName: next?.name,
        definitionCategory: next?.category,
      });
      setAssetTag(createInventoryAssetCode(existingAssetTags, nextGroup));
    }
  }

  async function researchProduct() {
    if (!canResearchDefinition || !productUrl.trim() || researching) return;
    setResearching(true);
    setResearchError(null);
    try {
      const result = await researchEquipmentUrl(productUrl.trim());
      setResearchResult(result);
      setSelectedReferenceUrls(new Set(result.referenceImages.slice(0, 3).map((image) => image.url)));
      setDefinitionId("");
      setProductUrl(result.purchaseSource.url);
      setWidthInches(result.physicalDimensions?.widthInches?.toString() ?? "");
      setDepthInches(result.physicalDimensions?.depthInches?.toString() ?? "");
      setHeightInches(result.physicalDimensions?.heightInches?.toString() ?? "");
      setWeightPounds(result.physicalDimensions?.weightPounds?.toString() ?? "");
      setStageOnly(result.ports.length === 0);
      setLabel(result.name);
      if (!asset) {
        const nextGroup = inferInventoryAssetCodeGroup({
          label: result.name,
          tags: selectedTags,
          definitionName: result.name,
          definitionCategory: result.category,
        });
        setAssetTag(createInventoryAssetCode(existingAssetTags, nextGroup));
      }
    } catch (caught) {
      setResearchError(caught instanceof Error ? caught.message : "The product page could not be researched.");
    } finally {
      setResearching(false);
    }
  }

  function discardResearch() {
    setResearchResult(null);
    setSelectedReferenceUrls(new Set());
    setResearchError(null);
    setWidthInches("");
    setDepthInches("");
    setHeightInches("");
    setWeightPounds("");
    const fallback = definitions.find((item) => !isCableDefinition(item));
    setDefinitionId(fallback?.id ?? "");
    setStageOnly(fallback?.showInSignalView === false);
  }

  function chooseReferenceImage(url: string, checked: boolean) {
    setSelectedReferenceUrls((current) => {
      const next = new Set(current);
      if (checked) next.add(url);
      else next.delete(url);
      return next;
    });
  }

  function choosePhotos(files: FileList | null) {
    const next = Array.from(files ?? []);
    const invalid = next.find((file) => !ACCEPTED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES);
    if (invalid) {
      setError("Physical-item photos must be JPEG, PNG, or WebP files smaller than 10 MB each.");
      return;
    }
    setError(null);
    setPhotoFiles(next);
  }

  function addTags(rawValue = tagDraft) {
    const result = mergeInventoryTagInput(selectedTags, rawValue);
    if (result.error) {
      setTagError(result.error);
      return false;
    }
    if (!cableAssetSelected && isCableInventoryAsset({ tags: result.tags })) {
      changeRegistrationKind("cables", result.tags);
      setTagDraft("");
      return true;
    }
    setSelectedTags(result.tags);
    setTagDraft("");
    setTagError(null);
    return true;
  }

  function removeTag(tag: string) {
    const nextTags = selectedTags.filter((item) => item !== tag);
    if (tag.toLocaleLowerCase() === CABLE_INVENTORY_TAG.toLocaleLowerCase()) {
      changeRegistrationKind("gear", nextTags);
      return;
    }
    setSelectedTags(nextTags);
    setTagError(null);
  }

  function changeCableLengthFeet(value: string) {
    setCableLengthFeet(value);
    const feet = positiveNumberOrUndefined(value);
    setCableLengthInches(feet ? measurementInputValue(feet * 12) : "");
  }

  function changeCableLengthInches(value: string) {
    setCableLengthInches(value);
    const inches = positiveNumberOrUndefined(value);
    setCableLengthFeet(inches ? measurementInputValue(inches / 12) : "");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!label.trim() || assetTagIssue || cableLengthIssue || cableDefinitionIssue || saving || researching) return;
    const resolvedTags = mergeInventoryTagInput(selectedTags, tagDraft);
    if (resolvedTags.error) {
      setTagError(resolvedTags.error);
      return;
    }
    const submittedTags = cableAssetSelected
      ? normalizeInventoryTags([
        CABLE_INVENTORY_TAG,
        ...resolvedTags.tags.filter((tag) => tag.toLocaleLowerCase() !== CABLE_INVENTORY_TAG.toLocaleLowerCase()),
      ]).slice(0, MAX_INVENTORY_TAGS)
      : resolvedTags.tags.filter((tag) => tag.toLocaleLowerCase() !== CABLE_INVENTORY_TAG.toLocaleLowerCase());
    setSelectedTags(submittedTags);
    setTagDraft("");
    setSaving(true);
    setError(null);
    try {
      let resolvedDefinitionId = definitionId;
      if (researchResult) {
        const selectedReferenceImages = researchResult.referenceImages.filter((image) => selectedReferenceUrls.has(image.url));
        const downloadedImages = await downloadEquipmentReferenceImages(selectedReferenceImages.map((image) => image.url));
        if (downloadedImages.failedCount) {
          console.warn(`${downloadedImages.failedCount} selected merchant image${downloadedImages.failedCount === 1 ? "" : "s"} could not be copied to Storage.`);
        }
        const physicalDimensions = widthInches || depthInches || heightInches || weightPounds || researchResult.physicalDimensions?.sourceText ? {
          widthInches: positiveNumberOrUndefined(widthInches),
          depthInches: positiveNumberOrUndefined(depthInches),
          heightInches: positiveNumberOrUndefined(heightInches),
          weightPounds: positiveNumberOrUndefined(weightPounds),
          sourceText: researchResult.physicalDimensions?.sourceText,
        } : undefined;
        let createdDefinition = await createEquipmentTemplate({
          name: researchResult.name,
          definitionKind: "equipment",
          manufacturer: researchResult.manufacturer,
          model: researchResult.model,
          category: researchResult.category,
          equipmentKind: researchResult.equipmentKind,
          transport: researchResult.transport ? structuredClone(researchResult.transport) : undefined,
          description: researchResult.description,
          physicalDimensions,
          purchaseSource: researchResult.purchaseSource,
          referenceImages: structuredClone(selectedReferenceImages),
          aiImport: researchResult.aiImport,
          ports: structuredClone(researchResult.ports),
          needsPowerSource: false,
          needsPowerAdapter: false,
          showInSignalView: !stageOnly,
          showPortNumbers: true,
          showPortLabels: true,
        });
        if (downloadedImages.files.length) {
          createdDefinition = await updateEquipmentTemplateImages(createdDefinition, { detailFiles: downloadedImages.files }, setProgress);
        }
        resolvedDefinitionId = createdDefinition.id;
        setDefinitionId(createdDefinition.id);
        setResearchResult(null);
        onDefinitionCreated?.(createdDefinition);
      }
      const saved = await saveInventoryAsset({
        id: asset?.id,
        assetTag: canonicalAssetTag,
        assetCodeGroup: selectedAssetCodeGroup,
        definitionId: resolvedDefinitionId,
        label,
        cableManufacturer,
        cableLengthInches: normalizedCableLengthInches,
        cableColor,
        lifecycleStatus,
        stageOnly: cableAssetSelected ? false : stageOnly,
        tags: submittedTags,
        ownerPartyId: ownerPartyId || undefined,
        currentLocationId: physicalStatus && currentLocationId ? currentLocationId : undefined,
        serialNumber: cableAssetSelected ? undefined : serialNumber,
        purchaseUrl: normalizedPurchaseUrl,
        notes,
        sourceSetupId: asset?.sourceSetupId ?? sourceSetupId,
        photos: inheritedPhotos,
        createdAt: asset?.createdAt,
      }, photoFiles, setProgress);
      onSaved(saved);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this gear asset.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{asset ? `Edit ${asset.label}` : duplicateFrom ? `Duplicate ${duplicateFrom.label}` : initialLifecycle === "planned" ? "Create planned gear" : "Register physical gear"}</DialogTitle>
          <DialogDescription>
            {duplicateFrom
              ? "Reuse this item's definition, photos, owner, purchase link, notes, and lifecycle with a new permanent ID. Serial number and current location start blank for separate tracking."
              : initialLifecycle === "planned" && !asset
              ? "Reserve a permanent asset ID now. Its setup references and QR identity will survive ordering, delivery, and first check-in."
              : "Track the exact physical item, its owner, identifying details, photos, and current lifecycle."}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={registrationKind} onValueChange={(value) => changeRegistrationKind(value)} className="gap-4">
          {!asset && !duplicateFrom ? (
            <TabsList className="grid w-full grid-cols-2" aria-label="Registration type">
              <TabsTrigger value="gear"><PackageIcon aria-hidden />Gear</TabsTrigger>
              <TabsTrigger value="cables"><CableIcon aria-hidden />Cables</TabsTrigger>
            </TabsList>
          ) : null}
          <TabsContent value={registrationKind}>
            <form id="gear-asset-form" onSubmit={submit} className="flex flex-col gap-5" aria-busy={researching}>
          {canResearchDefinition ? (
            <FieldGroup className="rounded-lg border bg-muted/30 p-3">
              <Field data-invalid={Boolean(researchError)}>
                <FieldLabel htmlFor="gear-asset-product-url">Fill from a product page</FieldLabel>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="gear-asset-product-url"
                    type="url"
                    value={productUrl}
                    onChange={(event) => setProductUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void researchProduct();
                      }
                    }}
                    placeholder="https://www.sweetwater.com/store/detail/..."
                    aria-invalid={Boolean(researchError)}
                    disabled={researching || saving}
                  />
                  <Button type="button" variant="secondary" onClick={() => void researchProduct()} disabled={researching || saving || !productUrl.trim()}>
                    {researching ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <SparklesIcon data-icon="inline-start" />}
                    {researching ? "Reading product..." : "Fill with AI"}
                  </Button>
                </div>
                <FieldDescription>AI reads the page and supporting technical sources, then prepares a reusable definition with product photos, dimensions, and relevant inputs and outputs. Nothing is saved until you register the item.</FieldDescription>
                {researchError ? <FieldError>{researchError}</FieldError> : null}
              </Field>

              {researching ? (
                <Alert role="status" aria-live="polite">
                  <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
                  <AlertTitle>Researching this product</AlertTitle>
                  <AlertDescription>Checking the source page, photos, dimensions, and connector details. This usually takes 20–60 seconds.</AlertDescription>
                </Alert>
              ) : null}

              {researchResult ? (
                <FieldGroup>
                  <Alert>
                    <SparklesIcon />
                    <AlertTitle>{researchResult.name}</AlertTitle>
                    <AlertDescription>
                      <span className="flex flex-wrap gap-2 pt-1">
                        <Badge variant="secondary">AI researched</Badge>
                        <Badge variant="outline">{researchResult.confidence} confidence</Badge>
                        <Badge variant="outline">{researchResult.ports.filter((port) => port.direction === "input").length} inputs</Badge>
                        <Badge variant="outline">{researchResult.ports.filter((port) => port.direction === "output").length} outputs</Badge>
                        <Badge variant="outline">{researchResult.referenceImages.length} photos</Badge>
                      </span>
                      <span className="mt-2 block">A new reusable gear definition will be created with this item. Review the populated details before registering it.</span>
                    </AlertDescription>
                  </Alert>

                  <FieldGroup className="grid gap-3 sm:grid-cols-4">
                    <Field>
                      <FieldLabel htmlFor="gear-import-width">Width (in)</FieldLabel>
                      <Input id="gear-import-width" type="number" min="0" step="0.01" inputMode="decimal" value={widthInches} onChange={(event) => setWidthInches(event.target.value)} placeholder="Not found" disabled={saving} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="gear-import-depth">Depth (in)</FieldLabel>
                      <Input id="gear-import-depth" type="number" min="0" step="0.01" inputMode="decimal" value={depthInches} onChange={(event) => setDepthInches(event.target.value)} placeholder="Not found" disabled={saving} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="gear-import-height">Height (in)</FieldLabel>
                      <Input id="gear-import-height" type="number" min="0" step="0.01" inputMode="decimal" value={heightInches} onChange={(event) => setHeightInches(event.target.value)} placeholder="Not found" disabled={saving} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="gear-import-weight">Weight (lb)</FieldLabel>
                      <Input id="gear-import-weight" type="number" min="0" step="0.01" inputMode="decimal" value={weightPounds} onChange={(event) => setWeightPounds(event.target.value)} placeholder="Not found" disabled={saving} />
                    </Field>
                  </FieldGroup>

                  {importedPortGroups.length ? (
                    <Field>
                      <FieldLabel>Inputs, outputs, and connector types</FieldLabel>
                      <div className="flex flex-wrap gap-1.5">
                        {importedPortGroups.map((group) => (
                          <Badge key={[group.direction, group.connectorTypeId, group.gender, group.label].join("|")} variant="secondary">
                            {portGroupDisplayName(group)}
                          </Badge>
                        ))}
                      </div>
                    </Field>
                  ) : null}

                  {researchResult.referenceImages.length ? (
                    <Field>
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <div>
                          <FieldLabel>Product photos</FieldLabel>
                          <FieldDescription>Saved as reusable source references, separate from photos of this exact physical item.</FieldDescription>
                        </div>
                        <a href={researchResult.purchaseSource.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-4">
                          Open source <ExternalLinkIcon aria-hidden className="size-3.5" />
                        </a>
                      </div>
                      <FieldGroup className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {researchResult.referenceImages.map((image, index) => {
                          const id = `gear-import-photo-${index}`;
                          return (
                            <Field key={image.url} className="rounded-lg border bg-background p-2">
                              <a href={image.url} target="_blank" rel="noreferrer" className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted" aria-label={`Open product photo ${index + 1}`}>
                                <Image src={image.url} alt={image.altText ?? `${researchResult.name} product photo ${index + 1}`} fill sizes="220px" className="object-contain" unoptimized />
                              </a>
                              <Field orientation="horizontal">
                                <Checkbox id={id} checked={selectedReferenceUrls.has(image.url)} onCheckedChange={(checked) => chooseReferenceImage(image.url, checked === true)} disabled={saving} />
                                <FieldLabel htmlFor={id}>Use photo {index + 1}</FieldLabel>
                              </Field>
                            </Field>
                          );
                        })}
                      </FieldGroup>
                      <FieldDescription>{selectedReferenceUrls.size} selected. Selected merchant images are copied into The Swell&apos;s own Storage when you register this item.</FieldDescription>
                    </Field>
                  ) : null}

                  {researchResult.warnings.length ? (
                    <Field>
                      <FieldLabel>Review notes</FieldLabel>
                      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
                        {researchResult.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                      </ul>
                    </Field>
                  ) : null}

                  <Field orientation="horizontal">
                    <FieldDescription>Prefer an existing definition instead?</FieldDescription>
                    <Button type="button" variant="outline" size="sm" onClick={discardResearch} disabled={saving}>Discard imported details</Button>
                  </Field>
                </FieldGroup>
              ) : null}
            </FieldGroup>
          ) : null}

          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="gear-asset-definition">{cableAssetSelected ? "Cable definition" : "Gear definition"}</FieldLabel>
              <Select value={researchResult ? null : definitionId || NO_DEFINITION_VALUE} onValueChange={chooseDefinition} disabled={saving || Boolean(asset) || Boolean(researchResult)}>
                <SelectTrigger id="gear-asset-definition" className="w-full">
                  <SelectValue>{researchResult
                    ? `New definition: ${researchResult.name}`
                    : definition
                      ? `${definition.name}${definition.model ? ` · ${definition.model}` : ""}`
                      : cableAssetSelected
                        ? "Choose a cable definition"
                        : "None · basic inventory item"}</SelectValue>
                </SelectTrigger>
                <SelectContent><SelectGroup>
                  {cableAssetSelected
                    ? <SelectItem value={NO_DEFINITION_VALUE} disabled>Choose a cable definition</SelectItem>
                    : <SelectItem value={NO_DEFINITION_VALUE}>None · basic inventory item</SelectItem>}
                  {selectableDefinitions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}{item.model ? ` · ${item.model}` : ""}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
              <FieldDescription>{researchResult
                ? "The researched product will become a new reusable definition when this item is registered."
                : definition?.cableEnds
                  ? `Bidirectional cable: End 1 ${formatCableDefinitionEnd(definition.cableEnds.end1)}; End 2 ${formatCableDefinitionEnd(definition.cableEnds.end2)}. Length belongs to this individual asset.`
                : cableAssetSelected
                  ? "Choose the reusable cable type by its two ends. Manufacturer and length belong to this individual cable."
                : definitionId
                  ? "The definition holds reusable product data and ports. This record represents one intended or physical item."
                  : "Use None for stands, cases, furniture, and other basic items that only need an inventory record."}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="gear-asset-label">Asset name</FieldLabel>
              <Input id="gear-asset-label" value={label} onChange={(event) => {
                const nextLabel = event.target.value;
                setLabel(nextLabel);
                if (!asset && !definitionId && !researchResult) {
                  const nextGroup = inferInventoryAssetCodeGroup({
                    isCable: cableAssetSelected,
                    label: nextLabel,
                    tags: selectedTags,
                  });
                  setAssetTag(createInventoryAssetCode(existingAssetTags, nextGroup));
                }
              }} placeholder={cableAssetSelected ? "6' XLR-M → TRS-M" : definitionId || researchResult ? "Ike's SM58 #2" : "Tall boom mic stand"} required disabled={saving} />
            </Field>
            <Field data-invalid={Boolean(assetTagIssue)}>
              <FieldLabel htmlFor="gear-asset-tag">Inventory ID</FieldLabel>
              <Input
                id="gear-asset-tag"
                value={assetTag}
                inputMode="numeric"
                maxLength={4}
                autoCapitalize="off"
                autoComplete="off"
                spellCheck={false}
                readOnly
                required
                aria-invalid={Boolean(assetTagIssue)}
                disabled={saving}
              />
              {assetTagIssue
                ? <FieldError>{assetTagIssue}</FieldError>
                : <FieldDescription>
                  Assigned automatically as a four-digit check-in number. Microphones begin at 0100, stands at 0200, instruments at 0300, pedals at 0400, and rack gear at 0500.
                </FieldDescription>}
            </Field>
            {cableAssetSelected ? (
              <FieldSet className="sm:col-span-2">
                <FieldLegend>Individual cable details</FieldLegend>
                <FieldDescription>The ends define the reusable cable type. Manufacturer, color, and length describe this exact cable.</FieldDescription>
                <FieldGroup className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="gear-cable-manufacturer">Manufacturer</FieldLabel>
                    <Input
                      id="gear-cable-manufacturer"
                      value={cableManufacturer}
                      onChange={(event) => setCableManufacturer(event.target.value)}
                      placeholder="Mogami or Generic"
                      disabled={saving}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="gear-cable-color">Color</FieldLabel>
                    <Select value={cableColor} onValueChange={(value) => value && setCableColor(value as NonNullable<InventoryAsset["cableColor"]>)} disabled={saving}>
                      <SelectTrigger id="gear-cable-color" className="w-full"><SelectValue><CableColorSwatch color={cableColor} />{cableColorLabel(cableColor)}</SelectValue></SelectTrigger>
                      <SelectContent><SelectGroup>
                        {CABLE_COLOR_OPTIONS.map((color) => <SelectItem key={color} value={color}><CableColorSwatch color={color} />{cableColorLabel(color)}</SelectItem>)}
                      </SelectGroup></SelectContent>
                    </Select>
                  </Field>
                  <Field data-invalid={showCableLengthIssue}>
                    <FieldLabel htmlFor="gear-cable-length-feet">Feet</FieldLabel>
                    <Input
                      id="gear-cable-length-feet"
                      type="number"
                      min="0.001"
                      step="any"
                      inputMode="decimal"
                      value={cableLengthFeet}
                      onChange={(event) => changeCableLengthFeet(event.target.value)}
                      required
                      aria-invalid={showCableLengthIssue}
                      disabled={saving}
                    />
                  </Field>
                  <Field data-invalid={showCableLengthIssue}>
                    <FieldLabel htmlFor="gear-cable-length-inches">Total inches</FieldLabel>
                    <Input
                      id="gear-cable-length-inches"
                      type="number"
                      min="0.001"
                      step="any"
                      inputMode="decimal"
                      value={cableLengthInches}
                      onChange={(event) => changeCableLengthInches(event.target.value)}
                      required
                      aria-invalid={showCableLengthIssue}
                      disabled={saving}
                    />
                    {showCableLengthIssue ? <FieldError>{cableLengthIssue}</FieldError> : null}
                  </Field>
                </FieldGroup>
              </FieldSet>
            ) : null}
            <Field>
              <FieldLabel htmlFor="gear-asset-lifecycle">Lifecycle</FieldLabel>
              <Select value={lifecycleStatus} onValueChange={(value) => value && setLifecycleStatus(value as InventoryAssetLifecycle)} disabled={saving}>
                <SelectTrigger id="gear-asset-lifecycle" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {ASSET_LIFECYCLE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="gear-asset-owner">Owner</FieldLabel>
              <Select value={ownerPartyId || "none"} onValueChange={(value) => setOwnerPartyId(value === "none" || !value ? "" : value)} disabled={saving}>
                <SelectTrigger id="gear-asset-owner" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  <SelectItem value="none">Not assigned</SelectItem>
                  {parties.map((party) => <SelectItem key={party.id} value={party.id}>{party.name}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
              <FieldDescription>Ownership can be assigned before the item physically arrives.</FieldDescription>
            </Field>
            {physicalStatus ? (
              <Field>
                <FieldLabel htmlFor="gear-asset-location">Current location</FieldLabel>
                <Select value={currentLocationId || "none"} onValueChange={(value) => setCurrentLocationId(value === "none" || !value ? "" : value)} disabled={saving}>
                  <SelectTrigger id="gear-asset-location" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value="none">Not checked in</SelectItem>
                    {locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
            ) : null}
            {!cableAssetSelected ? <Field>
              <FieldLabel htmlFor="gear-asset-serial">Serial number</FieldLabel>
              <Input id="gear-asset-serial" value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} placeholder="Add when it arrives" disabled={saving} />
            </Field> : null}
          </FieldGroup>

          {!cableAssetSelected ? <Field orientation="horizontal" className="rounded-lg border bg-muted/30 p-3" data-disabled={saving || researching}>
            <FieldContent>
              <FieldLabel htmlFor="gear-asset-stage-only">Stage only</FieldLabel>
              <FieldDescription>Keep this exact item in STAGE planning, but hide it from the logical SIGNAL diagram when it is assigned to a setup.</FieldDescription>
            </FieldContent>
            <Switch id="gear-asset-stage-only" checked={stageOnly} onCheckedChange={setStageOnly} disabled={saving || researching} />
          </Field> : null}

          <Field data-invalid={Boolean(purchaseUrlIssue)}>
            <FieldLabel htmlFor="gear-asset-purchase-url">Purchase URL</FieldLabel>
            <Input
              id="gear-asset-purchase-url"
              type="url"
              value={purchaseUrl}
              onChange={(event) => setPurchaseUrl(event.target.value)}
              placeholder="https://www.sweetwater.com/..."
              aria-invalid={Boolean(purchaseUrlIssue)}
              disabled={saving}
            />
            {purchaseUrlIssue
              ? <FieldError>{purchaseUrlIssue}</FieldError>
              : <FieldDescription>Saved on this individual item, separate from the definition&apos;s AI research source.</FieldDescription>}
            {normalizedPurchaseUrl ? (
              <a href={normalizedPurchaseUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm", className: "self-start" })}>
                Open purchase page <ExternalLinkIcon data-icon="inline-end" />
              </a>
            ) : null}
          </Field>

          {definition?.purchaseSource ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <Badge variant="secondary">Definition source</Badge>
              <a href={definition.purchaseSource.url} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">
                {definition.purchaseSource.vendor || "Product page"}{definition.purchaseSource.priceDisplay ? ` · ${definition.purchaseSource.priceDisplay}` : ""}
              </a>
            </div>
          ) : null}

          <Field>
            <FieldLabel htmlFor="gear-asset-photos">Photos of this physical item</FieldLabel>
            <label htmlFor="gear-asset-photos" className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/25 px-4 py-5 text-center text-sm font-medium hover:bg-muted/50">
              <CameraIcon aria-hidden />
              {photoFiles.length ? `${photoFiles.length} new photo${photoFiles.length === 1 ? "" : "s"} selected` : "Choose physical-item photos"}
              <input id="gear-asset-photos" className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhotos(event.target.files)} disabled={saving} />
            </label>
            <FieldDescription>These document the exact item. They stay separate from the product icon and reusable reference photos.</FieldDescription>
            {inheritedPhotos.length ? (
              <div className="grid grid-cols-4 gap-2">
                {inheritedPhotos.slice(0, 8).map((photo) => (
                  <span key={photo.storagePath} className="relative aspect-square overflow-hidden rounded-md border bg-muted">
                    <Image src={photo.downloadUrl} alt={photo.filename} fill sizes="120px" className="object-cover" unoptimized />
                  </span>
                ))}
              </div>
            ) : null}
            {duplicateFrom && inheritedPhotos.length ? <FieldDescription>These existing photo files are reused by reference. Add new photos if this unit has different identifying marks.</FieldDescription> : null}
          </Field>

          <FieldGroup className="rounded-lg border bg-muted/30 p-3">
            <Field data-invalid={Boolean(tagError)}>
              <FieldLabel htmlFor="gear-asset-tag-input">Tags</FieldLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="gear-asset-tag-input"
                  value={tagDraft}
                  onChange={(event) => { setTagDraft(event.target.value); setTagError(null); }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTags();
                    }
                  }}
                  placeholder="stands, mics, instruments"
                  aria-invalid={Boolean(tagError)}
                  disabled={saving}
                />
                <Button type="button" variant="outline" onClick={() => addTags()} disabled={saving || !tagDraft.trim()}>
                  <PlusIcon data-icon="inline-start" />Add tag
                </Button>
              </div>
              <FieldDescription>Add up to {MAX_INVENTORY_TAGS} tags. Separate several with commas or press Enter after each one.</FieldDescription>
              {tagError ? <FieldError>{tagError}</FieldError> : null}
            </Field>

            {selectedTags.length ? (
              <Field>
                <FieldLabel>Applied tags</FieldLabel>
                <div className="flex flex-wrap gap-2" aria-label="Applied gear tags">
                  {selectedTags.map((tag) => tag.toLocaleLowerCase() === CABLE_INVENTORY_TAG.toLocaleLowerCase() ? (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ) : (
                    <Badge
                      key={tag}
                      variant="secondary"
                      render={<button type="button" onClick={() => removeTag(tag)} disabled={saving} aria-label={`Remove ${tag} tag`} />}
                    >
                      {tag}<XIcon aria-hidden data-icon="inline-end" />
                    </Badge>
                  ))}
                </div>
              </Field>
            ) : null}

            {tagSuggestions.length ? (
              <Field>
                <FieldLabel>Suggested tags</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {tagSuggestions.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      render={<button type="button" onClick={() => addTags(tag)} disabled={saving} aria-label={`Add ${tag} tag`} />}
                    >
                      <PlusIcon aria-hidden data-icon="inline-start" />{tag}
                    </Badge>
                  ))}
                </div>
              </Field>
            ) : null}
          </FieldGroup>

          <Field>
            <FieldLabel htmlFor="gear-asset-notes">Notes</FieldLabel>
            <Textarea id="gear-asset-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Why we need it, condition, identifying marks, or receiving instructions." rows={3} disabled={saving} />
          </Field>

          {asset ? <GearLabelPrinter assetTag={canonicalAssetTag} assetName={cableAssetSelected ? formatCableAssetLabel(label, normalizedCableLengthInches) : label} /> : null}

          {saving && (photoFiles.length || selectedReferenceUrls.size) ? <Progress value={progress} aria-label={`Gear photo upload ${progress}% complete`} /> : null}
              {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
            </form>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" form="gear-asset-form" disabled={saving || researching || !label.trim() || Boolean(assetTagIssue) || Boolean(cableLengthIssue) || Boolean(cableDefinitionIssue) || Boolean(purchaseUrlIssue)}>
            {asset ? <SaveIcon data-icon="inline-start" /> : duplicateFrom ? <CopyPlusIcon data-icon="inline-start" /> : <PackagePlusIcon data-icon="inline-start" />}
            {saving ? "Saving..." : asset ? "Save asset" : duplicateFrom ? "Create duplicate" : initialLifecycle === "planned" ? "Create planned asset" : "Register asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function mergeInventoryTagInput(currentTags: string[], rawValue: string) {
  const candidates = rawValue
    .split(",")
    .map((tag) => tag.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const tooLong = candidates.find((tag) => tag.length > MAX_INVENTORY_TAG_LENGTH);
  if (tooLong) return { tags: currentTags, error: `Keep each tag to ${MAX_INVENTORY_TAG_LENGTH} characters or fewer.` };
  const tags = normalizeInventoryTags([...currentTags, ...candidates]);
  if (tags.length > MAX_INVENTORY_TAGS) return { tags: currentTags, error: `Use no more than ${MAX_INVENTORY_TAGS} tags on one item.` };
  return { tags, error: undefined };
}

function positiveNumberOrUndefined(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function measurementInputValue(value: number) {
  return String(Math.round(value * 10000) / 10000);
}
