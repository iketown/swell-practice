"use client";

import { CableIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CABLE_CONNECTOR_TYPES, connectorSnapshot } from "@/lib/setup-designer/catalog";
import { cableEndImagePath } from "@/lib/setup-designer/cable-end-images";
import { MAX_CONNECTORS_PER_CABLE_END, formatCableDefinitionEnd } from "@/lib/setup-designer/cable-definitions";
import type { CableDefinitionEnds, ConnectorGender, ConnectorSnapshot } from "@/lib/setup-designer/domain";

export function CableEndEditor({ value, onChange, idPrefix }: {
  value: CableDefinitionEnds;
  onChange: (value: CableDefinitionEnds) => void;
  idPrefix: string;
}) {
  return (
    <FieldGroup className="grid gap-4 lg:grid-cols-2">
      <CableEndField
        title="End 1"
        connectors={value.end1}
        idPrefix={`${idPrefix}-end-1`}
        onChange={(end1) => onChange({ ...value, end1 })}
      />
      <CableEndField
        title="End 2"
        connectors={value.end2}
        idPrefix={`${idPrefix}-end-2`}
        onChange={(end2) => onChange({ ...value, end2 })}
      />
    </FieldGroup>
  );
}

function CableEndField({ title, connectors, idPrefix, onChange }: {
  title: string;
  connectors: ConnectorSnapshot[];
  idPrefix: string;
  onChange: (connectors: ConnectorSnapshot[]) => void;
}) {
  return (
    <FieldSet className="rounded-lg border p-3">
      <FieldLegend variant="label">{title}</FieldLegend>
      <FieldDescription>{formatCableDefinitionEnd(connectors)}</FieldDescription>
      <FieldGroup className="gap-3">
        {connectors.map((connector, index) => {
          const connectorType = CABLE_CONNECTOR_TYPES.find((item) => item.id === connector.typeId);
          const imagePath = cableEndImagePath(connector);
          const rowId = `${idPrefix}-${index + 1}`;
          return (
            <div key={rowId} className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-[minmax(0,1fr)_6rem] sm:items-start">
              <FieldGroup className="gap-3">
                <Field>
                  <FieldLabel htmlFor={`${rowId}-type`}>Connector {index + 1}</FieldLabel>
                  <Select value={connector.typeId} onValueChange={(typeId) => {
                    if (!typeId) return;
                    const nextType = CABLE_CONNECTOR_TYPES.find((item) => item.id === typeId);
                    const nextGender = nextType?.fixedGender
                      ?? (nextType?.usesGender === false ? "none" : connector.gender === "none" ? "male" : connector.gender);
                    onChange(replaceConnector(connectors, index, connectorSnapshot(typeId, nextGender, connector.specification)));
                  }}>
                    <SelectTrigger id={`${rowId}-type`} className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup>
                      {CABLE_CONNECTOR_TYPES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}
                    </SelectGroup></SelectContent>
                  </Select>
                </Field>
                <Field data-disabled={connectorType?.usesGender === false || Boolean(connectorType?.fixedGender)}>
                  <FieldLabel htmlFor={`${rowId}-gender`}>Gender</FieldLabel>
                  <Select
                    value={connectorType?.fixedGender ?? (connectorType?.usesGender === false ? "none" : connector.gender)}
                    disabled={connectorType?.usesGender === false || Boolean(connectorType?.fixedGender)}
                    onValueChange={(gender) => gender && onChange(replaceConnector(connectors, index, connectorSnapshot(connector.typeId, gender as ConnectorGender, connector.specification)))}
                  >
                    <SelectTrigger id={`${rowId}-gender`} className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup>
                      {connectorType?.usesGender === false ? (
                        <SelectItem value="none">Genderless</SelectItem>
                      ) : (
                        <>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="male">Male</SelectItem>
                        </>
                      )}
                    </SelectGroup></SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <div className="grid gap-2">
                <div className="relative aspect-square overflow-hidden rounded-lg border bg-white">
                  {imagePath ? (
                    <Image
                      src={imagePath}
                      alt={`${connector.label}${connector.gender === "none" ? "" : ` ${connector.gender}`} connector`}
                      fill
                      sizes="96px"
                      className="object-contain"
                    />
                  ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-2 p-2 text-center text-xs text-muted-foreground">
                      <CableIcon aria-hidden className="size-5" />
                      {connector.label}
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="justify-self-end"
                  aria-label={`Remove connector ${index + 1} from ${title}`}
                  title={`Remove connector ${index + 1}`}
                  disabled={connectors.length === 1}
                  onClick={() => onChange(connectors.filter((_, connectorIndex) => connectorIndex !== index))}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </div>
          );
        })}
      </FieldGroup>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={connectors.length >= MAX_CONNECTORS_PER_CABLE_END}
        onClick={() => onChange([...connectors, duplicateLastConnector(connectors)])}
      >
        <PlusIcon data-icon="inline-start" />
        Add connector to {title}
      </Button>
    </FieldSet>
  );
}

function replaceConnector(connectors: ConnectorSnapshot[], index: number, connector: ConnectorSnapshot) {
  return connectors.map((item, connectorIndex) => connectorIndex === index ? connector : item);
}

function duplicateLastConnector(connectors: ConnectorSnapshot[]) {
  const connector = connectors[connectors.length - 1] ?? connectorSnapshot("xlr", "male");
  return structuredClone(connector);
}
