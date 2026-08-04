"use client";

import Link from "next/link";
import { useState } from "react";

import { AdminSignInDialog } from "@/components/admin-sign-in-dialog";
import { useAdmin } from "@/hooks/use-admin";

type AdminLoginProps = {
  active: boolean;
  className: string;
};

export function AdminLogin({ active, className }: AdminLoginProps) {
  const admin = useAdmin();
  const [open, setOpen] = useState(false);

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
      <AdminSignInDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
