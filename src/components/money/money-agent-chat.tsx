"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Paperclip, Send, Upload, X } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { MemberAvatar } from "@/components/member-avatar";
import { listMembers } from "@/lib/assignments";
import { moneyRequest } from "@/lib/money/client";
import { PEOPLE, type Person } from "@/lib/money/domain";
import type { AgentMessage } from "@/lib/money/agent";
import type { AgentMessageRequest } from "@/lib/money/agent";

const MAX_CHAT_RECEIPT_BYTES = 4 * 1024 * 1024;
const chatDateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function founderPhoto(members: Awaited<ReturnType<typeof listMembers>>, person: Person) {
  const names = person === "ike" ? ["ike"] : ["cron", "chris"];
  return members.find((member) => names.some((name) =>
    [member.slug, member.firstName, member.lastName, member.displayName]
      .some((value) => value.trim().toLowerCase() === name)))?.photoUrl;
}

export function MoneyAgentChat({ onRecorded }: { onRecorded: () => Promise<void> }) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [founderPhotos, setFounderPhotos] = useState<Partial<Record<Person, string>>>({});
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const retry = useRef<AgentMessageRequest | null>(null);
  const history = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const { getRootProps, getInputProps, inputRef, isDragActive } = useDropzone({
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "application/pdf": [".pdf"],
    },
    disabled: sending,
    maxFiles: 1,
    maxSize: MAX_CHAT_RECEIPT_BYTES,
    multiple: false,
    onDropAccepted: ([receipt]) => {
      if (!receipt?.size) {
        setError("Choose a nonempty receipt.");
        return;
      }
      setFile(receipt);
      setError("");
      retry.current = null;
    },
    onDropRejected: (rejections) => {
      const codes = rejections.flatMap(({ errors }) => errors.map(({ code }) => code));
      setError(codes.includes("file-too-large")
        ? "Receipts must be smaller than 4 MB."
        : codes.includes("too-many-files")
          ? "Attach one receipt at a time."
          : "Choose a JPEG, PNG, WebP, or PDF receipt.");
    },
  });
  const refresh = useCallback(async () => {
    try {
      const result = await moneyRequest<{ messages: AgentMessage[] }>("/api/money/agent");
      setMessages((current) => JSON.stringify(current) === JSON.stringify(result.messages)
        ? current
        : result.messages);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refresh();
    }, 0);
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    let active = true;
    void listMembers().then((members) => {
      if (active) setFounderPhotos({ ike: founderPhoto(members, "ike"), chris: founderPhoto(members, "chris") });
    }).catch(() => {
      // The speaker name remains visible if the member photos cannot load.
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const container = history.current;
    if (container && followLatest.current) container.scrollTop = container.scrollHeight;
  }, [messages]);

  async function send(gearChoice?: NonNullable<AgentMessageRequest["gearChoice"]>) {
    if (!text.trim() && !file && !gearChoice) return;
    setSending(true);
    setError("");
    try {
      const request = retry.current && retry.current?.gearChoice?.draftId === gearChoice?.draftId &&
        retry.current?.gearChoice?.kind === gearChoice?.kind &&
        JSON.stringify(retry.current?.gearChoice?.assetIds || []) === JSON.stringify(gearChoice?.assetIds || [])
        ? retry.current : {
          id: crypto.randomUUID(),
          text: gearChoice ? gearChoice.kind === "new" ? "Create new gear for this purchase item" : `Use existing gear code ${gearChoice.assetIds.join(", ")}` : text.trim(),
          receiptIds: [],
          ...(gearChoice ? { gearChoice } : {}),
        };
      retry.current = request;
      if (file && !request.receiptIds.length) {
        if (!file.size || file.size > MAX_CHAT_RECEIPT_BYTES)
          throw new Error("Use a nonempty receipt smaller than 4 MB.");
        const form = new FormData();
        form.set("file", file);
        const receipt = await moneyRequest<{ id: string }>("/api/money/receipts", {
          method: "POST", body: form,
        });
        request.receiptIds = [receipt.id];
      }
      const response = await moneyRequest<AgentMessage>("/api/money/agent", {
        method: "POST", body: JSON.stringify(request),
      });
      retry.current = null;
      setText("");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await refresh();
      if (response.entryId || response.draftId) await onRecorded();
    } catch (cause) {
      setError((cause as Error).message);
      await refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <section id="money-agent" className="swell-panel overflow-hidden" aria-label="Talk to Ronnie-bot">
      <div className="flex items-center gap-3 border-b p-5 sm:p-6">
        <Image src="/ronnie-bot.png" alt="" width={48} height={48} className="size-12 rounded-full border border-border object-cover object-top" />
        <h2 className="text-lg font-semibold">Talk to Ronnie-bot</h2>
      </div>
      <div ref={history} className="max-h-[28rem] min-h-40 space-y-4 overflow-y-auto bg-muted/15 p-5 sm:p-6" aria-live="polite"
        onScroll={(event) => {
          const container = event.currentTarget;
          followLatest.current = container.scrollHeight - container.scrollTop - container.clientHeight < 48;
        }}>
        {loading ? <p className="text-sm text-muted-foreground">Loading conversation…</p> : null}
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`flex max-w-[min(85%,42rem)] flex-col gap-1 ${message.role === "user" ? "items-end" : "items-start"}`}>
              <div className={`relative max-w-full rounded-xl border px-4 py-3 text-sm ${message.role === "user" ? "border-primary/20 bg-primary/10" : "bg-card"}`}>
                <MemberAvatar
                  displayName={message.role === "assistant" ? "Ronnie" : message.person === "chris" ? "Cron" : message.person === "ike" ? "Ike" : "You"}
                  photoUrl={message.role === "assistant" ? "/ronnie-bot.png" : message.person ? founderPhotos[message.person] : undefined}
                  className={`absolute top-1/2 size-9 -translate-y-1/2 rounded-full border bg-card ${message.role === "assistant" ? "-right-11 border-zinc-950" : message.person === "chris" ? "-left-11 border-red-600" : message.person === "ike" ? "-left-11 border-blue-600" : "-left-11 border-muted-foreground"}`}
                />
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  {message.role === "user" ? (message.person ? PEOPLE[message.person] : "You") : "Ronnie"}
                </p>
                <p className="whitespace-pre-wrap break-words">{message.text}</p>
                {message.role === "user" && message.receiptIds.length ? (
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="size-3" /> Receipt attached</p>
                ) : null}
                {message.entryId ? (
                  <Link className="mt-2 inline-block font-medium text-primary underline underline-offset-4" href={`/money/${message.entryId}`}>
                    Open recorded transaction →
                  </Link>
                ) : null}
                {message.playbookRuleId ? (
                  <Link className="mt-2 inline-block font-medium text-primary underline underline-offset-4" href="/money?playbook=1">
                    Review Swell playbook →
                  </Link>
                ) : null}
                {message.draftId && !message.gearChoices ? (
                  <Link className="mt-2 inline-block font-medium text-primary underline underline-offset-4" href={`/money?draft=${message.draftId}`}>
                    Review draft →
                  </Link>
                ) : null}
                {message.gearProposal?.assets.map((asset) => (
                  <Link key={asset.id} className="ml-3 mt-2 inline-block font-medium text-primary underline underline-offset-4" href={`/g/${asset.code}`}>
                    View gear {asset.code} →
                  </Link>
                ))}
                {message.gearCodes?.map((code) => (
                  <Link key={code} className="ml-3 mt-2 inline-block font-medium text-primary underline underline-offset-4" href={`/g/${code}`}>
                    Open gear {code} →
                  </Link>
                ))}
                {message.gearChoices && message.draftId && message.id === messages.at(-1)?.id ? (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <p className="text-xs text-muted-foreground">{message.gearChoices.lines.length} receipt {message.gearChoices.lines.length === 1 ? "item" : "items"} ready for gear review</p>
                    <Link className="inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-medium text-primary hover:bg-muted/50" href={`/money?draft=${message.draftId}`}>
                      Review all receipt items →
                    </Link>
                  </div>
                ) : null}
              </div>
              <time dateTime={new Date(message.createdAt).toISOString()} className="px-1 text-xs text-muted-foreground">
                {chatDateTime.format(message.createdAt)}
              </time>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-3 border-t p-5 sm:p-6">
        <Field>
          <FieldLabel htmlFor="agent-message">Message</FieldLabel>
          <Textarea
            id="agent-message"
            placeholder="Message Ronnie…"
            value={text}
            onChange={(event) => { setText(event.target.value); retry.current = null; }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            disabled={sending}
            rows={3}
          />
        </Field>
        <div
          {...getRootProps({
            role: "button",
            "aria-label": "Attach receipt: drop a file here or click to browse",
            className: [
              "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-input bg-muted/15 px-4 py-3 text-center transition-colors hover:border-primary/60 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isDragActive ? "border-primary bg-primary/10" : "",
              sending ? "cursor-not-allowed opacity-60" : "",
            ].join(" "),
          })}
        >
          <input {...getInputProps()} />
          <Upload className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="max-w-full truncate text-sm font-medium">
            {isDragActive ? "Release to attach receipt" : file ? file.name : "Drop a receipt here or click to browse"}
          </span>
          <span className="text-xs text-muted-foreground">
            {file ? "Drop another file to replace it" : "JPEG, PNG, WebP, or PDF, up to 4 MB"}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {file ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => {
              setFile(null);
              if (inputRef.current) inputRef.current.value = "";
              retry.current = null;
            }} disabled={sending}>
              <X className="size-4" aria-hidden="true" />
              Remove receipt
            </Button>
          ) : <span />}
          <Button onClick={() => void send()} disabled={sending || (!text.trim() && !file)}>
            <Send className="size-4" aria-hidden="true" />
            {sending ? "Working…" : "Send"}
          </Button>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </div>
    </section>
  );
}
