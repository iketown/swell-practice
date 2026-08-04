"use client";

import { ArrowLeftIcon, PackageSearchIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { EquipmentTemplateDialog } from "@/components/setup-designer/equipment-template-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/hooks/use-admin";
import type { EquipmentTemplate } from "@/lib/setup-designer/domain";
import { portGroupDisplayName, summarizePortGroups } from "@/lib/setup-designer/ports";
import { listEquipmentTemplates } from "@/lib/setup-designer/repository";

export function EquipmentIndexClient() {
  const admin = useAdmin();
  const router = useRouter();
  const setupsHref = admin.isDemoAdmin ? "/setups?demo=1" : "/setups";
  const gearHref = admin.isDemoAdmin ? "/gear?demo=1" : "/gear";
  const [templates, setTemplates] = useState<EquipmentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!admin.loading && !admin.isAdmin) router.replace("/");
  }, [admin.isAdmin, admin.loading, router]);

  useEffect(() => {
    if (!admin.isAdmin) return;
    listEquipmentTemplates().then(setTemplates).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load equipment.")).finally(() => setLoading(false));
  }, [admin.isAdmin]);

  if (admin.loading || !admin.isAdmin) return null;

  return (
    <AppShell>
      <section className="swell-panel flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
        <div className="grid gap-1">
          <Link href={setupsHref} className={buttonVariants({ variant: "ghost", size: "sm", className: "mb-2 w-fit" })}><ArrowLeftIcon data-icon="inline-start" />Setups</Link>
          <p className="swell-page-kicker">Reusable definitions</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Equipment library</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">Definitions describe a model, its ports, icon, reference photos, and purchase source. Planned and physical copies of that model live in Gear.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={gearHref} className={buttonVariants({ variant: "outline" })}><PackageSearchIcon data-icon="inline-start" />Gear assets</Link>
          <Button onClick={() => setCreating(true)}><PlusIcon data-icon="inline-start" />New definition</Button>
        </div>
      </section>

      {loading ? <div className="flex flex-col gap-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div> : error ? (
        <Empty><EmptyHeader><EmptyTitle>Could not load equipment</EmptyTitle><EmptyDescription>{error}</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          {templates.map((template) => {
            const portGroups = summarizePortGroups(template.ports);
            return (
              <div key={template.id} className="flex flex-col gap-3 border-b p-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="font-semibold">{template.name}</p><p className="text-sm text-muted-foreground">{[template.manufacturer, template.model, template.category].filter(Boolean).join(" · ")}</p></div>
                <div className="flex flex-wrap gap-2">
                  {portGroups.map((group) => (
                    <Badge key={[group.direction, group.label, group.connectorTypeId, group.gender, group.signalType, group.specification, group.channelCapacity].join("|")} variant="secondary">
                      {portGroupDisplayName(group)} · {group.connectorLabel}{group.gender === "none" ? "" : ` ${group.gender}`}
                    </Badge>
                  ))}
                  {!portGroups.length ? <Badge variant="secondary">No ports</Badge> : null}
                  <Badge variant="outline">Definition</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EquipmentTemplateDialog open={creating} onOpenChange={setCreating} onCreated={(template) => setTemplates((current) => [...current, template].sort((left, right) => left.name.localeCompare(right.name)))} />
    </AppShell>
  );
}
