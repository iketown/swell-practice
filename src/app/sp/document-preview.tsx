"use client";

import { useRef, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type DocumentPreviewProps = {
  href: string;
  title: string;
  pages: number;
  detail?: string;
  featured?: boolean;
};

function printPdf(frame: HTMLIFrameElement | null, href: string) {
  const pdfWindow = frame?.contentWindow;
  if (!pdfWindow) return;
  try {
    pdfWindow.focus();
    pdfWindow.print();
  } catch {
    // Some browser PDF viewers restrict programmatic printing in a frame.
    window.open(href, "_blank", "noopener");
  }
}

export function DocumentPreview({
  href,
  title,
  pages,
  detail,
  featured,
}: DocumentPreviewProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const printFrame = useRef<HTMLIFrameElement>(null);
  const [preview, setPreview] = useState<"loading" | "ready" | "unavailable">("loading");
  const [directPrint, setDirectPrint] = useState<"idle" | "loading" | "ready">("idle");
  const pageInfo = `${pages} ${pages === 1 ? "page" : "pages"} · PDF`;

  function printFromList() {
    if (navigator.pdfViewerEnabled === false) {
      window.open(href, "_blank", "noopener");
    } else if (directPrint === "ready") {
      printPdf(printFrame.current, href);
    } else {
      setDirectPrint("loading");
    }
  }

  return (
    <div className={cn("sp-document", featured && "sp-packet")}>
      <Dialog onOpenChange={(open) => {
        setPreview(open && navigator.pdfViewerEnabled === false ? "unavailable" : "loading");
      }}>
        <DialogTrigger className="sp-document-trigger">
          <strong>{title}</strong>
          <small>{detail ? `${detail} · ` : ""}{pageInfo}</small>
        </DialogTrigger>
        <DialogContent className="h-[calc(100dvh-1.5rem)] max-h-260 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-[min(70rem,calc(100%-2rem))]">
          <DialogHeader className="gap-3 px-4 py-3 pr-12 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:pr-12">
            <div className="min-w-0">
              <DialogTitle className="text-lg leading-tight">{title}</DialogTitle>
              <DialogDescription className="mt-1">{pageInfo}</DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="outline" nativeButton={false} render={<a href={href} download />}>
                <Download data-icon="inline-start" aria-hidden="true" />
                Download
              </Button>
              <Button size="sm" onClick={() => printPdf(frame.current, href)} disabled={preview !== "ready"}>
                <Printer data-icon="inline-start" aria-hidden="true" />
                Print
              </Button>
            </div>
          </DialogHeader>
          <div className="relative min-h-0 border-t bg-muted">
            {preview === "unavailable" ? (
              <Alert className="m-4 w-auto">
                <AlertTitle>PDF preview unavailable</AlertTitle>
                <AlertDescription>Download the PDF to view or print it on this device.</AlertDescription>
              </Alert>
            ) : (
              <>
                {preview === "loading" && (
                  <div className="pointer-events-none absolute inset-0 p-4" role="status">
                    <span className="sr-only">Loading PDF</span>
                    <Skeleton className="mx-auto h-full w-full max-w-2xl bg-background" />
                  </div>
                )}
                <iframe
                  ref={frame}
                  title={`${title} PDF preview`}
                  src={`${href}#toolbar=0&view=FitH`}
                  onLoad={() => setPreview("ready")}
                  className="block size-full"
                />
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <div className="sp-document-actions" role="group" aria-label={`${title} actions`}>
        <Button
          size="icon"
          variant="ghost"
          className="size-11"
          nativeButton={false}
          render={<a href={href} download />}
          title="Download PDF"
          aria-label={`Download ${title}`}
        >
          <Download aria-hidden="true" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-11"
          onClick={printFromList}
          disabled={directPrint === "loading"}
          title="Print PDF"
          aria-label={`Print ${title}`}
        >
          <Printer aria-hidden="true" />
        </Button>
      </div>
      {directPrint !== "idle" && (
        <iframe
          ref={printFrame}
          src={`${href}#toolbar=0`}
          title={`Print ${title} PDF`}
          aria-hidden="true"
          tabIndex={-1}
          className="pointer-events-none fixed bottom-0 right-0 size-px opacity-0"
          onLoad={({ currentTarget }) => {
            setDirectPrint("ready");
            printPdf(currentTarget, href);
          }}
        />
      )}
    </div>
  );
}
