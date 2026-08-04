"use client";

import { BoxIcon, CableIcon, GripVerticalIcon, PencilIcon, PlusIcon, SearchIcon } from "lucide-react";
import { type DragEvent, useMemo, useRef, useState } from "react";

import { EquipmentTemplateDialog } from "@/components/setup-designer/equipment-template-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import type { EquipmentTemplate } from "@/lib/setup-designer/domain";
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
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EquipmentTemplate | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const matching = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return templates.filter((template) => !normalized || [template.name, template.category, template.manufacturer, template.model].some((value) => value?.toLowerCase().includes(normalized)));
  }, [query, templates]);

  return (
    <aside className="setup-library-panel flex min-h-0 flex-col border bg-card">
      <div className="flex flex-col gap-3 border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Equipment</h2>
            <p className="text-xs text-muted-foreground">Click or drag to add. Use the pencil to edit.</p>
          </div>
          <Button size="icon-sm" variant="outline" onClick={() => setCreating(true)} aria-label="Create equipment">
            <PlusIcon />
          </Button>
        </div>
        <label className="relative">
          <SearchIcon aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mics, mixers, D.I.s..." className="pl-8" aria-label="Search equipment" />
        </label>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
        {matching.length ? matching.map((template) => {
          const inputs = portsByDirection(template.ports, "input").length;
          const outputs = portsByDirection(template.ports, "output").length;
          const portSummary = summarizePortGroups(template.ports)
            .map(portGroupDisplayName)
            .join(" · ");
          const TemplateIcon = template.equipmentKind === "device" ? BoxIcon : CableIcon;
          const topologySummary = template.transport
            ? `${template.transport.channelCount}-channel ${template.transport.kind === "split-snake" ? "split snake" : "snake"}${template.transport.length ? ` · ${template.transport.length} ${template.transport.lengthUnit}` : ""}`
            : undefined;
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
                  <span className="block truncate text-xs text-muted-foreground">{template.manufacturer} {template.model}</span>
                  <span className="block truncate text-[10px] text-muted-foreground" title={topologySummary ?? portSummary}>{(topologySummary ?? portSummary) || "No ports configured"}</span>
                </span>
                <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">{template.transport ? `${template.transport.channelCount}ch` : `${inputs}→${outputs}`}</Badge>
              </button>
              <Button type="button" size="icon-sm" variant="ghost" className="mr-1 shrink-0" onClick={() => setEditing(template)} aria-label={`Edit ${template.name}`} title={`Edit ${template.name}`}>
                <PencilIcon />
              </Button>
            </div>
          );
        }) : (
          <Empty className="border-0 py-10">
            <EmptyHeader><EmptyTitle>No matching equipment</EmptyTitle><EmptyDescription>Try a category or create a reusable node.</EmptyDescription></EmptyHeader>
          </Empty>
        )}
      </div>
      <EquipmentTemplateDialog open={creating} onOpenChange={setCreating} onCreated={onTemplateCreated} />
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
