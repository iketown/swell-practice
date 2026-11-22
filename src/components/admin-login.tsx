"use client";

import { UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AdminSignInDialog } from "@/components/admin-sign-in-dialog";
import { useAdmin } from "@/hooks/use-admin";

type AdminLoginProps = {
  active: boolean;
  className: string;
  iconOnly?: boolean;
};

export function AdminLogin({ active, className, iconOnly = false }: AdminLoginProps) {
  const admin = useAdmin();
  const [open, setOpen] = useState(false);

  const hasAdminSession = iconOnly ? admin.isSignedInAdmin : admin.isAdmin || Boolean(admin.user);

  if (hasAdminSession) {
    return (
      <Link aria-current={active ? "page" : undefined} aria-label={iconOnly ? "Admin" : undefined} className={className} href="/admin">
        {iconOnly ? <UserRoundIcon aria-hidden="true" /> : "Admin"}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label={iconOnly ? "Admin sign in" : undefined}
        className={className}
        disabled={admin.loading}
        onClick={() => setOpen(true)}
      >
        {iconOnly ? <UserRoundIcon aria-hidden="true" /> : admin.loading ? "Admin" : "Sign in"}
      </button>
      <AdminSignInDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
