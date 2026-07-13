"use client";

import Link from "next/link";
import { ArrowRightIcon, UserRoundIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { listMembers } from "@/lib/assignments";
import type { BandMember } from "@/lib/domain";

export function MemberIndexClient() {
  const [members, setMembers] = useState<BandMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMembers().then(setMembers).finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <section className="swell-panel flex flex-col gap-1 p-4 sm:p-5">
        <p className="swell-page-kicker">Practice library</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Members</h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">Choose your name, then choose the band you are playing with.</p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Whose parts?</CardTitle>
          <CardDescription>Each page combines normal assignments with the selected band&apos;s exceptions.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
          ) : members.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{member.displayName}</h2>
                    <p className="truncate text-sm text-muted-foreground">{member.firstName} {member.lastName}</p>
                  </div>
                  <Button render={<Link href={`/members/${member.slug}`} />} variant="secondary" size="sm" nativeButton={false}>
                    My parts
                    <ArrowRightIcon data-icon="inline-end" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><UserRoundIcon aria-hidden /></EmptyMedia>
                <EmptyTitle>No member pages yet</EmptyTitle>
                <EmptyDescription>An admin can add members from the admin area.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
