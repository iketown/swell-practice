"use client";
import { useState } from "react";
import type { User } from "firebase/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

export function BlenderConnection({ setupId, user, autoSave, onAutoSave }: { setupId: string; user: User | null; autoSave: boolean; onAutoSave: (value: boolean) => void }) {
  const [allowDefinitions, setAllowDefinitions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<{ sessionId: string; token: string; expiresAt: number } | null>(null);
  async function create() {
    if (!user) { toast.error("Sign in to connect Blender. Demo mode cannot connect."); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/setups/${setupId}/blender-sessions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ allowDefinitions }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Could not create connection.");
      setSession(result);
      toast.success("Connection ready. Copy it into Blender's Swell panel.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Connection failed."); }
    finally { setBusy(false); }
  }
  async function copy() {
    if (!session) return;
    try { await navigator.clipboard.writeText(JSON.stringify({ appUrl: window.location.origin, setupId, ...session })); toast.success("Copied. In Blender, use Paste connection."); }
    catch { toast.error("Clipboard unavailable. Allow clipboard access and try again."); }
  }
  async function revoke() {
    if (!user || !session) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/setups/${setupId}/blender-sessions`, { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ sessionId: session.sessionId }) });
      if (!response.ok) throw new Error("Could not revoke connection.");
      setSession(null); toast.success("Blender connection revoked.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not revoke connection."); }
    finally { setBusy(false); }
  }
  return <details className="rounded-lg border bg-card px-3 py-2">
    <summary className="cursor-pointer text-sm font-medium">Blender connection</summary>
    <div className="flex max-w-2xl flex-col gap-3 py-3">
      <p className="text-sm text-muted-foreground">In Blender, open the Swell sidebar. Paste a connection, then pull this setup. Connections expire after eight hours.</p>
      <FieldGroup>
        <Field orientation="horizontal"><FieldLabel htmlFor="blender-definitions">Allow gear-dimension corrections</FieldLabel><Switch id="blender-definitions" checked={allowDefinitions} onCheckedChange={setAllowDefinitions} disabled={Boolean(session) || busy} /></Field>
        <Field orientation="horizontal"><FieldLabel htmlFor="blender-autosave">Automatically save website edits</FieldLabel><Switch id="blender-autosave" checked={autoSave} onCheckedChange={onAutoSave} /></Field>
        <FieldDescription>Saved changes appear in Blender when pulled, or while Blender Auto Sync is on. Conflicts pause automatic saves for review.</FieldDescription>
      </FieldGroup>
      <div className="flex flex-wrap gap-2">
        {!session ? <Button size="sm" onClick={() => void create()} disabled={busy || !user}>{busy ? "Connecting…" : "Create connection"}</Button> : <>
          <Button size="sm" onClick={() => void copy()}>Copy connection</Button>
          <Button size="sm" variant="outline" onClick={() => void revoke()} disabled={busy}>Revoke connection</Button>
          <p role="status" className="self-center text-xs text-muted-foreground">Expires {new Date(session.expiresAt).toLocaleTimeString()}</p>
        </>}
      </div>
    </div>
  </details>;
}
