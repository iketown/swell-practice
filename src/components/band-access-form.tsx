"use client";

import Link from "next/link";
import { useActionState } from "react";

import { unlockBand } from "@/app/members/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function BandAccessForm() {
  const [error, action, pending] = useActionState(unlockBand, null);

  return (
    <main className="swell-shell grid min-h-[100dvh] place-items-center px-6 py-12">
      <Card className="mx-auto w-full max-w-sm">
        <CardHeader>
          <CardTitle><h1>Band access</h1></CardTitle>
          <CardDescription>Enter the band password to open the practice library.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-4">
            <FieldGroup>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="band-password">Password</FieldLabel>
                <Input
                  id="band-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "band-password-error" : undefined}
                  required
                />
                {error && <FieldError id="band-password-error">{error}</FieldError>}
              </Field>
            </FieldGroup>
            <div className="flex flex-wrap justify-end gap-2">
              <Link href="/" className={buttonVariants({ variant: "outline" })}>Cancel</Link>
              <Button type="submit" disabled={pending}>{pending ? "Opening…" : "Open band library"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
