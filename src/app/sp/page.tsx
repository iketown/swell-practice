import type { Metadata } from "next";
import Image from "next/image";
import { Download } from "lucide-react";
import { checkHref, releaseCode, packetFromQuery, resolveProductionEdition } from "@/lib/rider/releases";
import { productionDownloads } from "@/lib/rider/production-documents";
import { publicReleaseList } from "@/lib/server/stage-rider";
import { VersionCheck } from "./version-check";
import "./documents.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Production documents | The Swell", robots: { index: false } };

export default async function ProductionDocuments({ searchParams }: {
  searchParams: Promise<{ ver?: string; draft?: string; legacy?: string; packet?: string }>;
}) {
  const { ver, draft, legacy, packet } = await searchParams;
  const value = typeof ver === "string" ? ver : "";
  const parsed = releaseCode.safeParse(value);
  const { copy, target, standard } = resolveProductionEdition(await publicReleaseList(), parsed.data);
  const edition = target ?? standard;
  const files = edition && productionDownloads(edition);
  const recipient = packetFromQuery(packet);
  const printHref = edition && checkHref(edition.code, recipient, "/sp/rider");
  const updatedPdf = recipient === "Full rider" && files ? files.packet : undefined;
  const title = target
    ? copy?.replacement ? "Please print this updated version." : "Thank you for checking! You have the correct version."
    : draft ? "This copy is a working draft." : ver !== undefined || legacy ? "We couldn’t verify this version." : "Check your printed version";
  const detail = target
    ? copy?.replacement ? `Replace ${copy.code} with ${target.code} for ${target.name}.` : `${target.name} · Version ${target.code}`
    : draft || legacy || ver !== undefined
      ? "Check the version on your cover or confirm your setup with The Swell before using this copy."
      : "Enter the version printed on your cover, or browse the documents below.";
  return (
    <main className="sp-library">
      <div className="sp-wrap">
        <header className="sp-header">
          <Image src="/01-swell-logo.svg" alt="The Swell" width={128} height={56} priority />
          <VersionCheck key={JSON.stringify([ver, draft, legacy, packet])} title={title} detail={detail} code={value} prompt={!target}
            packet={recipient !== "Full rider" ? packet : undefined}
            update={copy?.replacement && printHref && target ? { href: updatedPdf ?? printHref, pdf: !!updatedPdf } : undefined} />
        </header>
        <h1>Production documents</h1>
        {edition && printHref ? (
          <section aria-labelledby="edition-name">
            <header className="sp-edition"><h2 id="edition-name">{edition.name}</h2><span>Version {edition.code}</span></header>
            {files ? (
              <>
                <a className="sp-packet" href={files.packet} download>
                  <span><strong>Complete production packet</strong><small>Technical rider and rack channel guide · {files.pages} pages · PDF</small></span>
                  <span className="sp-download"><Download size={19} aria-hidden="true" /> Download</span>
                </a>
                <h3>Individual documents</h3>
                <ul className="sp-docs">
                  {files.documents.map(({ title, href, pages }) =>
                    <li key={href}><a href={href} download><span>{title}</span><small>{pages} pages · PDF <Download size={17} aria-hidden="true" /></small></a></li>
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
