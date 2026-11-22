import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { checkHref, releaseCode, packetFromQuery, resolveProductionEdition } from "@/lib/rider/releases";
import { productionDownloads } from "@/lib/rider/production-documents";
import { publicReleaseList } from "@/lib/server/stage-rider";
import { DocumentPreview } from "./document-preview";
import { VersionCheck } from "./version-check";
import "./documents.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Production documents | The Swell", robots: { index: false } };

export default async function ProductionDocuments({ searchParams }: {
  searchParams: Promise<{ ver?: string; draft?: string; legacy?: string; packet?: string }>;
}) {
  const { ver, draft, legacy, packet } = await searchParams;
  const homeHref = (await headers()).get("host") === "docs.theswell.live" ? "https://www.theswell.live/" : "/";
  const value = typeof ver === "string" ? ver : "";
  const parsed = releaseCode.safeParse(value);
  const { copy, target, standard } = resolveProductionEdition(await publicReleaseList(), parsed.data);
  const edition = target ?? standard;
  const files = edition && productionDownloads(edition);
  const recipient = packetFromQuery(packet);
  const printHref = edition && checkHref(edition.code, recipient, "/sp/rider");
  const featured = files?.packet
    ? { ...files.packet, title: "Complete production packet", detail: "Technical rider and rack channel guide" }
    : files?.featured;
  const individual = files?.featured ? files.documents.slice(1) : files?.documents;
  const updatedDownload = recipient === "Full rider" ? featured : undefined;
  const title = target
    ? copy?.replacement ? "This version has been replaced." : "Thank you for checking! You have the correct version."
    : draft ? "This copy is a working draft." : ver !== undefined || legacy ? "We couldn’t verify this version." : "Check your printed version";
  const detail = target
    ? copy?.replacement ? `${target.code} replaces ${copy.code} for ${target.name}.` : `${target.name} · Version ${target.code}`
    : draft || legacy || ver !== undefined
      ? "Check the version on your cover or confirm your setup with The Swell before using this copy."
      : "Enter the version printed on your cover, or browse the documents below.";
  return (
    <main className="sp-library">
      <div className="sp-wrap">
        <header className="sp-header">
          <Link href={homeHref} aria-label="The Swell home">
            <Image src="/01-swell-logo.svg" alt="The Swell" width={800} height={346} priority />
          </Link>
          <VersionCheck key={JSON.stringify([ver, draft, legacy, packet])} title={title} detail={detail} code={value} prompt={!target}
            autoOpen={ver !== undefined}
            approvedCode={copy?.replacement ? undefined : target?.code}
            packet={recipient !== "Full rider" ? packet : undefined}
            update={copy?.replacement && printHref ? {
              href: updatedDownload?.href ?? printHref,
              pdf: !!updatedDownload,
              label: files?.featured && updatedDownload ? "Download updated technical rider"
                : updatedDownload ? "Download updated packet" : "Open updated rider to print",
            } : undefined} />
        </header>
        <h1>Production documents</h1>
        {edition && printHref ? (
          <section aria-labelledby="edition-name">
            <header className="sp-edition"><h2 id="edition-name">{edition.name}</h2><span>Version {edition.code}</span></header>
            {featured && individual ? (
              <>
                <DocumentPreview {...featured} featured />
                <h3>{files?.packet ? "Individual documents" : "Companion documents"}</h3>
                <ul className="sp-docs">
                  {individual.map(document =>
                    <li key={document.href}><DocumentPreview {...document} /></li>
                  )}
                </ul>
                {recipient !== "Full rider" && <a className="sp-print" href={printHref}>Open {recipient.toLowerCase()} print view</a>}
              </>
            ) : <a className="sp-print" href={printHref}>Open the issued rider to print or save as PDF</a>}
          </section>
        ) : <p>Contact The Swell for the production documents for your show.</p>}
      </div>
    </main>
  );
}
