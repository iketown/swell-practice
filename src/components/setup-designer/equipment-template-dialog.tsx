"use client";

import { ArchiveIcon, BotIcon, ExternalLinkIcon, ImagePlusIcon, LoaderCircleIcon, PlusIcon, SaveIcon, SparklesIcon } from "lucide-react";
import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";

import { CableEndEditor } from "@/components/setup-designer/cable-end-editor";
import { EquipmentPortEditor } from "@/components/setup-designer/equipment-port-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { createDefaultCableDefinitionEnds, formatCableDefinitionName } from "@/lib/setup-designer/cable-definitions";
import type { CableDefinitionEnds, EquipmentKind, EquipmentPort, EquipmentTemplate, EquipmentTransportTopology, GearDefinitionKind, ImportedEquipmentDraft } from "@/lib/setup-designer/domain";
import { downloadEquipmentReferenceImages, researchEquipmentUrl } from "@/lib/setup-designer/equipment-research-client";
import { createPort } from "@/lib/setup-designer/ports";
import { archiveEquipmentTemplate, createEquipmentTemplate, updateEquipmentTemplate, updateEquipmentTemplateImages } from "@/lib/setup-designer/repository";
import { defaultTransportTopology } from "@/lib/setup-designer/snake-topology";
import { cn } from "@/lib/utils";

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function initialPorts(): EquipmentPort[] {
  return [
    createPort("input", 1, { connectorTypeId: "xlr", connectorGender: "female", signalType: "microphone", labelPrefix: "Input" }),
    createPort("output", 1, { connectorTypeId: "xlr", connectorGender: "male", signalType: "analog-line", labelPrefix: "Output" }),
  ];
}

interface EquipmentTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: EquipmentTemplate;
  initialDefinitionKind?: GearDefinitionKind;
  initialName?: string;
  lockDefinitionKind?: boolean;
  creationContext?: "catalog" | "asset";
  onCreated?: (template: EquipmentTemplate) => void;
  onSaved?: (template: EquipmentTemplate) => void;
  onArchived?: (template: EquipmentTemplate) => void;
  showArchiveAction?: boolean;
}

