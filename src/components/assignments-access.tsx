"use client";

import { useEffect, useState } from "react";

import { verifyAssignmentAccess } from "@/app/assignments/actions";
import { AdminSignInDialog } from "@/components/admin-sign-in-dialog";
import { AppShell } from "@/components/app-shell";
import { InstrumentAssignmentsClient } from "@/components/instrument-assignments-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/hooks/use-admin";

export function AssignmentsAccess() {
  const { user, loading, isSignedInAdmin } = useAdmin();
  const [verification, setVerification] = useState<{ user: NonNullable<typeof user>; allowed: boolean } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user || !isSignedInAdmin) return;
    let current = true;
    void user.getIdToken()
      .then(verifyAssignmentAccess)
      .then((allowed) => { if (current) setVerification({ user, allowed }); })
      .catch(() => { if (current) setVerification({ user, allowed: false }); });
    return () => { current = false; };
  }, [user, isSignedInAdmin]);

  if (isSignedInAdmin && verification?.user === user && verification.allowed) {
    return <InstrumentAssignmentsClient />;
  }

  if (loading || (isSignedInAdmin && verification?.user !== user)) {
    return <AppShell><Skeleton className="mx-auto h-40 w-full max-w-sm" /></AppShell>;
  }

  return (
    <AppShell>
      <Card className="mx-auto w-full max-w-sm">
        <CardHeader>
          <CardTitle><h1>Assignments</h1></CardTitle>
          <CardDescription>Sign in with an administrator account to view assignments.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={() => setOpen(true)}>Sign in</Button>
        </CardContent>
      </Card>
      <AdminSignInDialog open={open} onOpenChange={setOpen} />
    </AppShell>
  );
}
