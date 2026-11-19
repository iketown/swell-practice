import { timingSafeEqual } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireServerAdmin, ServerRouteError } from "@/lib/server/admin-auth";
import { getServerFirestore } from "@/lib/server/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METERS_TO_FEET = 3.280839895013123;
const MAX_STAGE_FEET = 200;

const BlenderStageSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({
    blendFile: z.string().max(2_048).optional(),
    objectName: z.string().trim().min(1).max(256),
    sceneName: z.string().trim().min(1).max(256).optional(),
  }),
  stage: z.object({
    widthMeters: z.number().finite().positive(),
    depthMeters: z.number().finite().positive(),
    outlineMeters: z.array(z.object({
      xMeters: z.number().finite().nonnegative(),
      yMeters: z.number().finite().nonnegative(),
    })).min(3).max(256).optional(),
  }),
});

function roundFeet(meters: number) {
  return Math.round(meters * METERS_TO_FEET * 10_000) / 10_000;
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isLocalDevelopmentRequest(request: Request) {
  if (process.env.NODE_ENV === "production") return false;
  if (request.headers.get("x-swell-blender-local") !== "1") return false;
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(request.url).hostname);
  } catch {
    return false;
  }
}

async function requireBlenderSyncAccess(request: Request) {
  const configuredToken = process.env.SWELL_BLENDER_SYNC_TOKEN?.trim();
  const suppliedToken = request.headers.get("x-swell-blender-token")?.trim() ?? "";
  if (configuredToken && suppliedToken && constantTimeEqual(configuredToken, suppliedToken)) return;
  if (isLocalDevelopmentRequest(request)) return;
  await requireServerAdmin(request);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ setupId: string }> },
) {
  try {
    await requireBlenderSyncAccess(request);
    const { setupId } = await params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(setupId)) {
      return NextResponse.json({ error: "Invalid setup ID." }, { status: 400 });
    }

    const parsed = BlenderStageSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid Blender stage payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    const widthFeet = roundFeet(parsed.data.stage.widthMeters);
    const depthFeet = roundFeet(parsed.data.stage.depthMeters);
    if (widthFeet > MAX_STAGE_FEET || depthFeet > MAX_STAGE_FEET) {
      return NextResponse.json({ error: `Stage dimensions cannot exceed ${MAX_STAGE_FEET} feet.` }, { status: 400 });
    }

    const outline = parsed.data.stage.outlineMeters?.map((point) => ({
      xFeet: Math.min(widthFeet, roundFeet(point.xMeters)),
      yFeet: Math.min(depthFeet, roundFeet(point.yMeters)),
    }));
    const firestore = getServerFirestore();
    const metadataRef = firestore.collection("setups").doc(setupId);
    const graphRef = metadataRef.collection("graphs").doc("current");
    let nextRevision = 0;

    await firestore.runTransaction(async (transaction) => {
      const [metadataSnapshot, graphSnapshot] = await Promise.all([
        transaction.get(metadataRef),
        transaction.get(graphRef),
      ]);
      if (!metadataSnapshot.exists) throw new ServerRouteError("Setup not found.", 404);

      const currentRevision = Number(metadataSnapshot.data()?.revision ?? 0);
      nextRevision = currentRevision + 1;
      const graph = graphSnapshot.exists && isRecord(graphSnapshot.data()) ? graphSnapshot.data()! : {};
      const currentStage = isRecord(graph.stage) ? graph.stage : {};
      const stageWithoutOutline = { ...currentStage };
      delete stageWithoutOutline.outline;
      const nextStage = {
        ...stageWithoutOutline,
        widthFeet,
        depthFeet,
        ...(outline && outline.length >= 3 ? { outline } : {}),
        viewport: isRecord(currentStage.viewport) ? currentStage.viewport : { x: 48, y: 72, zoom: 0.72 },
        areas: Array.isArray(currentStage.areas) ? currentStage.areas : [],
        waypoints: Array.isArray(currentStage.waypoints) ? currentStage.waypoints : [],
      };

      transaction.set(graphRef, {
        ...graph,
        schemaVersion: 2,
        revision: nextRevision,
        nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
        edges: Array.isArray(graph.edges) ? graph.edges : [],
        viewport: isRecord(graph.viewport) ? graph.viewport : { x: 0, y: 0, zoom: 1 },
        stage: nextStage,
        blenderSource: {
          ...parsed.data.source,
          syncedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(metadataRef, {
        graphSchemaVersion: 2,
        revision: nextRevision,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "blender-sync",
      });
    });

    return NextResponse.json({
      ok: true,
      setupId,
      revision: nextRevision,
      stage: { widthFeet, depthFeet, outlinePointCount: outline?.length ?? 0 },
    });
  } catch (error) {
    if (error instanceof ServerRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Blender stage sync failed", error);
    return NextResponse.json({ error: "Could not sync the Blender stage." }, { status: 500 });
  }
}
