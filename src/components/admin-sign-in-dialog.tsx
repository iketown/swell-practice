"use client";

import { LogInIcon } from "lucide-react";
import { FormEvent, useId, useState } from "react";

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

export function AdminSignInDialog({
  open,
  onOpenChange,
  title = "Admin sign in",
  description = "Use one of the Firebase email/password admin accounts.",
  onSignedIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  onSignedIn?: () => void;
}) {
  const admin = useAdmin();
  const formId = useId();
  const emailId = `${formId}-email`;
  const passwordId = `${formId}-password`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen) {
      setPassword("");
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await admin.signIn(email, password);
      setPassword("");
      changeOpen(false);
      onSignedIn?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={emailId}>Email</FieldLabel>
              <Input
                id={emailId}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={passwordId}>Password</FieldLabel>
              <Input
                id={passwordId}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(error)}
                required
              />
              <FieldDescription>
                {error ?? "Gear locations can only be updated by an approved account."}
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
  );
}
