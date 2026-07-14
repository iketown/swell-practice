"use client";

import Link from "next/link";
import { LogInIcon } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAdmin } from "@/hooks/use-admin";

type AdminLoginProps = {
  active: boolean;
  className: string;
};

export function AdminLogin({ active, className }: AdminLoginProps) {
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

  const hasAdminSession = admin.isAdmin || Boolean(admin.user);

  if (hasAdminSession) {
    return (
      <Link aria-current={active ? "page" : undefined} className={className} href="/admin">
        Admin
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={admin.loading}
        onClick={() => setOpen(true)}
      >
        {admin.loading ? "Admin" : "Sign in"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
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
        </DialogContent>
      </Dialog>
    </>
  );
}
