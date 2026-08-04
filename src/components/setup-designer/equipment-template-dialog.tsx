"use client";

import { ArchiveIcon, BotIcon, ExternalLinkIcon, ImagePlusIcon, LoaderCircleIcon, PlusIcon, SaveIcon, SparklesIcon } from "lucide-react";
import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";

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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { auth } from "@/lib/firebase";
import type { EquipmentKind, EquipmentPort, EquipmentTemplate, EquipmentTransportTopology, ImportedEquipmentDraft } from "@/lib/setup-designer/domain";
import { createPort } from "@/lib/setup-designer/ports";
import { archiveEquipmentTemplate, createEquipmentTemplate, updateEquipmentTemplate } from "@/lib/setup-designer/repository";
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
  onCreated?: (template: EquipmentTemplate) => void;
  onSaved?: (template: EquipmentTemplate) => void;
  onArchived?: (template: EquipmentTemplate) => void;
}

export function EquipmentTemplateDialog({ open, onOpenChange, template, onCreated, onSaved, onArchived }: EquipmentTemplateDialogProps) {
  const [name, setName] = useState(template?.name ?? "");
  const [manufacturer, setManufacturer] = useState(template?.manufacturer ?? "");
  const [model, setModel] = useState(template?.model ?? "");
  const [category, setCategory] = useState(template?.category ?? "Other");
  const [equipmentKind, setEquipmentKind] = useState<EquipmentKind>(template?.equipmentKind ?? "device");
  const [transport, setTransport] = useState<EquipmentTransportTopology | undefined>(() => template?.transport ? structuredClone(template.transport) : undefined);
  const [description, setDescription] = useState(template?.description ?? "");
  const [notes, setNotes] = useState(template?.notes ?? "");
  const [productUrl, setProductUrl] = useState(template?.purchaseSource?.url ?? "");
  const [priceAmount, setPriceAmount] = useState(template?.purchaseSource?.priceAmount?.toString() ?? "");
  const [priceCurrency, setPriceCurrency] = useState(template?.purchaseSource?.priceCurrency ?? "");
  const [priceDisplay, setPriceDisplay] = useState(template?.purchaseSource?.priceDisplay ?? "");
  const [priceVendor, setPriceVendor] = useState(template?.purchaseSource?.vendor ?? "");
  const [ports, setPorts] = useState<EquipmentPort[]>(() => template ? structuredClone(template.ports) : initialPorts());
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
    setName(template?.name ?? "");
    setManufacturer(template?.manufacturer ?? "");
    setModel(template?.model ?? "");
    setCategory(template?.category ?? "Other");
    setEquipmentKind(template?.equipmentKind ?? "device");
    setTransport(template?.transport ? structuredClone(template.transport) : undefined);
    setDescription(template?.description ?? "");
    setNotes(template?.notes ?? "");
    setProductUrl(template?.purchaseSource?.url ?? "");
    setPriceAmount(template?.purchaseSource?.priceAmount?.toString() ?? "");
    setPriceCurrency(template?.purchaseSource?.priceCurrency ?? "");
    setPriceDisplay(template?.purchaseSource?.priceDisplay ?? "");
    setPriceVendor(template?.purchaseSource?.vendor ?? "");
    setPorts(template ? structuredClone(template.ports) : initialPorts());
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
      const token = auth?.currentUser ? await auth.currentUser.getIdToken() : "";
      const demoMode = new URLSearchParams(window.location.search).get("demo") === "1";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      else if (demoMode) headers["X-Swell-Demo"] = "1";

      const response = await fetch("/api/equipment/research", {
        body: JSON.stringify({ url: productUrl.trim() }),
        headers,
        method: "POST",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "The product page could not be researched.";
        throw new Error(message);
      }
      if (!payload || typeof payload !== "object" || !("ports" in payload) || !Array.isArray(payload.ports)) {
        throw new Error("The product research response was not usable.");
      }

      const result = payload as ImportedEquipmentDraft;
      setResearchResult(result);
      setName(result.name);
      setManufacturer(result.manufacturer ?? "");
      setModel(result.model ?? "");
      setCategory(result.category || "Other");
      setEquipmentKind(result.equipmentKind ?? "device");
      setTransport(result.transport ? structuredClone(result.transport) : undefined);
      setDescription(result.description ?? "");
      setProductUrl(result.purchaseSource.url);
      setPriceAmount(result.purchaseSource.priceAmount?.toString() ?? "");
      setPriceCurrency(result.purchaseSource.priceCurrency ?? "");
      setPriceDisplay(result.purchaseSource.priceDisplay ?? "");
      setPriceVendor(result.purchaseSource.vendor ?? "");
      setPorts(structuredClone(result.ports));
      setSelectedReferenceUrls(new Set(result.referenceImages.map((image) => image.url)));
    } catch (caught) {
      setResearchError(caught instanceof Error ? caught.message : "The product page could not be researched.");
    } finally {
      setResearching(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    setProgress(0);
    try {
      const savedTransport = equipmentKind === "device" ? undefined : transport ?? defaultTransportTopology(equipmentKind);
      const definition = {
        name: name.trim(),
        manufacturer: manufacturer.trim() || undefined,
        model: model.trim() || undefined,
        category: category.trim() || "Other",
        equipmentKind,
        ...(savedTransport ? { transport: structuredClone(savedTransport) } : {}),
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
        purchaseSource: productUrl.trim() ? {
          url: productUrl.trim(),
          vendor: priceVendor.trim() || undefined,
          priceAmount: priceAmount.trim() && Number.isFinite(Number(priceAmount)) && Number(priceAmount) >= 0 ? Number(priceAmount) : undefined,
          priceCurrency: priceCurrency.trim().toUpperCase() || undefined,
          priceDisplay: priceDisplay.trim() || undefined,
          observedAt: researchResult?.purchaseSource.observedAt ?? Date.now(),
        } : undefined,
        referenceImages: referenceImages.filter((image) => selectedReferenceUrls.has(image.url)),
        aiImport: researchResult?.aiImport ?? template?.aiImport,
        ports: structuredClone(ports),
        showPortNumbers: template?.showPortNumbers ?? true,
        showPortLabels: template?.showPortLabels ?? true,
        ownedUnits: template?.ownedUnits ?? [],
      };
      const saved = template
        ? await updateEquipmentTemplate({
            ...structuredClone(template),
            ...definition,
            detailImages: template.detailImages ?? [],
          }, imageFile, setProgress)
        : await createEquipmentTemplate(definition, imageFile, setProgress);
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
      setError(caught instanceof Error ? caught.message : "Could not remove this definition from the equipment rack.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{template ? `Edit ${template.name}` : "New equipment"}</DialogTitle>
          <DialogDescription>{template ? "Update this reusable definition manually or paste a product URL and let AI replace its product data and physical port map." : "Create a reusable gear definition with product data, exact ports, reference photos, and a diagram icon. Physical and planned assets are created separately."}</DialogDescription>
        </DialogHeader>
        <form id="equipment-template-form" onSubmit={submit} className="flex flex-col gap-5" aria-busy={researching}>
          <FieldGroup className="rounded-lg border bg-muted/30 p-3">
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
          </FieldGroup>

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

          <Field>
            <FieldLabel htmlFor="equipment-description">Gear description</FieldLabel>
            <Textarea id="equipment-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A concise description of what this equipment does and where it fits in a setup." rows={4} />
            <FieldDescription>Reusable catalog information. Setup-specific instructions belong in notes.</FieldDescription>
          </Field>

          {productUrl.trim() ? (
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

          {referenceImages.length ? (
            <FieldGroup className="rounded-lg border p-3">
              <Field>
                <FieldLabel>Reference product photos</FieldLabel>
                <FieldDescription>These are source-page references for the gear description. They are not the transparent stage-plot icon and they are not photos of a specific physical asset.</FieldDescription>
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

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="equipment-image">Stage-plot icon</FieldLabel>
              <label htmlFor="equipment-image" className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background px-3 py-4 text-center text-sm font-medium hover:bg-muted/50">
                <ImagePlusIcon aria-hidden className="size-5" />
                {imageFile ? imageFile.name : "Choose JPEG, PNG, or WebP"}
                <input id="equipment-image" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event.target.files?.[0])} />
              </label>
              <FieldDescription>One clean visual representation for diagrams, ideally a transparent PNG or WebP. Optional, up to 10 MB.</FieldDescription>
            </Field>
          </FieldGroup>

          <Field>
            <FieldLabel htmlFor="equipment-notes">Notes</FieldLabel>
            <Textarea id="equipment-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Active D.I.; phantom power supported." rows={3} />
          </Field>

          {saving && imageFile ? <Progress value={progress} aria-label={`Upload ${progress}% complete`} /> : null}
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
          {template ? (
            <AlertDialog>
              <AlertDialogTrigger render={<Button type="button" variant="ghost" disabled={saving || researching} />}>
                <ArchiveIcon data-icon="inline-start" />
                Remove from rack
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove {template.name} from the equipment rack?</AlertDialogTitle>
                  <AlertDialogDescription>Existing setup nodes and gear assets keep their saved data. This definition will no longer appear as something you can drag onto a setup.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep definition</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => void archiveDefinition()}>Remove from rack</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : <span />}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => changeOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="equipment-template-form" disabled={researching || saving || !name.trim()}>
              {template ? <SaveIcon data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
              {saving ? "Saving..." : template ? "Save definition" : "Create equipment"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
