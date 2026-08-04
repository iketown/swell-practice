"use client";

import {
  ArrowDownIcon,
  ArrowRightIcon,
  BoxesIcon,
  CableIcon,
  CheckIcon,
  CircleDotIcon,
  GitBranchIcon,
  ImageIcon,
  MapIcon,
  MapPinIcon,
  PackageCheckIcon,
  PackageOpenIcon,
  RouteIcon,
  ScanLineIcon,
  ShoppingCartIcon,
  WarehouseIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const sectionIds = [
  "core",
  "views",
  "cables",
  "inventory",
  "procurement",
  "images",
  "research",
  "containers",
  "check-ins",
  "packing",
  "firestore",
  "build",
  "decisions",
] as const;

const buildPhases = [
  {
    phase: "Foundation",
    title: "Signal editor",
    status: "Working now",
    detail: "Setup library, reusable nodes, AI-assisted product research, configurable ports, animated cables, save and duplicate behavior, and a live parts list.",
  },
  {
    phase: "Phase 1",
    title: "Gear registry and purchasing",
    status: "Working now",
    detail: "Reusable definitions, permanent asset IDs, owners, locations, physical photos, purchase queues, grouped orders, payment and shipment details, and first check-in.",
  },
  {
    phase: "Phase 2",
    title: "Stage plot",
    status: "Next",
    detail: "Scaled stage dimensions, separate physical positions, groups, route waypoints, shared cable lanes, and measured cable lengths.",
  },
  {
    phase: "Phase 3",
    title: "Containers and history",
    status: "Planned",
    detail: "Container manifests, nested placement, mobile QR scanning, manual batch check-in, optional GPS, and append-only item history.",
  },
  {
    phase: "Phase 4",
    title: "Packing and advances",
    status: "Planned",
    detail: "Packing sessions, shortages, substitutes, shopping lists, member lists, backline advances, and printable exports.",
  },
  {
    phase: "Phase 5",
    title: "Operational hardening",
    status: "Later",
    detail: "Offline resilience, audit and correction tools, date conflicts, real-device testing, rules, performance, and backups.",
  },
] as const;

function DetailHeading({ index, title, note }: { index: string; title: string; note: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
        {index}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground sm:text-base">{title}</span>
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground sm:text-sm">{note}</span>
      </span>
    </span>
  );
}

function Definition({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <dt className="text-sm font-semibold text-foreground">{term}</dt>
      <dd className="mt-1 text-sm leading-6 text-muted-foreground">{children}</dd>
    </div>
  );
}

function Decision({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-md bg-muted/60 p-3">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <CheckIcon className="size-3" aria-hidden />
      </span>
      <span className="text-sm leading-6 text-muted-foreground">{children}</span>
    </li>
  );
}

export function SystemDocsPage() {
  const [openSections, setOpenSections] = useState<string[]>(["core", "inventory", "procurement", "build"]);

  return (
    <AppShell>
      <article className="flex flex-col gap-10 pb-8">
        <section className="swell-panel overflow-hidden">
          <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
            <div className="p-5 sm:p-7 lg:p-8">
              <p className="swell-page-kicker">System guide</p>
              <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
                One plan connects what goes on stage, how it plugs in, and who supplies it.
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                A setup is the shared source of truth. The stage plot explains where equipment goes, the signal diagram explains how it connects, and the gear tracker explains which real item or outside provider fulfills every requirement.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Badge variant="secondary">Product blueprint</Badge>
                <Badge variant="outline">Living documentation</Badge>
                <Badge variant="outline">Updated August 4, 2026</Badge>
              </div>
            </div>
            <aside className="border-t bg-secondary/45 p-5 sm:p-7 lg:border-t-0 lg:border-l lg:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">The sentence to remember</p>
              <p className="mt-3 text-lg font-semibold leading-7">
                The layout asks for things. Assignments say who supplies them. Check-ins say where the real things were last seen.
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Containers add one more layer: a bag knows what belongs inside it, and everything actually inside inherits the bag&apos;s effective location.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href="/setups" className={buttonVariants({ variant: "outline" })}>
                  <RouteIcon data-icon="inline-start" />
                  Open setups
                </Link>
                <Link href="/gear" className={buttonVariants({ variant: "outline" })}>
                  <BoxesIcon data-icon="inline-start" />
                  Open gear
                </Link>
              </div>
            </aside>
          </div>
        </section>

        <section aria-labelledby="connected-products-heading">
          <div className="max-w-3xl">
            <p className="swell-page-kicker">Three connected products</p>
            <h2 id="connected-products-heading" className="mt-1 text-2xl font-semibold tracking-tight">Different views, one shared setup</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
              Changing a route, assignment, or location updates the useful lists without rebuilding the plan somewhere else.
            </p>
          </div>

          <div className="mt-5 overflow-hidden rounded-lg border bg-card">
            <div className="grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
              <article className="p-5 sm:p-6">
                <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary"><MapIcon className="size-5" aria-hidden /></span>
                <h3 className="mt-4 text-lg font-semibold">Stage Plot</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">The physical view of performers, racks, stage boxes, screens, power, and real cable paths.</p>
                <ul className="mt-4 grid gap-2 text-sm text-muted-foreground">
                  <li>Scaled stage dimensions</li>
                  <li>Groups and physical footprints</li>
                  <li>Movable routing waypoints</li>
                  <li>Measured cable requirements</li>
                </ul>
              </article>

              <article className="p-5 sm:p-6">
                <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground"><GitBranchIcon className="size-5" aria-hidden /></span>
                <h3 className="mt-4 text-lg font-semibold">Signal Router</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">The logical view of every source, destination, numbered port, connector end, and signal direction.</p>
                <ul className="mt-4 grid gap-2 text-sm text-muted-foreground">
                  <li>Click-to-add or drag equipment into an exact canvas position</li>
                  <li>Compact image nodes with expandable exact ports</li>
                  <li>Drop, crop, and zoom reusable square icons</li>
                  <li>Typed inputs and outputs</li>
                  <li>Animated selectable cables</li>
                  <li>Repatch either cable end without recreating the run</li>
                  <li>Drill-through equipment details</li>
                </ul>
              </article>

              <article className="p-5 sm:p-6">
                <span className="flex size-10 items-center justify-center rounded-md bg-muted text-foreground"><BoxesIcon className="size-5" aria-hidden /></span>
                <h3 className="mt-4 text-lg font-semibold">Gear Tracker</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">The fulfillment view of what is required, who supplies it, where it belongs, and where it was last observed.</p>
                <ul className="mt-4 grid gap-2 text-sm text-muted-foreground">
                  <li>Inventory IDs and QR labels</li>
                  <li>Planned, ordered, in-transit, and on-hand assets</li>
                  <li>Grouped orders, payment, tracking, and expected delivery</li>
                  <li>Owned, hired-musician, backline, or shopping assignments</li>
                  <li>Containers and packing manifests</li>
                  <li>History, shortages, and advance lists</li>
                </ul>
              </article>
            </div>

            <div className="grid border-t bg-muted/35 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Gear definitions", "What a model or generic item is"],
                ["Setup requirements", "What this layout needs"],
                ["Assignments", "What fulfills each need"],
                ["Inventory events", "Where real assets were observed"],
              ].map(([title, description]) => (
                <div key={title} className="border-b p-4 last:border-b-0 sm:border-r sm:[&:nth-child(2)]:border-r-0 sm:[&:nth-child(3)]:border-b-0 lg:border-b-0 lg:[&:nth-child(2)]:border-r lg:[&:last-child]:border-r-0">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="operating-loop-heading">
          <div className="max-w-3xl">
            <p className="swell-page-kicker">Basic operating loop</p>
            <h2 id="operating-loop-heading" className="mt-1 text-2xl font-semibold tracking-tight">From idea to packed vehicle</h2>
          </div>
          <ol className="mt-5 grid overflow-hidden rounded-lg border bg-card md:grid-cols-4 md:divide-x">
            {[
              ["1", "Design", "Place equipment, groups, ports, and dependencies into a named setup."],
              ["2", "Route", "Connect signals and draw real cable paths through stage waypoints."],
              ["3", "Assign", "Choose an owned asset, outside provider, or purchase for every requirement."],
              ["4", "Pack and verify", "Scan or manually check items into containers and the vehicle."],
            ].map(([number, title, description], index) => (
              <li key={number} className="relative border-b p-4 last:border-b-0 md:border-b-0 md:p-5">
                <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{number}</span>
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
                {index < 3 ? <ArrowRightIcon className="absolute top-6 -right-3 hidden size-5 rounded-full border bg-background p-1 text-muted-foreground md:block" aria-hidden /> : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="swell-panel p-5 sm:p-7" aria-labelledby="gear-workflow-heading">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">Available now</Badge><p className="swell-page-kicker">Using the gear system</p></div>
              <h2 id="gear-workflow-heading" className="mt-2 text-2xl font-semibold tracking-tight">Create the model once, then follow each real item from plan to possession</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">A definition describes a product. An asset reserves one permanent inventory identity. An order groups assets for purchasing. A check-in proves a physical item has arrived somewhere.</p>
            </div>
            <Link href="/gear" className={buttonVariants({ className: "shrink-0" })}><BoxesIcon data-icon="inline-start" />Open gear system</Link>
          </div>
          <ol className="mt-6 grid overflow-hidden rounded-lg border bg-background md:grid-cols-4 md:divide-x">
            {[
              ["1", "Define", "Paste a product URL into New definition. The research bot drafts model data, price, photos, and exact ports for review."],
              ["2", "Reserve", "Create planned gear from /gear or directly inside a setup node. It receives its permanent asset ID immediately."],
              ["3", "Order", "Select planned assets, group them into one vendor order, and record payer, account label, order status, shipment, and expected arrival."],
              ["4", "Receive", "Attach the QR label, add physical photos or serial number, and check the item into its first location. The check-in starts its history."],
            ].map(([number, title, description]) => (
              <li key={number} className="border-b p-4 last:border-b-0 md:border-b-0 md:p-5">
                <span className="font-mono text-xs text-muted-foreground">STEP {number}</span>
                <h3 className="mt-2 font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              </li>
            ))}
          </ol>
          <div className="mt-4 grid gap-3 rounded-lg bg-muted/45 p-4 md:grid-cols-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">From a setup</p><p className="mt-1 text-sm">Open a node, choose Owned / planned asset, then select an existing match or create planned gear in place.</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">From the gear page</p><p className="mt-1 text-sm">Use Plan gear for something not yet purchased, or Register owned gear for something already in hand.</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Ownership versus possession</p><p className="mt-1 text-sm">An asset can belong to Cron while still being ordered. Only its first check-in says that Swell physically has it.</p></div>
          </div>
        </section>

        <section className="swell-panel p-5 sm:p-7" aria-labelledby="asset-id-heading">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">Available now</Badge><p className="swell-page-kicker">Permanent asset IDs</p></div>
            <h2 id="asset-id-heading" className="mt-2 text-2xl font-semibold tracking-tight">Short enough to type, structured enough to recognize</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
              Every new asset receives a suggested uppercase ID based on the item. The system finds the highest existing sequence for that three-letter prefix and suggests the next one without reusing retired IDs.
            </p>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <Definition term="Ordinary gear"><code className="text-foreground">HXS-01</code> is the first HX Stomp asset. The next HXS item is suggested as <code className="text-foreground">HXS-02</code>.</Definition>
            <Definition term="Cables"><code className="text-foreground">XLR-04-25</code> means XLR cable 04 at 25 ft. The last segment records length and does not affect the next XLR sequence.</Definition>
            <Definition term="Forgiving search">Typing <code className="text-foreground">trs31</code>, <code className="text-foreground">TRS-31</code>, or <code className="text-foreground">tRs31</code> finds official ID <code className="text-foreground">TRS-31-15</code>.</Definition>
          </div>
          <div className="mt-4 grid gap-3 rounded-lg bg-muted/45 p-4 md:grid-cols-2">
            <div><p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Cable barcode</p><p className="mt-1 text-sm">Code 128 encodes the bare ID, such as <code>XLR-04-25</code>, to keep the heat-shrink label narrow.</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">QR destination</p><p className="mt-1 text-sm">A QR label points to <code>theswell.live/g/xlr-04-25</code>, which opens Gear already filtered to the matching asset.</p></div>
          </div>
        </section>

        <section className="swell-panel p-5 sm:p-7" aria-labelledby="container-heading">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">New model</Badge>
              <p className="swell-page-kicker">Containers and nested gear</p>
            </div>
            <h2 id="container-heading" className="mt-2 text-2xl font-semibold tracking-tight">Pack the cords once, then move the bag</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
              A container is a QR-labeled inventory asset that can also be the immediate location of other assets. Its manifest says what belongs inside; check-ins say what is actually inside.
            </p>
          </div>

          <div className="mt-6 grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <div className="rounded-lg border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-sm font-semibold">Mic cables</p><p className="text-xs text-muted-foreground">Individual assets</p></div>
                <Badge variant="outline">14 items</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span className="rounded border bg-card px-2 py-1.5">XLR-01-25</span>
                <span className="rounded border bg-card px-2 py-1.5">XLR-02-25</span>
                <span className="rounded border bg-card px-2 py-1.5">XLR-03-50</span>
                <span className="rounded border bg-card px-2 py-1.5">+ 11 more</span>
              </div>
              <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><ScanLineIcon className="size-4" aria-hidden />Scan or select each cord into the bag.</p>
            </div>

            <div className="flex items-center justify-center text-muted-foreground">
              <ArrowRightIcon className="hidden size-5 lg:block" aria-hidden />
              <ArrowDownIcon className="size-5 lg:hidden" aria-hidden />
            </div>

            <div className="rounded-lg border-2 border-primary/35 bg-primary/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary"><PackageOpenIcon className="size-5" aria-hidden /></span>
                <Badge variant="secondary">14 of 14 verified</Badge>
              </div>
              <h3 className="mt-4 font-semibold">Cable Duffle A</h3>
              <p className="mt-1 text-sm text-muted-foreground">Asset BAG-01, QR labeled</p>
              <Separator className="my-4" />
              <div className="grid gap-2 text-xs text-muted-foreground">
                <p><span className="font-medium text-foreground">Manifest:</span> what should be inside</p>
                <p><span className="font-medium text-foreground">Contents:</span> what was checked inside</p>
              </div>
            </div>

            <div className="flex items-center justify-center text-muted-foreground">
              <ArrowRightIcon className="hidden size-5 lg:block" aria-hidden />
              <ArrowDownIcon className="size-5 lg:hidden" aria-hidden />
            </div>

            <div className="rounded-lg border bg-background p-4">
              <span className="flex size-10 items-center justify-center rounded-md bg-muted text-foreground"><MapPinIcon className="size-5" aria-hidden /></span>
              <h3 className="mt-4 font-semibold">Ike&apos;s car</h3>
              <p className="mt-1 text-sm text-muted-foreground">Named location, optional GPS attached</p>
              <Separator className="my-4" />
              <p className="text-xs leading-5 text-muted-foreground">One bag check-in makes every actual descendant effectively located in the car.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 rounded-lg bg-muted/55 p-4 md:grid-cols-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Direct event</p><p className="mt-1 text-sm">Cable Duffle A checked into Ike&apos;s car.</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Inherited answer</p><p className="mt-1 text-sm">XLR-01-25 is in Ike&apos;s car via Cable Duffle A.</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Packing check</p><p className="mt-1 text-sm">The bag manifest still shows missing or extra contents.</p></div>
          </div>
        </section>

        <section aria-labelledby="variants-heading">
          <div className="max-w-3xl">
            <p className="swell-page-kicker">Setup variants</p>
            <h2 id="variants-heading" className="mt-1 text-2xl font-semibold tracking-tight">Copy the plan, keep or swap the real gear</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
              Duplicating a setup creates an independent plan while preserving references to the same physical assets until an assignment is deliberately changed.
            </p>
          </div>
          <div className="mt-5 overflow-hidden rounded-lg border bg-card">
            {[
              ["Rehearsal 2", "Band supplies everything", "Guitar", "Ike", "Asset G-014"],
              ["Local Show 12", "Same real guitar travels", "Guitar", "Ike", "Asset G-014"],
              ["Theater 123", "Backline supplies an equivalent", "Guitar", "Backline company", "No tracked asset ID"],
            ].map(([setup, summary, requirement, provider, asset], index) => (
              <div key={setup} className="grid gap-3 border-b p-4 last:border-b-0 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
                <div><p className="font-semibold">{setup}</p><p className="mt-0.5 text-sm text-muted-foreground">{summary}</p></div>
                <div><p className="text-xs uppercase tracking-[0.06em] text-muted-foreground">Requirement</p><p className="mt-1 text-sm">{requirement}</p></div>
                <div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.06em] text-muted-foreground">Fulfillment</p><p className="mt-1 text-sm">{provider}, {asset}</p></div>{index === 0 ? <Badge variant="secondary">Original</Badge> : <Badge variant="outline">Variant</Badge>}</div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="technical-heading">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-3xl">
              <p className="swell-page-kicker">Expanded specification</p>
              <h2 id="technical-heading" className="mt-1 text-2xl font-semibold tracking-tight">Data model and build plan</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">Open only the sections you need. This area will gradually become the operating manual as each feature ships.</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpenSections([...sectionIds])}>Expand all</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpenSections([])}>Collapse all</Button>
            </div>
          </div>

          <Accordion multiple value={openSections} onValueChange={setOpenSections} hiddenUntilFound className="mt-5">
            <AccordionItem value="core">
              <AccordionTrigger className="min-h-16"><DetailHeading index="01" title="Core vocabulary and relationships" note="The conceptual foundation" /></AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-4 text-foreground">
                  <p className="leading-6 text-muted-foreground">The system separates a reusable description, a requirement in a setup, a real physical object, and the decision about who supplies it.</p>
                  <dl className="grid gap-3 md:grid-cols-2">
                    <Definition term="GearDefinition">A reusable model or generic concept such as Behringer X32, vocal microphone, or 25 ft XLR cable. It holds default ports, attributes, dependencies, and the stage icon.</Definition>
                    <Definition term="InventoryAsset">A specific physical object recorded by Swell, with its own ID, optional QR code, real photos, owner, and last-known placement.</Definition>
                    <Definition term="SetupItem">A requirement inside one setup, such as the guitar at Position 1 or the XLR run from Vocal 3 to Stage Box input 3.</Definition>
                    <Definition term="Assignment">The fulfillment decision: use an owned asset, ask an outside provider, or purchase the requirement.</Definition>
                  </dl>
                  <div className="grid gap-2 md:grid-cols-4">
                    {[["Definition", "describes a kind"], ["Setup item", "asks for one"], ["Assignment", "chooses fulfillment"], ["Asset or provider", "satisfies the need"]].map(([title, detail], index) => (
                      <div key={title} className="relative rounded-md border bg-background p-3 text-center">
                        <p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                        {index < 3 ? <ArrowRightIcon className="absolute top-1/2 -right-3 hidden size-5 rounded-full border bg-card p-1 text-muted-foreground md:block" aria-hidden /> : null}
                      </div>
                    ))}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="views">
              <AccordionTrigger className="min-h-16"><DetailHeading index="02" title="Setups, views, groups, and positions" note="One plan, two spatial systems" /></AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-4 text-foreground">
                  <p className="leading-6 text-muted-foreground">A setup stores one logical system but two independent arrangements. Moving an item in the readable signal diagram never changes its physical cable requirement.</p>
                  <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs leading-6 text-foreground"><code>{`Setup {
  id, name, description, status, revision,
  stage: { widthFeet, depthFeet, unitSystem },
  nodes: SetupNode[], cables: SetupCable[],
  groups: SetupGroup[], routePoints: RoutePoint[],
  createdById, updatedById, createdAt, updatedAt
}

SetupNode {
  id, definitionId, assignment,
  stagePosition: { xFeet, yFeet, widthFeet?, depthFeet? },
  diagramPosition: { x, y },
  groupId?, collapsed, portOverrides?, notes?
}`}</code></pre>
                  <ul className="grid gap-2 pl-5 text-sm leading-6 text-muted-foreground marker:text-primary">
                    <li><strong className="text-foreground">Stage Plot:</strong> scaled physical positions, group footprints, cable corridors, waypoints, and length measurement.</li>
                    <li><strong className="text-foreground">Signal Diagram:</strong> readable topology with expandable groups, node details, exact ports, and drill-through navigation.</li>
                    <li><strong className="text-foreground">Groups:</strong> Position 1 or Stage-right rack can appear as one physical summary and expand into many logical nodes.</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="cables">
              <AccordionTrigger className="min-h-16"><DetailHeading index="03" title="Ports, cables, waypoints, and length" note="Logical signal plus physical route" /></AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-4 text-foreground">
                  <p className="leading-6 text-muted-foreground">A cable is both a logical connection and a setup requirement. It connects exact ports, has two typed ends, follows an ordered physical route, and can be assigned to a specific owned cable.</p>
                  <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs leading-6 text-foreground"><code>{`SetupCable {
  id, color,
  source: { nodeId, portId },
  target: { nodeId, portId },
  ends: [ConnectorEnd, ConnectorEnd],
  signalType,
  routePointIds: string[],
  calculatedLengthFeet,
  serviceSlackFeet,
  requiredLengthFeet,
  assignment
}`}</code></pre>
                  <ul className="grid gap-2 pl-5 text-sm leading-6 text-muted-foreground marker:text-primary">
                    <li>Physical length is the sum of orthogonal waypoint segments, plus drops and service slack.</li>
                    <li>Moving one waypoint recalculates every cable using it and can flag an assigned cable as too short.</li>
                    <li>Shared waypoint pairs become cable corridors with stable parallel visual lanes.</li>
                    <li>Selecting any segment selects the whole cable and the same parts-list item.</li>
                    <li>A female Combo XLR/TRS equipment port accepts either an XLR male or 1/4-inch TRS male cable end; the cable still records its one actual plug type.</li>
                  </ul>
                  <div className="flex flex-col gap-3">
                    <h3 className="text-base font-semibold">Multichannel snakes</h3>
                    <p className="leading-6 text-muted-foreground">A snake is one physical gear requirement with multiple movable ends. A normal or extension snake creates Side A and Side B nodes. A split snake creates Side A plus matched FOH and monitor outputs.</p>
                    <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs leading-6 text-foreground"><code>{`EquipmentTransportTopology {
  kind: "snake" | "split-snake",
  length?, lengthUnit, channelCount,
  endpoints: [{ id, label, style: "box" | "fan" | "tail" }]
}

EquipmentPort {
  ...physicalConnectorData,
  endpointId,
  channelKey // shared across internally paired connectors
}`}</code></pre>
                    <ul className="grid gap-2 pl-5 text-sm leading-6 text-muted-foreground marker:text-primary">
                      <li>Connecting Guitar A to channel 1 labels every paired output <strong className="text-foreground">Snake ch 1 (Guitar A)</strong>.</li>
                      <li>A split snake carries the same label to both Side B channel 1 outputs.</li>
                      <li>The thick internal trunk shows fixed length and channel count but is not another cable or inventory requirement.</li>
                      <li>All endpoint nodes share one fulfillment assignment and appear once in the Gear list.</li>
                    </ul>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="inventory">
              <AccordionTrigger className="min-h-16"><DetailHeading index="04" title="Inventory assets and fulfillment" note="Owned gear versus outside needs" /></AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-4 text-foreground">
                  <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs leading-6 text-foreground"><code>{`GearParty {
  id, name,
  kind: "person" | "band" | "company" |
        "provider" | "vendor",
  notes?, status
}

InventoryAsset {
  id, assetTag, definitionId, label,
  // assetTag: HXS-01 or cable form XLR-04-25
  lifecycleStatus: "planned" | "cart" | "ordered" |
    "in_transit" | "awaiting_check_in" | "active" |
    "retired" | "cancelled",
  ownerPartyId?, currentLocationId?,
  serialNumber?, photos?, sourceSetupId?,
  purchaseOrderId?, purchaseOrderLineId?
}

Assignment {
  fulfillment: "owned" | "rent" | "buy" | "unplanned",
  assignedAssetId?: string,
  providerPartyId?: string,
  notes?: string
}`}</code></pre>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Definition term="Owner">The party that owns a physical asset. Ike, Cron, a hired guitarist, a drummer, a venue, or a company can all be added without changing the schema.</Definition>
                    <Definition term="Setup provider">The party responsible for bringing a requirement to this setup. The provider is often the owner, but does not have to be.</Definition>
                  </div>
                  <ul className="grid gap-2 pl-5 text-sm leading-6 text-muted-foreground marker:text-primary">
                    <li>People and organizations live in one editable party registry. A party can own gear, provide gear for a setup, or do both.</li>
                    <li>One inventory asset can fulfill only one node in a setup. This applies equally to on-hand, planned, ordered, and in-transit assets; two required mixers need two distinct asset records.</li>
                    <li>A hired guitarist can own tracked guitar, pedal, and cable assets, or fulfill generic external requirements when Swell does not track their exact items.</li>
                    <li>The same drum-kit requirement can use Cron&apos;s tagged kit, a guest drummer&apos;s tagged kit, or an untracked backline assignment in different setup variants.</li>
                    <li>Shopping list is an assignment method, not an owner. Backline is a provider, not a warehouse Swell manages.</li>
                    <li>Duplicate and swap changes an assignment while preserving the node, ports, position, route, and definition.</li>
                    <li>Dependencies can add stands, clips, power supplies, adapters, DIs, and accessory cables automatically.</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="procurement">
              <AccordionTrigger className="min-h-16"><DetailHeading index="05" title="Planned gear, orders, shipping, and receiving" note="A permanent ID before the physical item exists" /></AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-4 text-foreground">
                  <p className="leading-6 text-muted-foreground">Planned gear is not a vague shopping-list row. It is an inventory asset with its future owner, definition, source setup, and permanent QR identity already reserved. Procurement status changes without breaking the setup reference.</p>
                  <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs leading-6 text-foreground"><code>{`PurchaseOrder {
  id, vendor, vendorUrl?,
  status: "draft" | "cart" | "ordered" |
    "partially_shipped" | "shipped" | "received" |
    "cancelled",
  paymentStatus: "not_paid" | "partially_paid" |
    "paid" | "refunded",
  orderedByPartyId?, paidByPartyId?,
  paymentAccountLabel?, orderNumber?,
  carrier?, trackingNumber?, expectedArrivalDate?,
  orderedDate?, shippedDate?, receivedDate?,
  lines: PurchaseOrderLine[]
}

PurchaseOrderLine {
  id, definitionId, description, quantity,
  assetIds: string[], productUrl?, unitPrice?, currency?
}`}</code></pre>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Definition term="Purchase queue">Every asset whose lifecycle is planned, in cart, ordered, in transit, or awaiting first check-in.</Definition>
                    <Definition term="Grouped order">Cron can call Sweetwater once and attach nine reserved assets to one vendor, payer, account label, order number, and shipment record.</Definition>
                    <Definition term="Receiving boundary">Delivered means the vendor says it arrived. Checked in means Swell observed the physical item at a named location.</Definition>
                  </div>
                  <ol className="grid gap-2 text-sm leading-6 text-muted-foreground sm:grid-cols-2">
                    <li className="rounded-md border bg-background p-3"><strong className="text-foreground">1. Plan:</strong> create the asset and assign its intended owner.</li>
                    <li className="rounded-md border bg-background p-3"><strong className="text-foreground">2. Buy:</strong> attach assets to an order and update cart, payment, and order details.</li>
                    <li className="rounded-md border bg-background p-3"><strong className="text-foreground">3. Track:</strong> add carrier, tracking number, shipped date, and expected arrival.</li>
                    <li className="rounded-md border bg-background p-3"><strong className="text-foreground">4. Receive:</strong> add serial/photos, attach the QR label, and create the first append-only check-in.</li>
                  </ol>
                  <p className="text-sm leading-6 text-muted-foreground">Payment accounts are friendly references such as “Band Amex” or “Cron personal card.” The system never stores card numbers or banking credentials.</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="images">
              <AccordionTrigger className="min-h-16"><DetailHeading index="06" title="Icons, reference photos, and asset photos" note="Three image roles with different jobs" /></AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-4 text-foreground">
                  <div className="grid gap-3 md:grid-cols-3">
                    <Definition term="Definition icon">One transparent PNG or WebP used on the stage plot, signal diagram, compact lists, and external-provider requirements. It represents the kind of gear.</Definition>
                    <Definition term="Definition detail gallery">Reusable front, rear, port, and control photos for inspecting a gear type and verifying its signal-flow definition.</Definition>
                    <Definition term="Asset photo gallery">Several JPEG or WebP photos of the actual physical item: front, back, ports, serial label, QR label, damage, case, and identifying marks.</Definition>
                  </div>
                  <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs leading-6 text-foreground"><code>{`GearDefinition {
  icon: { storagePath, contentType, width, height, thumbnailPath? }
  detailImages: [{ storagePath, contentType, filename, size }]
}

InventoryAsset {
  photos: [{
    id, storagePath, thumbnailPath,
    caption?, sortOrder, uploadedAt, uploadedById
  }]
}`}</code></pre>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="research">
              <AccordionTrigger className="min-h-16"><DetailHeading index="07" title="AI-assisted equipment research" note="Paste a product URL, then review the draft" /></AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-4 text-foreground">
                  <p className="leading-6 text-muted-foreground">From the setup equipment rack, an administrator can create a definition or edit an existing one. Paste a public product page and OpenRouter can replace the draft product data, price, reference photos, and exact physical port map. Nothing changes until the administrator reviews and saves it.</p>
                  <p className="leading-6 text-muted-foreground">Removing a definition archives it from the rack. Existing setup nodes and inventory assets retain their saved references, so cleaning up presets does not damage past plans.</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Definition term="Server extraction">Reads the exact page, captures source metadata and direct product-photo candidates, and blocks private-network URLs and oversized responses.</Definition>
                    <Definition term="Structured model draft">The configured OpenRouter model returns identity, description, observed price, exact mixed port groups, confidence, warnings, and sources under a strict schema.</Definition>
                    <Definition term="Human approval">Every physical port remains editable. The editor shows counts by connector bank and stores each jack with its own stable ID, direction, connector type, gender, and signal.</Definition>
                  </div>
                  <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs leading-6 text-foreground"><code>{`OPEN_ROUTER_API_KEY=... // server only
OPEN_ROUTER_EQUIPMENT_IMPORT_MODEL=openai/gpt-5.6-terra

Equipment research stores:
  source URL + observed price/time
  model + confidence + warnings
  exact connector/signal port array
  selected reference-photo URLs`}</code></pre>
                  <p className="text-sm leading-6 text-muted-foreground">Reference product photos appear as source-linked material in the inspection gallery. They remain separate from uploaded definition detail photos, the transparent stage icon, and photos of a QR-tagged physical asset.</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="containers">
              <AccordionTrigger className="min-h-16"><DetailHeading index="08" title="Containers, manifests, and nested placement" note="What belongs inside versus what is actually inside" /></AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-4 text-foreground">
                  <p className="leading-6 text-muted-foreground">Bags, road cases, racks, bins, and trunks are normal inventory assets with a container capability. A manifest is the expected organization. Placement events establish the actual hierarchy.</p>
                  <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs leading-6 text-foreground"><code>{`InventoryAsset {
  ...,
  canContainAssets?: boolean,
  currentPlacement:
    | { kind: "location", locationId: string }
    | { kind: "container", containerAssetId: string },
  effectiveLocationId?: string,
  locationInheritedFromAssetId?: string,
  ancestorContainerIds?: string[]
}

ContainerManifest {
  containerAssetId,
  expectedItems: [{ assetId, required, sortOrder, notes? }],
  updatedAt, updatedById
}`}</code></pre>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Definition term="Expected contents">The 14 cords assigned to Cable Duffle A. This powers teardown and packing checklists.</Definition>
                    <Definition term="Actual contents">The assets whose latest direct placement is inside Cable Duffle A.</Definition>
                    <Definition term="Effective location">If the bag is checked into Ike&apos;s car, all actual descendants resolve to Ike&apos;s car through the bag.</Definition>
                  </div>
                  <ul className="grid gap-2 pl-5 text-sm leading-6 text-muted-foreground marker:text-primary">
                    <li>Moving a container creates one direct event for the container. Child histories show inherited movement without pretending each child was scanned.</li>
                    <li>A container can move even when its manifest is incomplete, but the interface keeps the missing-items warning visible.</li>
                    <li>Containers may nest, such as cable pouch to duffle to car. Cycles are rejected and initial nesting depth is limited.</li>
                    <li>Scanning a container opens its manifest so teardown can confirm every expected item before the container leaves.</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="check-ins">
              <AccordionTrigger className="min-h-16"><DetailHeading index="09" title="Mobile scanning and location history" note="Append-only observations" /></AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-4 text-foreground">
                  <p className="leading-6 text-muted-foreground">The atomic operation is still a check-in observation. Its destination can now be a named location or another inventory asset that acts as a container.</p>
                  <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs leading-6 text-foreground"><code>{`InventoryCheckIn {
  id, assetId,
  destination:
    | { kind: "location", locationId: string }
    | { kind: "container", containerAssetId: string },
  checkedInAt, checkedInById,
  method: "qr_camera" | "manual_single" | "manual_bulk",
  coordinates?: {
    latitude, longitude, accuracyMeters, capturedAt
  },
  operationId?, setupId?, packingSessionId?, notes?
}`}</code></pre>
                  <ul className="grid gap-2 pl-5 text-sm leading-6 text-muted-foreground marker:text-primary">
                    <li>Phone flow: choose a destination, allow optional location access, scan continuously, and see immediate confirmation.</li>
                    <li>Manual flow: filter assets, select several, and check them in together. Every asset receives its own immutable event with a shared operation ID.</li>
                    <li>GPS is supporting context. The selected named location or container is the intentional fact.</li>
                    <li>Corrections add a corrective observation rather than rewriting the history.</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="packing">
              <AccordionTrigger className="min-h-16"><DetailHeading index="10" title="Packing sessions, shortages, and lists" note="Useful answers from the same records" /></AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-4 text-foreground">
                  <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs leading-6 text-foreground"><code>{`PackingSession {
  id, setupId, providerId,
  destinationLocationId,
  status: "packing" | "ready" | "departed" | "complete",
  startedAt, completedAt?
}`}</code></pre>
                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      [PackageCheckIcon, "Ike's packing list", "providedByPartyId = ike + setup = rehearsal_2"],
                      [ShoppingCartIcon, "Shopping list", "assignment.method = purchase"],
                      [WarehouseIcon, "Backline advance", "providedByPartyId = backline_co"],
                      [MapPinIcon, "Missing from car", "required + not verified in packing session"],
                      [CircleDotIcon, "Where should I look?", "asset effective location + last placement time"],
                      [CableIcon, "Available mic cables", "definition = xlr + effective location = ike_house"],
                    ].map(([Icon, title, query]) => {
                      const QueryIcon = Icon as typeof PackageCheckIcon;
                      return <div key={String(title)} className="rounded-md border bg-background p-3"><div className="flex items-center gap-2"><QueryIcon className="size-4 text-primary" aria-hidden /><p className="text-sm font-semibold">{String(title)}</p></div><code className="mt-2 block text-xs leading-5 text-muted-foreground">{String(query)}</code></div>;
                    })}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="firestore">
              <AccordionTrigger className="min-h-16"><DetailHeading index="11" title="Firestore collections and access" note="Implementation-oriented storage" /></AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-4 text-foreground">
                  <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs leading-6 text-foreground"><code>{`/equipmentTemplates/{definitionId}          // reusable gear definitions
/inventoryAssets/{assetId}
/inventoryAssets/{assetId}/checkIns/{checkInId}
/gearParties/{partyId}
/gearLocations/{locationId}
/purchaseOrders/{orderId}
/setups/{setupId}
/setups/{setupId}/graphs/current
/containerManifests/{containerAssetId}       // planned
/packingSessions/{sessionId}                 // planned

Firebase Storage:
/setup-designer/equipment/{templateId}/{...}  // current icon + detail photos
/gear-assets/{assetId}/{...}                   // physical asset photos`}</code></pre>
                  <ul className="grid gap-2 pl-5 text-sm leading-6 text-muted-foreground marker:text-primary">
                    <li>Check-ins are append-only. Asset placement and effective-location fields are query snapshots.</li>
                    <li>A transaction or server function updates descendants when a container moves and rejects containment cycles.</li>
                    <li>Setup saves keep revision conflict detection and local crash recovery.</li>
                    <li>Admins edit layouts and inventory. A narrower packer role can later create check-ins without editing diagrams.</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="build">
              <AccordionTrigger className="min-h-16"><DetailHeading index="12" title="Recommended build sequence" note="Useful slices without data-model dead ends" /></AccordionTrigger>
              <AccordionContent>
                <div className="overflow-hidden rounded-md border bg-background text-foreground">
                  {buildPhases.map((phase) => (
                    <div key={phase.phase} className="grid gap-2 border-b p-4 last:border-b-0 md:grid-cols-[7rem_minmax(0,0.8fr)_minmax(0,1.5fr)] md:items-start">
                      <Badge variant={phase.status === "Working now" ? "secondary" : "outline"}>{phase.phase}</Badge>
                      <div><p className="text-sm font-semibold">{phase.title}</p><p className="mt-1 text-xs text-muted-foreground">{phase.status}</p></div>
                      <p className="text-sm leading-6 text-muted-foreground">{phase.detail}</p>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="decisions">
              <AccordionTrigger className="min-h-16"><DetailHeading index="13" title="Decisions already made" note="Guardrails for implementation" /></AccordionTrigger>
              <AccordionContent>
                <ul className="grid gap-2 text-foreground">
                  <Decision>Setup diagrams and inventory editing are admin-only.</Decision>
                  <Decision>Stage Plot and Signal Diagram share identities but store separate positions.</Decision>
                  <Decision>Cable length comes from the physical route, never from React Flow screen pixels.</Decision>
                  <Decision>Every equipment and cable requirement can use an exact asset, an outside provider, or a purchase.</Decision>
                  <Decision>A planned asset receives its permanent asset ID before purchase; ownership and physical possession remain separate facts.</Decision>
                  <Decision>Asset IDs use a canonical uppercase three-letter prefix and sequence. Cable IDs may add a final two-digit length; lookup ignores case and punctuation.</Decision>
                  <Decision>Purchase orders group reserved assets and store workflow metadata, while check-in remains the boundary that establishes physical possession and location.</Decision>
                  <Decision>Owners and setup providers come from one open-ended party registry that supports members, hired musicians, venues, and companies.</Decision>
                  <Decision>Combo XLR/TRS is a port-only type that accepts XLR or TRS male cable ends without turning the cable itself into a combo connector.</Decision>
                  <Decision>Each gear definition has one transparent icon and may have reusable inspection photos. Each physical asset has its own documentary photo gallery.</Decision>
                  <Decision>Check-ins are append-only; current and effective locations are denormalized last-known snapshots.</Decision>
                  <Decision>Containers keep expected manifests separate from actual contained assets.</Decision>
                  <Decision>A container move gives its actual descendants an inherited effective location without generating fake direct scans.</Decision>
                  <Decision>QR, manual single, and manual bulk check-ins create the same core event.</Decision>
                  <Decision>Backline is a provider. Swell does not manage the backline company&apos;s warehouse.</Decision>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        <section className="rounded-lg border bg-muted/45 p-5 sm:p-6" aria-labelledby="documentation-roadmap-heading">
          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-background text-primary"><ImageIcon className="size-5" aria-hidden /></span>
            <div>
              <h2 id="documentation-roadmap-heading" className="text-lg font-semibold">How this page will evolve</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">This began as the product blueprint. The signal router, AI gear definitions, planned and physical assets, grouped purchasing, and manual check-in sections now describe working tools. As the remaining features ship, this page will gain screenshots, common mistakes, mobile QR instructions, container packing, stage plotting, and show-advance guides.</p>
            </div>
          </div>
        </section>
      </article>
    </AppShell>
  );
}
