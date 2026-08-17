"use client";

import { Link2Icon } from "lucide-react";
import { useMemo, useState } from "react";

import { GearConnectionsCanvas } from "@/components/gear/gear-connections-canvas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  connectionSetForAsset,
  connectorForReference,
  connectorReferenceKey,
  inventoryAssetConnectors,
  inventoryConnectorsMate,
  usedInternalConnectorKeys,
  type InventoryConnectorOption,
} from "@/lib/gear/connections";
import {
  createGearId,
  type InventoryAsset,
  type InventoryConnectionNodePosition,
  type InventoryConnectionSet,
  type InventoryConnectorReference,
} from "@/lib/gear/domain";
import type { EquipmentTemplate } from "@/lib/setup-designer/domain";

const NO_SIGNAL_ROLE = "__not_in_signal__";
const SIGNAL_ROLE_OPTIONS = [
  { label: "Not shown in SIGNAL", value: NO_SIGNAL_ROLE },
  { label: "Input in SIGNAL", value: "input" },
  { label: "Output in SIGNAL", value: "output" },
];

export function GearConnectionsField({
  asset,
  assets,
  definitions,
  connectionSets,
  value,
  onChange,
  disabled,
}: {
  asset: InventoryAsset;
  assets: InventoryAsset[];
  definitions: EquipmentTemplate[];
  connectionSets: InventoryConnectionSet[];
  value: InventoryConnectionSet | null;
  onChange: (value: InventoryConnectionSet | null) => void;
  disabled?: boolean;
}) {
  const assetsById = useMemo(() => new Map(assets.map((item) => [item.id, item])), [assets]);
  const definitionsById = useMemo(() => new Map(definitions.map((item) => [item.id, item])), [definitions]);
  const memberAssetIds = value?.memberAssetIds.length ? value.memberAssetIds : [asset.id];
  const memberAssets = memberAssetIds.flatMap((assetId) => {
    const member = assetsById.get(assetId);
    return member ? [member] : [];
  }).sort((left, right) => {
    if (left.id === asset.id) return -1;
    if (right.id === asset.id) return 1;
    return left.assetTag.localeCompare(right.assetTag);
  });
  const usedConnectorKeys = value ? usedInternalConnectorKeys(value) : new Set<string>();
  const exposedConnectors = memberAssets.flatMap((member) => inventoryAssetConnectors(member, definitionsById.get(member.definitionId)))
    .filter((connector) => !usedConnectorKeys.has(connectorReferenceKey(connectorReference(connector))));
  const availableItems = assets
    .filter((item) => !memberAssetIds.includes(item.id))
    .filter((item) => !connectionSetForAsset(item, connectionSets))
    .filter((item) => inventoryAssetConnectors(item, definitionsById.get(item.definitionId)).length)
    .sort((left, right) => left.assetTag.localeCompare(right.assetTag));
  const unavailableCount = assets.filter((item) => (
    item.id !== asset.id
    && !memberAssetIds.includes(item.id)
    && Boolean(connectionSetForAsset(item, connectionSets))
  )).length;
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const availableItemOptions = availableItems.map((item) => ({ label: `${item.assetTag} · ${item.label}`, value: item.id }));
  const inputCount = value?.signalConnectors.filter((item) => item.direction === "input").length ?? 0;
  const outputCount = value?.signalConnectors.filter((item) => item.direction === "output").length ?? 0;

  function addCanvasItem(nextAssetId: string | null) {
    const nextAsset = assetsById.get(nextAssetId ?? "");
    if (!nextAsset) return;
    const next = connectionDraft();
    next.memberAssetIds = [...new Set([...next.memberAssetIds, nextAsset.id])];
    next.updatedAt = asset.updatedAt;
    onChange(next);
    setConnectionError(null);
  }

  function connectItems(a: InventoryConnectorReference, b: InventoryConnectorReference) {
    const sourceConnector = connectorForReference(a, assetsById, definitionsById);
    const otherConnector = connectorForReference(b, assetsById, definitionsById);
    if (!sourceConnector || !otherConnector || a.assetId === b.assetId) return;
    if (usedConnectorKeys.has(connectorReferenceKey(a)) || usedConnectorKeys.has(connectorReferenceKey(b))) {
      setConnectionError("Each physical connector can only be joined once.");
      return;
    }
    if (!inventoryConnectorsMate(sourceConnector.connector, otherConnector.connector)) {
      setConnectionError(`${sourceConnector.connector.label} and ${otherConnector.connector.label} do not appear to mate.`);
      return;
    }
    const next = connectionDraft();
    next.memberAssetIds = [...new Set([...next.memberAssetIds, a.assetId, b.assetId])];
    next.links.push({ id: createGearId("connection-link"), a, b });
    const newlyInternal = new Set([connectorReferenceKey(a), connectorReferenceKey(b)]);
    next.signalConnectors = next.signalConnectors.filter((item) => !newlyInternal.has(connectorReferenceKey(item.endpoint)));
    next.updatedAt = asset.updatedAt;
    onChange(next);
    setConnectionError(null);
  }

  function disconnectLink(linkId: string) {
    if (!value) return;
    const next = structuredClone(value);
    next.links = next.links.filter((link) => link.id !== linkId);
    next.updatedAt = asset.updatedAt;
    onChange(next);
    setConnectionError(null);
  }

  function removeMember(memberAssetId: string) {
    if (!value || memberAssetId === asset.id) return;
    const next = structuredClone(value);
    next.memberAssetIds = next.memberAssetIds.filter((id) => id !== memberAssetId);
    next.links = next.links.filter((link) => link.a.assetId !== memberAssetId && link.b.assetId !== memberAssetId);
    next.signalConnectors = next.signalConnectors.filter((item) => item.endpoint.assetId !== memberAssetId);
    if (next.nodePositions) delete next.nodePositions[memberAssetId];
    next.updatedAt = asset.updatedAt;
    onChange(next.memberAssetIds.length === 1 && !next.links.length ? null : next);
    setConnectionError(null);
  }

  function moveMember(memberAssetId: string, position: InventoryConnectionNodePosition) {
    if (!memberAssetIds.includes(memberAssetId)) return;
    const next = connectionDraft();
    next.nodePositions = { ...next.nodePositions, [memberAssetId]: position };
    next.updatedAt = asset.updatedAt;
    onChange(next);
  }

  function connectionDraft(): InventoryConnectionSet {
    return value ? structuredClone(value) : {
      id: createGearId("connection-set"),
      memberAssetIds: [asset.id],
      links: [],
      signalConnectors: [],
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  function setSignalRole(reference: InventoryConnectorReference, role: string | null) {
    if (!value) return;
    const next = structuredClone(value);
    const key = connectorReferenceKey(reference);
    next.signalConnectors = next.signalConnectors.filter((item) => connectorReferenceKey(item.endpoint) !== key);
    if (role === "input" || role === "output") next.signalConnectors.push({ endpoint: reference, direction: role });
    next.updatedAt = asset.updatedAt;
    onChange(next);
  }

  return (
    <FieldSet className="rounded-lg border bg-muted/20 p-4">
      <FieldLegend>Keep connected to</FieldLegend>
      <FieldDescription>
        Add the items that stay attached. Drag node headers to arrange them, then drag from one connector dot to the connector it physically joins. Connected items travel and check in together.
      </FieldDescription>

      <div className="flex flex-col gap-3">
        <Field orientation="responsive" className="rounded-md border bg-background p-3">
          <div className="min-w-0">
            <FieldLabel htmlFor="gear-connected-item">Add item</FieldLabel>
            <FieldDescription>Choose by permanent ID or title, then connect its visible plugs below.</FieldDescription>
          </div>
          <Select items={availableItemOptions} value="" onValueChange={addCanvasItem} disabled={disabled || !availableItems.length}>
            <SelectTrigger id="gear-connected-item" className="w-full sm:w-72"><SelectValue placeholder="Choose item" /></SelectTrigger>
            <SelectContent><SelectGroup>
              {availableItemOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
        </Field>
        {!availableItems.length ? (
          <FieldDescription>
            No unconnected items with defined connectors are available.{unavailableCount ? ` ${unavailableCount} other item${unavailableCount === 1 ? " is" : "s are"} already kept connected elsewhere.` : ""}
          </FieldDescription>
        ) : null}
        <GearConnectionsCanvas
          key={memberAssets.map((member) => member.id).join(":")}
          currentAssetId={asset.id}
          memberAssets={memberAssets}
          definitionsById={definitionsById}
          value={value}
          onConnect={connectItems}
          onDisconnect={disconnectLink}
          onRemoveMember={removeMember}
          onMoveMember={moveMember}
          disabled={disabled}
        />
        <FieldDescription>
          Drag a node by its header to rearrange the canvas. Drag from either connector dot to a compatible dot on another item.
        </FieldDescription>
        {connectionError ? <p className="text-sm text-destructive" role="alert">{connectionError}</p> : null}
      </div>

      {value?.links.length ? (
        <FieldGroup className="gap-3">
          <div>
            <FieldLabel>Connectors shown in SIGNAL</FieldLabel>
            <FieldDescription>Choose the overall inputs and outputs people can connect to after these physical joins are made.</FieldDescription>
          </div>
          {exposedConnectors.map((connector) => {
            const reference = connectorReference(connector);
            const currentRole = value.signalConnectors.find((item) => connectorReferenceKey(item.endpoint) === connectorReferenceKey(reference))?.direction;
            const id = `gear-signal-connector-${connector.assetId}-${connector.id.replaceAll(":", "-")}`;
            return (
              <Field key={connectorReferenceKey(reference)} orientation="responsive" className="rounded-md border bg-background p-3">
                <div className="min-w-0">
                  <FieldLabel htmlFor={id}>{connector.assetTag} · {connector.label}</FieldLabel>
                  <FieldDescription>{connector.defaultDirection ? `Defined as an ${connector.defaultDirection}.` : "Free connector."}</FieldDescription>
                </div>
                <Select items={SIGNAL_ROLE_OPTIONS} value={currentRole ?? NO_SIGNAL_ROLE} onValueChange={(next) => setSignalRole(reference, next)} disabled={disabled}>
                  <SelectTrigger id={id} className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    {SIGNAL_ROLE_OPTIONS.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
            );
          })}
          {inputCount && outputCount ? (
            <Alert>
              <Link2Icon />
              <AlertTitle>Ready for SIGNAL</AlertTitle>
              <AlertDescription>{inputCount} input{inputCount === 1 ? "" : "s"} and {outputCount} output{outputCount === 1 ? "" : "s"} will appear whenever any connected item is added.</AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <Link2Icon />
              <AlertTitle>Finish the SIGNAL shape</AlertTitle>
              <AlertDescription>Choose at least one input and one output before this connected assembly can be added to SIGNAL.</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      ) : null}
    </FieldSet>
  );
}

function connectorReference(connector: InventoryConnectorOption): InventoryConnectorReference {
  return { assetId: connector.assetId, connectorId: connector.id };
}
