"use client";

import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";

import { adminEmails, auth, hasFirebaseConfig } from "@/lib/firebase";

export function useAdmin() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(auth));
  const emails = useMemo(() => adminEmails(), []);

  useEffect(() => {
    if (!auth) {
      return;
    }

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const email = user?.email?.toLowerCase() ?? "";
  const isAdmin = Boolean(user && emails.includes(email));
  const needsConfig = hasFirebaseConfig && emails.length === 0;

  return {
    user,
    loading,
    isAdmin,
    needsConfig,
    hasFirebaseConfig,
    signIn: (email: string, password: string) => {
      if (!auth) return Promise.reject(new Error("Firebase is not configured."));
      return signInWithEmailAndPassword(auth, email, password);
    },
    signOut: () => {
      if (!auth) return Promise.resolve();
      return signOut(auth);
    },
  };
}