export function EquipmentTemplateDialog({
  open,
  onOpenChange,
  template,
  initialDefinitionKind = "equipment",
  initialName = "",
  lockDefinitionKind = false,
  creationContext = "catalog",
  onCreated,
  onSaved,
  onArchived,
  showArchiveAction = true,
}: EquipmentTemplateDialogProps) {
  const startingDefinitionKind = template?.definitionKind ?? initialDefinitionKind;
  const [name, setName] = useState(template?.name ?? initialName);
  const [definitionKind, setDefinitionKind] = useState<GearDefinitionKind>(startingDefinitionKind);
  const [manufacturer, setManufacturer] = useState(template?.manufacturer ?? "");
  const [model, setModel] = useState(template?.model ?? "");
  const [category, setCategory] = useState(template?.category ?? "Other");
  const [equipmentKind, setEquipmentKind] = useState<EquipmentKind>(template?.equipmentKind ?? "device");
  const [transport, setTransport] = useState<EquipmentTransportTopology | undefined>(() => template?.transport ? structuredClone(template.transport) : undefined);
  const [description, setDescription] = useState(template?.description ?? "");
  const [notes, setNotes] = useState(template?.notes ?? "");
  const [widthInches, setWidthInches] = useState(template?.physicalDimensions?.widthInches?.toString() ?? "");
  const [depthInches, setDepthInches] = useState(template?.physicalDimensions?.depthInches?.toString() ?? "");
  const [heightInches, setHeightInches] = useState(template?.physicalDimensions?.heightInches?.toString() ?? "");
  const [weightPounds, setWeightPounds] = useState(template?.physicalDimensions?.weightPounds?.toString() ?? "");
  const [dimensionSourceText, setDimensionSourceText] = useState(template?.physicalDimensions?.sourceText ?? "");
  const [productUrl, setProductUrl] = useState(template?.purchaseSource?.url ?? "");
  const [priceAmount, setPriceAmount] = useState(template?.purchaseSource?.priceAmount?.toString() ?? "");
  const [priceCurrency, setPriceCurrency] = useState(template?.purchaseSource?.priceCurrency ?? "");
  const [priceDisplay, setPriceDisplay] = useState(template?.purchaseSource?.priceDisplay ?? "");
  const [priceVendor, setPriceVendor] = useState(template?.purchaseSource?.vendor ?? "");
  const [ports, setPorts] = useState<EquipmentPort[]>(() => template ? structuredClone(template.ports) : initialPorts());
  const [cableEnds, setCableEnds] = useState<CableDefinitionEnds>(() => template?.cableEnds ? structuredClone(template.cableEnds) : createDefaultCableDefinitionEnds());
  const [needsPowerSource, setNeedsPowerSource] = useState(template?.needsPowerSource ?? false);
  const [needsPowerAdapter, setNeedsPowerAdapter] = useState(template?.needsPowerAdapter ?? false);
  const [showInSignalView, setShowInSignalView] = useState(template?.showInSignalView ?? startingDefinitionKind === "equipment");
  const [imageFile, setImageFile] = useState<File | undefined>();
  const [researchResult, setResearchResult] = useState<ImportedEquipmentDraft | null>(null);
  const [selectedReferenceUrls, setSelectedReferenceUrls] = useState<Set<string>>(() => new Set(template?.referenceImages.map((image) => image.url) ?? []));
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const researchStatusRef = useRef<HTMLDivElement>(null);
  const referenceImages = researchResult?.referenceImages ?? template?.referenceImages ?? [];

  useEffect(() => {
    if (researching) researchStatusRef.current?.focus();
  }, [researching]);

  function resetForm() {
    setName(template?.name ?? initialName);
    setDefinitionKind(template?.definitionKind ?? initialDefinitionKind);
    setManufacturer(template?.manufacturer ?? "");
    setModel(template?.model ?? "");
    setCategory(template?.category ?? "Other");
    setEquipmentKind(template?.equipmentKind ?? "device");
    setTransport(template?.transport ? structuredClone(template.transport) : undefined);
    setDescription(template?.description ?? "");
    setNotes(template?.notes ?? "");
    setWidthInches(template?.physicalDimensions?.widthInches?.toString() ?? "");
    setDepthInches(template?.physicalDimensions?.depthInches?.toString() ?? "");
    setHeightInches(template?.physicalDimensions?.heightInches?.toString() ?? "");
    setWeightPounds(template?.physicalDimensions?.weightPounds?.toString() ?? "");
    setDimensionSourceText(template?.physicalDimensions?.sourceText ?? "");
    setProductUrl(template?.purchaseSource?.url ?? "");
    setPriceAmount(template?.purchaseSource?.priceAmount?.toString() ?? "");
    setPriceCurrency(template?.purchaseSource?.priceCurrency ?? "");
    setPriceDisplay(template?.purchaseSource?.priceDisplay ?? "");
    setPriceVendor(template?.purchaseSource?.vendor ?? "");
    setPorts(template ? structuredClone(template.ports) : initialPorts());
    setCableEnds(template?.cableEnds ? structuredClone(template.cableEnds) : createDefaultCableDefinitionEnds());
    setNeedsPowerSource(template?.needsPowerSource ?? false);
    setNeedsPowerAdapter(template?.needsPowerAdapter ?? false);
    setShowInSignalView(template?.showInSignalView ?? initialDefinitionKind === "equipment");
    setImageFile(undefined);
    setResearchResult(null);
    setSelectedReferenceUrls(new Set(template?.referenceImages.map((image) => image.url) ?? []));
    setResearching(false);
    setResearchError(null);
    setProgress(0);
    setError(null);
  }

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  function chooseImage(file: File | undefined) {
    if (!file) {
      setImageFile(undefined);
      return;
    }
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Choose an image smaller than 10 MB.");
      return;
    }
    setError(null);
    setImageFile(file);
  }

  function chooseReferenceImage(url: string, checked: boolean) {
    setSelectedReferenceUrls((current) => {
      const next = new Set(current);
      if (checked) next.add(url);
      else next.delete(url);
      return next;
    });
  }

  async function researchProduct() {
    if (!productUrl.trim() || researching) return;
    setResearching(true);
    setResearchError(null);
    try {
      const result = await researchEquipmentUrl(productUrl.trim());
      setResearchResult(result);
      setDefinitionKind("equipment");
      setName(result.name);
      setManufacturer(result.manufacturer ?? "");
      setModel(result.model ?? "");
      setCategory(result.category || "Other");
      setEquipmentKind(result.equipmentKind ?? "device");
      setTransport(result.transport ? structuredClone(result.transport) : undefined);
      setDescription(result.description ?? "");
      setWidthInches(result.physicalDimensions?.widthInches?.toString() ?? "");
      setDepthInches(result.physicalDimensions?.depthInches?.toString() ?? "");
      setHeightInches(result.physicalDimensions?.heightInches?.toString() ?? "");
      setWeightPounds(result.physicalDimensions?.weightPounds?.toString() ?? "");
      setDimensionSourceText(result.physicalDimensions?.sourceText ?? "");
      setProductUrl(result.purchaseSource.url);
      setPriceAmount(result.purchaseSource.priceAmount?.toString() ?? "");
      setPriceCurrency(result.purchaseSource.priceCurrency ?? "");
      setPriceDisplay(result.purchaseSource.priceDisplay ?? "");
      setPriceVendor(result.purchaseSource.vendor ?? "");
      setPorts(structuredClone(result.ports));
      setSelectedReferenceUrls(new Set(result.referenceImages.slice(0, 3).map((image) => image.url)));
    } catch (caught) {
      setResearchError(caught instanceof Error ? caught.message : "The product page could not be researched.");
    } finally {
      setResearching(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const definitionName = definitionKind === "cable" ? formatCableDefinitionName(cableEnds) : name.trim();
    if (!definitionName) return;
    setSaving(true);
    setError(null);
    setProgress(0);
    try {
      const savedTransport = definitionKind === "equipment" && equipmentKind !== "device" ? transport ?? defaultTransportTopology(equipmentKind) : undefined;
      const definition = {
        name: definitionName,
        definitionKind,
        manufacturer: definitionKind === "equipment" ? manufacturer.trim() || undefined : undefined,
        model: definitionKind === "equipment" ? model.trim() || undefined : undefined,
        category: definitionKind === "equipment" ? category.trim() || "Other" : "Cable",
        equipmentKind: definitionKind === "cable" ? "device" as const : equipmentKind,
        transport: savedTransport ? structuredClone(savedTransport) : undefined,
        description: definitionKind === "equipment" ? description.trim() || undefined : undefined,
        notes: definitionKind === "equipment" ? notes.trim() || undefined : undefined,
        physicalDimensions: definitionKind === "equipment" && (widthInches || depthInches || heightInches || weightPounds || dimensionSourceText.trim()) ? {
          widthInches: positiveNumberOrUndefined(widthInches),
          depthInches: positiveNumberOrUndefined(depthInches),
          heightInches: positiveNumberOrUndefined(heightInches),
          weightPounds: positiveNumberOrUndefined(weightPounds),
          sourceText: dimensionSourceText.trim() || undefined,
        } : undefined,
        purchaseSource: definitionKind === "equipment" && productUrl.trim() ? {
          url: productUrl.trim(),
          vendor: priceVendor.trim() || undefined,
          priceAmount: priceAmount.trim() && Number.isFinite(Number(priceAmount)) && Number(priceAmount) >= 0 ? Number(priceAmount) : undefined,
          priceCurrency: priceCurrency.trim().toUpperCase() || undefined,
          priceDisplay: priceDisplay.trim() || undefined,
          observedAt: researchResult?.purchaseSource.observedAt ?? Date.now(),
        } : undefined,
        referenceImages: definitionKind === "equipment" ? referenceImages.filter((image) => selectedReferenceUrls.has(image.url)) : [],
        aiImport: definitionKind === "equipment" ? researchResult?.aiImport ?? template?.aiImport : undefined,
        cableEnds: definitionKind === "cable" ? structuredClone(cableEnds) : undefined,
        ports: definitionKind === "cable" ? [] : structuredClone(ports),
        needsPowerSource: definitionKind === "equipment" && (needsPowerSource || needsPowerAdapter),
        needsPowerAdapter: definitionKind === "equipment" && needsPowerAdapter,
        showInSignalView: definitionKind === "cable" ? false : showInSignalView,
        showPortNumbers: template?.showPortNumbers ?? true,
        showPortLabels: template?.showPortLabels ?? true,
      };
      const selectedImageUrls = definitionKind === "equipment" ? referenceImages.filter((image) => selectedReferenceUrls.has(image.url)).map((image) => image.url) : [];
      const downloadedImages = definitionKind === "equipment" && researchResult ? await downloadEquipmentReferenceImages(selectedImageUrls) : { files: [], failedCount: 0 };
      if (downloadedImages.failedCount) {
        console.warn(`${downloadedImages.failedCount} selected merchant image${downloadedImages.failedCount === 1 ? "" : "s"} could not be copied to Storage.`);
      }
      const savedDefinition = template
        ? await updateEquipmentTemplate({
            ...structuredClone(template),
            ...definition,
            image: definitionKind === "cable" ? undefined : template.image,
            stageImage: definitionKind === "cable" ? undefined : template.stageImage,
            detailImages: definitionKind === "cable" ? [] : template.detailImages ?? [],
          }, definitionKind === "equipment" ? imageFile : undefined, setProgress)
        : await createEquipmentTemplate(definition, definitionKind === "equipment" ? imageFile : undefined, setProgress);
      const saved = downloadedImages.files.length
        ? await updateEquipmentTemplateImages(savedDefinition, { detailFiles: downloadedImages.files }, setProgress)
        : savedDefinition;
      if (template) onSaved?.(saved);
      else onCreated?.(saved);
      changeOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not ${template ? "update" : "create"} this equipment.`);
    } finally {
      setSaving(false);
    }
  }

  async function archiveDefinition() {
    if (!template || saving) return;
    setSaving(true);
    setError(null);
    try {
      const archived = await archiveEquipmentTemplate(template);
      onArchived?.(archived);
      changeOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not archive this definition.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{template ? `Edit ${template.name}` : definitionKind === "cable" ? "New cable definition" : "New gear definition"}</DialogTitle>
          <DialogDescription>{template
            ? "Update this reusable definition. Equipment uses directional ports; cables use two interchangeable connector ends."
            : creationContext === "asset"
              ? definitionKind === "cable"
                ? "Define the two reusable cable ends. Save to return to this item with the new definition selected."
                : "Define the reusable gear type and its physical ports. Save to return to this item with the new definition selected."
              : "Create reusable equipment with directional ports or a cable type with two interchangeable ends. Physical and planned assets are created separately."}</DialogDescription>
        </DialogHeader>
        <form id="equipment-template-form" onSubmit={submit} className="flex flex-col gap-5" aria-busy={researching}>
          {definitionKind === "equipment" ? <FieldGroup className="rounded-lg border bg-muted/30 p-3">
            <Field data-invalid={Boolean(researchError)}>
              <FieldLabel htmlFor="equipment-product-url">Research a product page</FieldLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="equipment-product-url"
                  type="url"
                  value={productUrl}
                  onChange={(event) => setProductUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void researchProduct();
                    }
                  }}
                  placeholder="https://www.sweetwater.com/store/detail/SD16--behringer-s16-digital-snake"
                  aria-invalid={Boolean(researchError)}
                  disabled={researching}
                />
                <Button type="button" variant="secondary" onClick={() => void researchProduct()} disabled={researching || !productUrl.trim()}>
                  <SparklesIcon data-icon="inline-start" />
                  {researching ? "Researching..." : "Research product"}
                </Button>
              </div>
              <FieldDescription>AI reads the supplied page and supporting technical sources, then fills this form for review. Research usually takes 20–60 seconds and never creates equipment until you approve it.</FieldDescription>
              {researchError ? <p className="text-sm text-destructive" role="alert">{researchError}</p> : null}
            </Field>

            {researchResult ? (
              <Field>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">AI researched</Badge>
                  <Badge variant="outline">{researchResult.confidence} confidence</Badge>
                  <Badge variant="outline">{researchResult.aiImport.model}</Badge>
                  {researchResult.transport ? <Badge variant="outline">{researchResult.transport.channelCount}-channel {researchResult.transport.kind === "split-snake" ? "split snake" : "snake"}</Badge> : null}
                  <a href={researchResult.purchaseSource.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4">
                    Open source <ExternalLinkIcon aria-hidden className="size-3.5" />
                  </a>
                </div>
                {researchResult.warnings.length ? (
                  <ul className="list-disc pl-5 text-sm text-muted-foreground">
                    {researchResult.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                ) : <FieldDescription>No research warnings. Review port counts and the live price before saving.</FieldDescription>}
              </Field>
            ) : null}
          </FieldGroup> : null}

          <div className="relative">
            <fieldset
              disabled={researching}
              inert={researching}
              aria-hidden={researching}
              className={cn(
                "flex min-w-0 flex-col gap-5 border-0 p-0 transition-[filter,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                researching && "pointer-events-none select-none blur-[2px] opacity-35",
              )}
            >
          <FieldGroup className="gap-4">
            {!lockDefinitionKind ? <Field className="sm:max-w-sm">
              <FieldLabel htmlFor="equipment-definition-kind">Definition type</FieldLabel>
              <Select value={definitionKind} onValueChange={(value) => {
                if (!value) return;
                const nextKind = value as GearDefinitionKind;
                setDefinitionKind(nextKind);
                if (nextKind === "cable") {
                  setEquipmentKind("device");
                  setTransport(undefined);
                  setShowInSignalView(false);
                  setImageFile(undefined);
                } else {
                  setShowInSignalView(template?.showInSignalView ?? ports.length > 0);
                }
              }}>
                <SelectTrigger id="equipment-definition-kind" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  <SelectItem value="equipment">Equipment</SelectItem>
                  <SelectItem value="cable">Cable</SelectItem>
                </SelectGroup></SelectContent>
              </Select>
              <FieldDescription>Cables are bidirectional and use End 1 and End 2 instead of inputs and outputs.</FieldDescription>
            </Field> : null}
            {definitionKind === "equipment" ? (
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={Boolean(error && !name.trim())}>
                  <FieldLabel htmlFor="equipment-name">Name</FieldLabel>
                  <Input id="equipment-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Guitar D.I." required aria-invalid={Boolean(error && !name.trim())} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="equipment-category">Category</FieldLabel>
                  <Input id="equipment-category" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Direct box" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="equipment-kind">Equipment behavior</FieldLabel>
                  <Select value={equipmentKind} onValueChange={(value) => {
                    if (!value) return;
                    const nextKind = value as EquipmentKind;
                    setEquipmentKind(nextKind);
                    setTransport(nextKind === "device" ? undefined : defaultTransportTopology(nextKind));
                    if (nextKind === "device") {
                      setPorts((current) => current.map((port) => ({ ...port, endpointId: undefined, channelKey: undefined })));
                    }
                  }}>
                    <SelectTrigger id="equipment-kind" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup>
                      <SelectItem value="device">Standard device</SelectItem>
                      <SelectItem value="snake">Snake · two linked sides</SelectItem>
                      <SelectItem value="split-snake">Split snake · three linked sides</SelectItem>
                    </SelectGroup></SelectContent>
                  </Select>
                  <FieldDescription>Snakes expand into movable endpoints joined by their fixed multicore trunk.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="equipment-manufacturer">Manufacturer</FieldLabel>
                  <Input id="equipment-manufacturer" value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} placeholder="Radial" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="equipment-model">Model</FieldLabel>
                  <Input id="equipment-model" value={model} onChange={(event) => setModel(event.target.value)} placeholder="JDI" />
                </Field>
              </FieldGroup>
            ) : null}
          </FieldGroup>

          {definitionKind === "equipment" ? <FieldGroup className="grid gap-4 rounded-lg border bg-muted/30 p-3 sm:grid-cols-4">
            <Field className="sm:col-span-4">
              <FieldLabel>Physical dimensions</FieldLabel>
              <FieldDescription>Reusable product measurements. Width and depth become the default STAGE footprint for newly placed equipment.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="equipment-width">Width (in)</FieldLabel>
              <Input id="equipment-width" type="number" min="0" step="0.01" inputMode="decimal" value={widthInches} onChange={(event) => setWidthInches(event.target.value)} placeholder="19" />
            </Field>
            <Field>
              <FieldLabel htmlFor="equipment-depth">Depth (in)</FieldLabel>
              <Input id="equipment-depth" type="number" min="0" step="0.01" inputMode="decimal" value={depthInches} onChange={(event) => setDepthInches(event.target.value)} placeholder="8.5" />
            </Field>
            <Field>
              <FieldLabel htmlFor="equipment-height">Height (in)</FieldLabel>
              <Input id="equipment-height" type="number" min="0" step="0.01" inputMode="decimal" value={heightInches} onChange={(event) => setHeightInches(event.target.value)} placeholder="3.5" />
            </Field>
            <Field>
              <FieldLabel htmlFor="equipment-weight">Weight (lb)</FieldLabel>
              <Input id="equipment-weight" type="number" min="0" step="0.01" inputMode="decimal" value={weightPounds} onChange={(event) => setWeightPounds(event.target.value)} placeholder="8.4" />
            </Field>
            {dimensionSourceText ? (
              <Field className="sm:col-span-4">
                <FieldLabel htmlFor="equipment-dimension-source">Source text</FieldLabel>
                <Input id="equipment-dimension-source" value={dimensionSourceText} onChange={(event) => setDimensionSourceText(event.target.value)} />
              </Field>
            ) : null}
          </FieldGroup> : null}

          {definitionKind === "equipment" ? <FieldSet className="rounded-lg border bg-muted/30 p-3">
            <FieldLegend>Power dependencies</FieldLegend>
            <FieldDescription>These defaults follow every new setup instance and every inventory item using this definition.</FieldDescription>
            <FieldGroup className="gap-3">
              <Field orientation="horizontal">
                <div className="flex flex-1 flex-col gap-1">
                  <FieldLabel htmlFor="equipment-needs-power-source">Needs power source</FieldLabel>
                  <FieldDescription>Place this gear within reach of a stage power drop or other power source.</FieldDescription>
                </div>
                <Switch
                  id="equipment-needs-power-source"
                  checked={needsPowerSource || needsPowerAdapter}
                  onCheckedChange={(checked) => {
                    setNeedsPowerSource(checked);
                    if (!checked) setNeedsPowerAdapter(false);
                  }}
                />
              </Field>
              <Field orientation="horizontal">
                <div className="flex flex-1 flex-col gap-1">
                  <FieldLabel htmlFor="equipment-needs-power-adapter">Needs power adapter</FieldLabel>
                  <FieldDescription>The separately labeled adapter travels with the same four-digit ID as this item.</FieldDescription>
                </div>
                <Switch
                  id="equipment-needs-power-adapter"
                  checked={needsPowerAdapter}
                  onCheckedChange={(checked) => {
                    setNeedsPowerAdapter(checked);
                    if (checked) setNeedsPowerSource(true);
                  }}
                />
              </Field>
            </FieldGroup>
          </FieldSet> : null}

          {definitionKind === "equipment" ? <Field orientation="horizontal" className="rounded-lg border bg-muted/30 p-3">
            <Checkbox
              id="equipment-show-in-signal"
              checked={showInSignalView}
              onCheckedChange={(checked) => setShowInSignalView(checked === true)}
            />
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="equipment-show-in-signal">Show this equipment in SIGNAL</FieldLabel>
              <FieldDescription>Turn this off for stands, furniture, and other stage-only gear. It remains catalogued and always appears in STAGE.</FieldDescription>
            </div>
          </Field> : null}

          {transport ? (
            <FieldGroup className="rounded-lg border bg-muted/30 p-3">
              <Field>
                <div className="flex flex-wrap items-center gap-2">
                  <FieldLabel>Snake topology</FieldLabel>
                  <Badge variant="secondary">{transport.kind === "split-snake" ? "Split snake" : "Two-sided snake"}</Badge>
                </div>
                <FieldDescription>Each side becomes its own movable graph node. Matching channel keys carry labels through the fixed trunk.</FieldDescription>
              </Field>
              <FieldGroup className="grid gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="equipment-snake-channels">Routed channels</FieldLabel>
                  <Input id="equipment-snake-channels" type="number" min={1} max={128} value={transport.channelCount} onChange={(event) => setTransport({ ...transport, channelCount: Math.max(1, Math.min(128, Number(event.target.value) || 1)) })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="equipment-snake-length">Fixed length</FieldLabel>
                  <Input id="equipment-snake-length" type="number" min={0} step="0.1" value={transport.length ?? ""} onChange={(event) => setTransport({ ...transport, length: event.target.value ? Math.max(0, Number(event.target.value)) : undefined })} placeholder="25" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="equipment-snake-length-unit">Length unit</FieldLabel>
                  <Select value={transport.lengthUnit} onValueChange={(value) => value && setTransport({ ...transport, lengthUnit: value as "ft" | "m" })}>
                    <SelectTrigger id="equipment-snake-length-unit" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup><SelectItem value="ft">Feet</SelectItem><SelectItem value="m">Meters</SelectItem></SelectGroup></SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <Field>
                <FieldLabel>Graph endpoints</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {transport.endpoints.map((endpoint) => <Badge key={endpoint.id} variant="outline">{endpoint.label} · {endpoint.style}</Badge>)}
                </div>
              </Field>
              <FieldGroup className="grid gap-3 sm:grid-cols-2">
                {transport.endpoints.map((endpoint, index) => (
                  <FieldGroup key={endpoint.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
                    <Field>
                      <FieldLabel htmlFor={`equipment-snake-endpoint-${index}-label`}>Endpoint {index + 1} label</FieldLabel>
                      <Input id={`equipment-snake-endpoint-${index}-label`} value={endpoint.label} onChange={(event) => setTransport({ ...transport, endpoints: transport.endpoints.map((item) => item.id === endpoint.id ? { ...item, label: event.target.value } : item) })} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`equipment-snake-endpoint-${index}-style`}>Physical end</FieldLabel>
                      <Select value={endpoint.style} onValueChange={(value) => value && setTransport({ ...transport, endpoints: transport.endpoints.map((item) => item.id === endpoint.id ? { ...item, style: value as "box" | "fan" | "tail" } : item) })}>
                        <SelectTrigger id={`equipment-snake-endpoint-${index}-style`} className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectGroup><SelectItem value="box">Box</SelectItem><SelectItem value="fan">Fan</SelectItem><SelectItem value="tail">Tail</SelectItem></SelectGroup></SelectContent>
                      </Select>
                    </Field>
                  </FieldGroup>
                ))}
              </FieldGroup>
            </FieldGroup>
          ) : null}

          {definitionKind === "equipment" ? <Field>
            <FieldLabel htmlFor="equipment-description">Definition description</FieldLabel>
            <Textarea id="equipment-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A concise description of what this equipment does and where it fits in a setup." rows={4} />
            <FieldDescription>Reusable catalog information. Setup-specific instructions belong in notes.</FieldDescription>
          </Field> : null}

          {definitionKind === "equipment" && productUrl.trim() ? (
            <FieldGroup className="grid gap-4 rounded-lg border p-3 sm:grid-cols-4">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="equipment-price-vendor">Seller / source</FieldLabel>
                <Input id="equipment-price-vendor" value={priceVendor} onChange={(event) => setPriceVendor(event.target.value)} placeholder="Sweetwater" />
              </Field>
              <Field>
                <FieldLabel htmlFor="equipment-price-amount">Observed price</FieldLabel>
                <Input id="equipment-price-amount" inputMode="decimal" value={priceAmount} onChange={(event) => setPriceAmount(event.target.value)} placeholder="699.00" />
              </Field>
              <Field>
                <FieldLabel htmlFor="equipment-price-currency">Currency</FieldLabel>
                <Input id="equipment-price-currency" value={priceCurrency} onChange={(event) => setPriceCurrency(event.target.value)} placeholder="USD" maxLength={12} />
              </Field>
              <Field className="sm:col-span-4">
                <FieldLabel htmlFor="equipment-price-display">Price as shown</FieldLabel>
                <Input id="equipment-price-display" value={priceDisplay} onChange={(event) => setPriceDisplay(event.target.value)} placeholder="$699.00" />
                <FieldDescription>Prices are observations, not permanent facts. The source URL and research date are stored with the equipment.</FieldDescription>
              </Field>
            </FieldGroup>
          ) : null}

          {definitionKind === "cable" ? (
            <FieldGroup className="rounded-lg border bg-muted/30 p-3">
              <Field>
                <div className="flex flex-wrap items-center gap-2">
                  <FieldLabel>Cable ends</FieldLabel>
                  <Badge variant="secondary">{formatCableDefinitionName(cableEnds)}</Badge>
                </div>
                <FieldDescription>The definition name is created from these two ends. Length, manufacturer, notes, and photos belong to each individual cable.</FieldDescription>
              </Field>
              <CableEndEditor value={cableEnds} onChange={setCableEnds} idPrefix="equipment-template-cable" />
            </FieldGroup>
          ) : (
            <FieldGroup className="rounded-lg border bg-muted/30 p-3">
            <Field>
              <div className="flex flex-wrap items-center gap-2">
                <FieldLabel>Physical port map</FieldLabel>
                {researchResult ? <Badge variant="secondary">AI-imported exact ports</Badge> : null}
              </div>
              <FieldDescription>Each row is one physical connector with its own stable ID, direction, label, connector type, gender, and signal. Group totals are derived from these rows.</FieldDescription>
            </Field>
            <EquipmentPortEditor ports={ports} onChange={setPorts} idPrefix="equipment-template" transport={transport} />
            </FieldGroup>
          )}

          {definitionKind === "equipment" && referenceImages.length ? (
            <FieldGroup className="rounded-lg border p-3">
              <Field>
                <FieldLabel>Reference product photos</FieldLabel>
                <FieldDescription>Selected source-page images are copied into The Swell&apos;s own Storage as reusable product detail photos. They remain separate from the diagram icon and photos of a specific physical asset.</FieldDescription>
              </Field>
              <FieldGroup className="grid gap-2 sm:grid-cols-2">
                {referenceImages.map((image, index) => {
                  const id = `equipment-reference-image-${index}`;
                  return (
                    <Field key={image.url} orientation="horizontal">
                      <Checkbox id={id} checked={selectedReferenceUrls.has(image.url)} onCheckedChange={(checked) => chooseReferenceImage(image.url, checked === true)} />
                      <FieldLabel htmlFor={id} className="min-w-0 flex-1">
                        <span className="truncate">Reference photo {index + 1}</span>
                        <a href={image.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4" onClick={(event) => event.stopPropagation()}>
                          Open image <ExternalLinkIcon aria-hidden className="size-3" />
                        </a>
                      </FieldLabel>
                    </Field>
                  );
                })}
              </FieldGroup>
            </FieldGroup>
          ) : null}

          {definitionKind === "equipment" ? <FieldGroup>
            <Field>
              <FieldLabel htmlFor="equipment-image">Catalog image</FieldLabel>
              <label htmlFor="equipment-image" className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background px-3 py-4 text-center text-sm font-medium hover:bg-muted/50">
                <ImagePlusIcon aria-hidden className="size-5" />
                {imageFile ? imageFile.name : "Choose JPEG, PNG, or WebP"}
                <input id="equipment-image" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event.target.files?.[0])} />
              </label>
              <FieldDescription>One clean visual representation for diagrams, ideally a transparent PNG or WebP. Optional, up to 10 MB.</FieldDescription>
            </Field>
          </FieldGroup> : null}

          {definitionKind === "equipment" ? <Field>
            <FieldLabel htmlFor="equipment-notes">Notes</FieldLabel>
            <Textarea id="equipment-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Active D.I.; phantom power supported." rows={3} />
          </Field> : null}

          {saving && (imageFile || (researchResult && selectedReferenceUrls.size)) ? <Progress value={progress} aria-label={`Upload ${progress}% complete`} /> : null}
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
            </fieldset>

            {researching ? (
              <div className="absolute inset-0 z-10 flex items-start justify-center px-4 pt-10 sm:pt-16">
                <div
                  ref={researchStatusRef}
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  tabIndex={-1}
                  className="w-full max-w-sm overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-md outline-none"
                >
                  <span className="relative block aspect-[500/281] w-full overflow-hidden bg-muted" aria-hidden>
                    <Image
                      src="/robot_working.webp"
                      alt=""
                      fill
                      sizes="384px"
                      unoptimized
                      className="object-cover motion-reduce:hidden"
                    />
                    <span className="hidden size-full place-items-center text-primary motion-reduce:grid">
                      <BotIcon className="size-12" />
                    </span>
                  </span>
                  <span className="block min-w-0 px-5 py-4">
                    <span className="flex items-center gap-2 font-semibold">
                      Researching product
                      <LoaderCircleIcon className="size-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">Checking product details, photos, pricing, and physical ports. This usually takes 20–60 seconds.</span>
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </form>
        <DialogFooter className="sm:justify-between">
          {template && showArchiveAction ? (
            <AlertDialog>
              <AlertDialogTrigger render={<Button type="button" variant="ghost" disabled={saving || researching} />}>
                <ArchiveIcon data-icon="inline-start" />
                Archive definition
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive {template.name}?</AlertDialogTitle>
                  <AlertDialogDescription>Existing setup nodes and gear assets keep their saved data. This definition will no longer appear in the active catalog.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep definition</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => void archiveDefinition()}>Archive definition</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : <span />}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => changeOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="equipment-template-form" disabled={researching || saving || (definitionKind === "equipment" && !name.trim())}>
              {template ? <SaveIcon data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
              {saving ? "Saving..." : template ? "Save definition" : "Create definition"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function positiveNumberOrUndefined(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}
