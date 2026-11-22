"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

type Props = {
  title: string;
  detail: string;
  code: string;
  prompt: boolean;
  autoOpen: boolean;
  approvedCode?: string;
  packet?: string;
  update?: { href: string; pdf: boolean; label: string };
};

const checkedVersionsKey = "checked_versions";

function readCheckedVersions(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(checkedVersionsKey) ?? "[]");
    return Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function VersionCheck({ title, detail, code, prompt, autoOpen, approvedCode, packet, update }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const modal = dialog.current;
    if (!autoOpen || !modal || modal.open) return;
    const checkedVersions = approvedCode ? readCheckedVersions() : [];
    if (approvedCode && checkedVersions.includes(approvedCode)) return;

    modal.showModal();
    if (approvedCode) {
      try {
        localStorage.setItem(checkedVersionsKey, JSON.stringify([...checkedVersions, approvedCode]));
      } catch {
        // The dialog and document library still work when storage is unavailable.
      }
    }
  }, [approvedCode, autoOpen]);
  return (
    <>
      <button className="sp-check-button" ref={opener} onClick={() => dialog.current?.showModal()}>
        Check a printed version
      </button>
      <dialog ref={dialog} className="sp-dialog" aria-labelledby="check-title" aria-describedby="check-detail"
        onClose={() => opener.current?.focus({ preventScroll: true })}>
        <button className="sp-close" type="button" aria-label="Close version check" onClick={() => dialog.current?.close()}>
          <X size={19} aria-hidden="true" />
        </button>
        <h2 id="check-title">{title}</h2>
        <p id="check-detail">{detail}</p>
        {prompt ? (
          <form action="/sp" method="get">
            <label htmlFor="printed-version">Version on your cover</label>
            <input id="printed-version" name="ver" defaultValue={code} placeholder="e.g. 11.21.26" required maxLength={64} autoCapitalize="none" spellCheck={false} />
            {packet && <input type="hidden" name="packet" value={packet} />}
            <button className="sp-primary" type="submit">Check version</button>
          </form>
        ) : update && (
          <a className="sp-primary" href={update.href} download={update.pdf || undefined}>
            {update.label}
          </a>
        )}
        <button className={prompt || update ? "sp-secondary" : "sp-primary"} type="button" onClick={() => dialog.current?.close()}>
          {approvedCode ? "Go to Documents" : "Browse documents"}
        </button>
      </dialog>
    </>
  );
}
