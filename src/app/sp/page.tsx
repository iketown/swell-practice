import type { Metadata } from "next";
import Image from "next/image";
import { checkHref, releaseCode, packetFromQuery } from "@/lib/rider/releases";
import { publicReleaseList } from "@/lib/server/stage-rider";
import "../stage-plot/stage-plot.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Check your tech rider | The Swell",
  robots: { index: false },
};
type Query = Promise<{
  ver?: string;
  draft?: string;
  legacy?: string;
  packet?: string;
}>;

export default async function CheckRider({
  searchParams,
}: {
  searchParams: Query;
}) {
  const { ver, draft, legacy, packet } = await searchParams;
  const parsed = releaseCode.safeParse(ver);
  const rows = parsed.success ? await publicReleaseList() : [];
  const copy = rows.find((row) => row.code === parsed.data);
  const target = copy?.replacement
    ? rows.find((row) => row.code === copy.replacement)
    : copy;
  const title =
    copy && target
      ? copy.replacement
        ? "Please print this updated version."
        : "Thank you for checking! You have the correct version."
      : draft
        ? "This copy is a working draft."
        : ver !== undefined || legacy
          ? "We couldn’t verify this rider."
          : "Check your tech rider";
  return (
    <main className="rider">
      <section className="rider-check">
        <Image
          src="/swell-logo-horizontal-stripes.svg"
          width={155}
          height={70}
          alt="The Swell"
          priority
        />
        <h1>{title}</h1>
        {copy && target ? (
          <>
            <p>
              <strong>{copy.name}</strong> · Printed code {copy.code}
            </p>
            {copy.replacement && (
              <p>
                Use {target.name}, edition <strong>{target.code}</strong>, for
                this setup.
              </p>
            )}
            <a
              className="version-button"
              href={checkHref(
                target.code,
                packetFromQuery(packet),
                "/sp/rider",
              )}
            >
              {copy.replacement
                ? "Open updated rider to print"
                : "Open this rider"}
            </a>
          </>
        ) : (
          <>
            <p>
              {draft
                ? "Ask The Swell for the issued rider for your show."
                : "Enter the edition code from your cover. If your copy has no code or the code is unrecognized, confirm your setup with The Swell before using it."}
            </p>
            <form action="/sp">
              <label className="rider-field">
                Edition code
                <input name="ver" required maxLength={64} />
              </label>
              <button className="primary">Check version</button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
