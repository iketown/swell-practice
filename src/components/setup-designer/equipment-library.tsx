"use client";

import { BoxIcon, CableIcon, GripVerticalIcon, PencilIcon, PlusIcon, SearchIcon } from "lucide-react";
import { type DragEvent, useMemo, useRef, useState } from "react";

import { EquipmentTemplateDialog } from "@/components/setup-designer/equipment-template-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isBreakoutCableDefinition } from "@/lib/setup-designer/breakout-cables";
import { formatCableDefinitionName, isCableDefinition } from "@/lib/setup-designer/cable-definitions";
import { powerDependencyLabel, type EquipmentTemplate } from "@/lib/setup-designer/domain";
import { portGroupDisplayName, portsByDirection, summarizePortGroups } from "@/lib/setup-designer/ports";

export const EQUIPMENT_TEMPLATE_DRAG_MIME = "application/x-swell-equipment-template";

export function EquipmentLibrary({
  templates,
  onTemplateCreated,
  onTemplateUpdated,
  onTemplateArchived,
  onAdd,
  onDragStateChange,
}: {
  templates: EquipmentTemplate[];
  onTemplateCreated: (template: EquipmentTemplate) => void;
  onTemplateUpdated: (template: EquipmentTemplate) => void;
  onTemplateArchived: (template: EquipmentTemplate) => void;
  onAdd: (template: EquipmentTemplate) => void;
  onDragStateChange: (template: EquipmentTemplate | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [libraryTab, setLibraryTab] = useState<"gear" | "cables">("gear");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EquipmentTemplate | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const matching = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return templates.filter((template) => {
      const cable = isCableDefinition(template);
      if ((libraryTab === "cables") !== cable) return false;
      const breakout = isBreakoutCableDefinition(template);
      const cableName = cable && template.cableEnds ? formatCableDefinitionName(template.cableEnds) : undefined;
      return !normalized || [template.name, template.category, template.manufacturer, template.model, cableName, ...(template.connectedInventory?.memberAssetTags ?? []), template.connectedInventory ? "connected gear adapter assembly" : breakout ? "breakout y cable" : cable ? "cable extension adapter" : undefined]
        .some((value) => value?.toLowerCase().includes(normalized));
    });
  }, [libraryTab, query, templates]);

  return (
    <aside className="setup-library-panel flex min-h-0 flex-col border bg-card">
      <div className="flex flex-col gap-3 border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Setup library</h2>
            <p className="text-xs text-muted-foreground">Click or drag an item onto the setup.</p>
          </div>
          <Button size="icon-sm" variant="outline" onClick={() => setCreating(true)} aria-label={libraryTab === "gear" ? "Create gear definition" : "Create cable definition"}>
            <PlusIcon />
          </Button>
        </div>
        <Tabs value={libraryTab} onValueChange={(value) => setLibraryTab(value as "gear" | "cables")}>
          <TabsList className="grid h-9 w-full grid-cols-2 p-0.5">
            <TabsTrigger value="gear" className="px-2 py-1 text-xs">Gear</TabsTrigger>
            <TabsTrigger value="cables" className="px-2 py-1 text-xs">Cables &amp; Breakouts</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="relative">
          <SearchIcon aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={libraryTab === "gear" ? "Mics, mixers, stage boxes..." : "XLR, TRS, adapters..."} className="pl-8" aria-label={libraryTab === "gear" ? "Search gear" : "Search cables and breakouts"} />
        </label>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
        {matching.length ? matching.map((template) => {
          const breakout = isBreakoutCableDefinition(template);
          const cable = isCableDefinition(template);
          const inputs = portsByDirection(template.ports, "input").length;
          const outputs = portsByDirection(template.ports, "output").length;
          const portSummary = summarizePortGroups(template.ports)
            .map(portGroupDisplayName)
            .join(" · ");
          const TemplateIcon = cable || template.equipmentKind !== "device" ? CableIcon : BoxIcon;
          const topologySummary = template.connectedInventory
            ? `${template.connectedInventory.inputLabels.length} input${template.connectedInventory.inputLabels.length === 1 ? "" : "s"} → ${template.connectedInventory.outputLabels.length} output${template.connectedInventory.outputLabels.length === 1 ? "" : "s"}`
            : cable && template.cableEnds
            ? `${formatCableDefinitionName(template.cableEnds)} · ${breakout ? "breakout" : "cable"}`
            : template.transport
            ? `${template.transport.channelCount}-channel ${template.transport.kind === "split-snake" ? "split snake" : "snake"}${template.transport.length ? ` · ${template.transport.length} ${template.transport.lengthUnit}` : ""}`
            : undefined;
          const powerLabel = powerDependencyLabel(template);
          const breakoutInputCount = breakout && template.cableEnds ? Math.max(template.cableEnds.end1.length, template.cableEnds.end2.length) : 0;
          const breakoutOutputCount = breakout && template.cableEnds ? Math.min(template.cableEnds.end1.length, template.cableEnds.end2.length) : 0;
          return (
            <div key={template.id} className="group flex items-center rounded-lg border border-transparent transition-[background-color,border-color] duration-150 hover:border-border hover:bg-muted/60 focus-within:border-border focus-within:bg-muted/60">
              <button
                type="button"
                draggable
                data-equipment-template-id={template.id}
                className="flex min-w-0 flex-1 cursor-grab items-center gap-2 rounded-lg px-1.5 py-2 text-left transition-[opacity,transform] duration-150 active:cursor-grabbing active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                title={`Click to add ${template.name}, or drag it onto the canvas`}
                onClick={() => {
                  if (suppressClickRef.current === template.id) return;
                  onAdd(template);
                }}
                onDragStart={(event) => startTemplateDrag(event, template, suppressClickRef, onDragStateChange)}
                onDragEnd={() => {
                  onDragStateChange(null);
                  window.setTimeout(() => {
                    if (suppressClickRef.current === template.id) suppressClickRef.current = null;
                  }, 0);
                }}
              >
                <GripVerticalIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-foreground" />
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground"><TemplateIcon aria-hidden className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{template.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{template.connectedInventory ? "Connected gear" : cable ? breakout ? "Breakout cable" : "Cable" : `${template.manufacturer ?? ""} ${template.model ?? ""}`}</span>
                  <span className="block truncate text-[10px] text-muted-foreground" title={[topologySummary ?? portSummary, powerLabel].filter(Boolean).join(" · ")}>{[(topologySummary ?? portSummary) || "No ports configured", powerLabel].filter(Boolean).join(" · ")}</span>
                </span>
                <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">{cable ? `${Math.max(breakoutInputCount, 1)}→${Math.max(breakoutOutputCount, 1)}` : template.transport ? `${template.transport.channelCount}ch` : `${inputs}→${outputs}`}</Badge>
              </button>
              {!template.connectedInventory ? (
                <Button type="button" size="icon-sm" variant="ghost" className="mr-1 shrink-0" onClick={() => setEditing(template)} aria-label={`Edit ${template.name}`} title={`Edit ${template.name}`}>
                  <PencilIcon />
                </Button>
              ) : null}
            </div>
          );
        }) : (
          <Empty className="border-0 py-10">
            <EmptyHeader><EmptyTitle>{libraryTab === "gear" ? "No matching gear" : "No matching cables"}</EmptyTitle><EmptyDescription>{libraryTab === "gear" ? "Try a category or create reusable gear." : "Create a cable definition in Gear, then place it here when its exact connectors matter."}</EmptyDescription></EmptyHeader>
          </Empty>
        )}
      </div>
      <EquipmentTemplateDialog key={libraryTab} open={creating} onOpenChange={setCreating} initialDefinitionKind={libraryTab === "cables" ? "cable" : "equipment"} onCreated={onTemplateCreated} />
      {editing ? (
        <EquipmentTemplateDialog
          key={editing.id}
          open
          onOpenChange={(nextOpen) => { if (!nextOpen) setEditing(null); }}
          template={editing}
          onSaved={(template) => { onTemplateUpdated(template); setEditing(null); }}
          onArchived={(template) => { onTemplateArchived(template); setEditing(null); }}
        />
      ) : null}
    </aside>
  );
}

function startTemplateDrag(
  event: DragEvent<HTMLButtonElement>,
  template: EquipmentTemplate,
  suppressClickRef: { current: string | null },
  onDragStateChange: (template: EquipmentTemplate | null) => void,
) {
  suppressClickRef.current = template.id;
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(EQUIPMENT_TEMPLATE_DRAG_MIME, template.id);
  event.dataTransfer.setData("text/plain", template.id);
  onDragStateChange(template);
}
