"use client";

import Link from "next/link";
import { LogInIcon, LogOutIcon } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
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
import { useAdmin } from "@/hooks/use-admin";

export function AdminLogin() {
  const admin = useAdmin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await admin.signIn(email, password);
      setPassword("");
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed bottom-16 left-4 z-40 sm:left-5">
      <button
        type="button"
        className={buttonVariants({ variant: admin.isAdmin ? "default" : "outline", size: "sm", className: "bg-card shadow-sm" })}
        onClick={() => setOpen(true)}
      >
        admin
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {!admin.hasFirebaseConfig ? (
            <>
              <DialogHeader>
                <DialogTitle>Admin</DialogTitle>
                <DialogDescription>Firebase env vars are not configured yet. Read-only demo data is showing.</DialogDescription>
              </DialogHeader>
            </>
          ) : admin.loading ? (
            <DialogHeader>
              <DialogTitle>Admin</DialogTitle>
              <DialogDescription>Checking your session...</DialogDescription>
            </DialogHeader>
          ) : admin.user ? (
            <>
              <DialogHeader>
                <DialogTitle>Admin</DialogTitle>
                <DialogDescription>
                  Signed in as {admin.user.email}.{" "}
                  {admin.isAdmin ? "Admin access is enabled." : "This email is not in the admin allowlist."}
                </DialogDescription>
              </DialogHeader>
              {admin.needsConfig ? (
                <p className="text-sm text-muted-foreground">Add NEXT_PUBLIC_ADMIN_EMAILS to enable admin controls.</p>
              ) : null}
              <DialogFooter>
                {admin.isAdmin ? (
                  <Button render={<Link href="/admin" onClick={() => setOpen(false)} />} nativeButton={false}>
                    Open admin
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => void admin.signOut()}>
                  <LogOutIcon data-icon="inline-start" />
                  Sign out
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Admin sign in</DialogTitle>
                <DialogDescription>Use one of the Firebase email/password admin accounts.</DialogDescription>
              </DialogHeader>
              <form onSubmit={onSubmit} className="flex flex-col gap-3">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="admin-email">Email</FieldLabel>
                    <Input
                      id="admin-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </Field>
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor="admin-password">Password</FieldLabel>
                    <Input
                      id="admin-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      aria-invalid={Boolean(error)}
                      required
                    />
                    <FieldDescription>
                      {error ?? "Admin pages stay protected; public parts pages do not require sign-in."}
                    </FieldDescription>
                  </Field>
                </FieldGroup>
                <Button type="submit" disabled={submitting || !email.trim() || !password}>
                  <LogInIcon data-icon="inline-start" />
                  {submitting ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
