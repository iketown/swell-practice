"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CONNECTOR_TYPES, SIGNAL_TYPES, connectorSnapshot } from "@/lib/setup-designer/catalog";
import type { ConnectorGender, EquipmentPort, PortDirection } from "@/lib/setup-designer/domain";
import {
  appendPortBank,
  portsByDirection,
  removePort,
  summarizePortGroups,
  updatePort,
} from "@/lib/setup-designer/ports";

interface EquipmentPortEditorProps {
  ports: EquipmentPort[];
  onChange: (ports: EquipmentPort[]) => void;
  idPrefix: string;
}

export function EquipmentPortEditor({ ports, onChange, idPrefix }: EquipmentPortEditorProps) {
  const inputs = portsByDirection(ports, "input");
  const outputs = portsByDirection(ports, "output");

  return (
    <Tabs defaultValue="inputs">
      <TabsList>
        <TabsTrigger value="inputs">Inputs ({inputs.length})</TabsTrigger>
        <TabsTrigger value="outputs">Outputs ({outputs.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="inputs" className="flex flex-col gap-4">
        <PortDirectionEditor direction="input" ports={ports} onChange={onChange} idPrefix={`${idPrefix}-input`} />
      </TabsContent>
      <TabsContent value="outputs" className="flex flex-col gap-4">
        <PortDirectionEditor direction="output" ports={ports} onChange={onChange} idPrefix={`${idPrefix}-output`} />
      </TabsContent>
    </Tabs>
  );
}

function PortDirectionEditor({
  direction,
  ports,
  onChange,
  idPrefix,
}: {
  direction: PortDirection;
  ports: EquipmentPort[];
  onChange: (ports: EquipmentPort[]) => void;
  idPrefix: string;
}) {
  const directionPorts = portsByDirection(ports, direction);
  const summaries = useMemo(
    () => summarizePortGroups(directionPorts),
    [directionPorts],
  );
  const noun = direction === "input" ? "input" : "output";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{directionPorts.length} physical {noun}{directionPorts.length === 1 ? "" : "s"}</p>
            <p className="text-xs text-muted-foreground">Counts below are grouped by label, connector, gender, and signal.</p>
          </div>
          <Badge variant="outline">{summaries.length} {summaries.length === 1 ? "type" : "types"}</Badge>
        </div>
        {summaries.length ? (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {summaries.map((group) => {
              const signalLabel = SIGNAL_TYPES.find((signal) => signal.id === group.signalType)?.label ?? group.signalType;
              return (
                <li key={[group.label, group.connectorTypeId, group.gender, group.signalType, group.specification, group.channelCapacity].join("|")} className="rounded-md bg-background px-2.5 py-2 text-sm">
                  <span className="font-medium">{group.count}× {group.label}</span>
                  <span className="text-muted-foreground"> · {group.connectorLabel}{group.gender === "none" ? "" : ` ${group.gender}`}{signalLabel ? ` · ${signalLabel}` : ""}</span>
                  {group.channelCapacity || group.specification ? (
                    <span className="block text-xs text-muted-foreground">
                      {[group.channelCapacity ? `${group.channelCapacity} channels per port` : null, group.specification].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No {noun} ports yet.</p>}
      </div>

      <PortBankForm
        direction={direction}
        disabled={directionPorts.length >= 128}
        idPrefix={`${idPrefix}-bank`}
        onAdd={(count, defaults) => onChange(appendPortBank(ports, direction, count, defaults))}
      />

      {directionPorts.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <div className="grid min-w-[870px] grid-cols-[5.5rem_1.35fr_1.15fr_0.85fr_1fr_2.5rem] gap-2 bg-muted/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Port</span><span>Label</span><span>Connector</span><span>Gender</span><span>Signal</span><span className="sr-only">Actions</span>
          </div>
          <div className="divide-y">
            {directionPorts.map((port) => (
              <PortRow
                key={port.id}
                port={port}
                idPrefix={idPrefix}
                onChange={(nextPort) => onChange(updatePort(ports, nextPort))}
                onRemove={() => onChange(removePort(ports, port.id))}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PortBankForm({
  direction,
  disabled,
  idPrefix,
  onAdd,
}: {
  direction: PortDirection;
  disabled: boolean;
  idPrefix: string;
  onAdd: (count: number, defaults: {
    labelPrefix: string;
    connectorTypeId: string;
    connectorGender: ConnectorGender;
    signalType: string;
  }) => void;
}) {
  const [count, setCount] = useState(1);
  const [labelPrefix, setLabelPrefix] = useState(direction === "input" ? "Input" : "Output");
  const [connectorTypeId, setConnectorTypeId] = useState("xlr");
  const [connectorGender, setConnectorGender] = useState<ConnectorGender>(direction === "input" ? "female" : "male");
  const [signalType, setSignalType] = useState(direction === "input" ? "microphone" : "analog-line");
  const noun = direction === "input" ? "input" : "output";
  const connector = CONNECTOR_TYPES.find((item) => item.id === connectorTypeId);

  return (
    <FieldSet className="rounded-lg border p-3" disabled={disabled}>
      <FieldLegend variant="label">Add an {noun} bank</FieldLegend>
      <FieldDescription>Add one port or a numbered bank. Every physical connector receives its own stable ID.</FieldDescription>
      <FieldGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-count`}>Count</FieldLabel>
          <Input id={`${idPrefix}-count`} type="number" min={1} max={128} value={count} onChange={(event) => setCount(Number(event.target.value))} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-label`}>Label prefix</FieldLabel>
          <Input id={`${idPrefix}-label`} value={labelPrefix} onChange={(event) => setLabelPrefix(event.target.value)} placeholder={direction === "input" ? "Local input" : "XLR out"} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-connector`}>Connector</FieldLabel>
          <Select value={connectorTypeId} onValueChange={(value) => {
            if (!value) return;
            setConnectorTypeId(value);
            const nextConnector = CONNECTOR_TYPES.find((item) => item.id === value);
            if (nextConnector?.fixedGender) setConnectorGender(nextConnector.fixedGender);
            else if (nextConnector?.usesGender === false) setConnectorGender("none");
            else if (connectorGender === "none") setConnectorGender(direction === "input" ? "female" : "male");
          }}>
            <SelectTrigger id={`${idPrefix}-connector`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{CONNECTOR_TYPES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-gender`}>Gender</FieldLabel>
          <Select value={connector?.fixedGender ?? (connector?.usesGender === false ? "none" : connectorGender)} disabled={connector?.usesGender === false || Boolean(connector?.fixedGender)} onValueChange={(value) => value && setConnectorGender(value as ConnectorGender)}>
            <SelectTrigger id={`${idPrefix}-gender`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="none">Genderless</SelectItem>
            </SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-signal`}>Signal</FieldLabel>
          <Select value={signalType} onValueChange={(value) => value && setSignalType(value)}>
            <SelectTrigger id={`${idPrefix}-signal`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{SIGNAL_TYPES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={disabled || count < 1}
        onClick={() => onAdd(count, { labelPrefix, connectorTypeId, connectorGender, signalType })}
      >
        <PlusIcon data-icon="inline-start" />
        Add {count > 1 ? `${count} ${noun} ports` : `${noun} port`}
      </Button>
    </FieldSet>
  );
}

function PortRow({
  port,
  idPrefix,
  onChange,
  onRemove,
}: {
  port: EquipmentPort;
  idPrefix: string;
  onChange: (port: EquipmentPort) => void;
  onRemove: () => void;
}) {
  const rowId = `${idPrefix}-${port.id}`;
  const connector = CONNECTOR_TYPES.find((item) => item.id === port.connector.typeId);
  const shortId = port.id.length > 20 ? `${port.id.slice(0, 10)}…${port.id.slice(-6)}` : port.id;

  return (
    <div className="grid min-w-[870px] grid-cols-[5.5rem_1.35fr_1.15fr_0.85fr_1fr_2.5rem] items-center gap-2 px-3 py-2">
      <div className="min-w-0" title={port.id}>
        <span className="block text-sm font-medium">#{port.number}</span>
        <code className="block truncate text-[10px] text-muted-foreground">{shortId}</code>
      </div>
      <Field>
        <FieldLabel htmlFor={`${rowId}-label`} className="sr-only">{port.direction} {port.number} label</FieldLabel>
        <Input id={`${rowId}-label`} value={port.label ?? ""} onChange={(event) => onChange({ ...port, label: event.target.value })} placeholder={`${port.direction === "input" ? "Input" : "Output"} ${port.number}`} />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${rowId}-connector`} className="sr-only">{port.direction} {port.number} connector</FieldLabel>
        <Select value={port.connector.typeId} onValueChange={(value) => value && onChange({ ...port, connector: connectorSnapshot(value, port.connector.gender, port.connector.specification) })}>
          <SelectTrigger id={`${rowId}-connector`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>{CONNECTOR_TYPES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${rowId}-gender`} className="sr-only">{port.direction} {port.number} gender</FieldLabel>
        <Select value={port.connector.gender} disabled={connector?.usesGender === false || Boolean(connector?.fixedGender)} onValueChange={(value) => value && onChange({ ...port, connector: connectorSnapshot(port.connector.typeId, value as ConnectorGender, port.connector.specification) })}>
          <SelectTrigger id={`${rowId}-gender`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="female">Female</SelectItem>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectGroup></SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${rowId}-signal`} className="sr-only">{port.direction} {port.number} signal</FieldLabel>
        <Select value={port.signalType ?? "other"} onValueChange={(value) => value && onChange({ ...port, signalType: value })}>
          <SelectTrigger id={`${rowId}-signal`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>{SIGNAL_TYPES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${port.direction} ${port.number}`} title={`Remove ${port.direction} ${port.number}`} onClick={onRemove}>
        <Trash2Icon />
      </Button>
    </div>
  );
}
