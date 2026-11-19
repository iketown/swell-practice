// Explicitly creates isolated verification data; run with --run to opt in.
import { writeFileSync } from 'node:fs';
import { getServerFirestore, getServerAuth } from '@/lib/server/firebase-admin';
import { issueBlenderSession } from '@/lib/server/blender-auth';
import { nodeFromTemplate } from '@/lib/setup-designer/sample-data';
if (!process.argv.includes('--run')) throw new Error('Pass --run to create isolated sync test data.');
const db = getServerFirestore();
const uid = (await getServerAuth().getUserByEmail(process.env.NEXT_PUBLIC_ADMIN_EMAILS.split(',')[0].trim())).uid;
const setupId = 'blender-integration-check-20260907';
const templateId = 'blender-integration-box-20260907';
const existing = await db.doc(`setups/${setupId}`).get();
if (!existing.exists) {
  const template = { id: templateId, name: 'Blender verification box', definitionKind: 'equipment', manufacturer: 'Test fixture', model: 'Not inventory', category: 'test', equipmentKind: 'device', physicalDimensions: { widthInches: 24, depthInches: 12, heightInches: 6 }, referenceImages: [], detailImages: [], ports: [], needsPowerSource: false, needsPowerAdapter: false, showInSignalView: false, showPortNumbers: false, showPortLabels: false, version: 1, status: 'active' };
  const stage = (await db.doc('setups/QWSok55nO20JC3B8WL0x/graphs/current').get()).data().stage;
  const node = nodeFromTemplate(template, 'verification-box', 0, 0);
  node.stagePosition = { xFeet: 2, yFeet: 3, widthFeet: 2, depthFeet: 1, rotationDegrees: 0 };
  node.data.stage3d = { schemaVersion: 1, elevationFeet: 0, pitchDegrees: 0, rollDegrees: 0, footprintMode: 'physical' };
  const graph = JSON.parse(JSON.stringify({ schemaVersion: 2, revision: 0, nodes: [node], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, stage }));
  const batch = db.batch();
  batch.create(db.doc(`equipmentTemplates/${templateId}`), template);
  batch.create(db.doc(`setups/${setupId}`), { name: 'Blender integration verification', description: 'Isolated test setup; not the playroom layout', status: 'active', revision: 0, graphSchemaVersion: 2, nodeCount: 1, cableCount: 0, createdAt: new Date(), updatedAt: new Date(), createdBy: uid, updatedBy: uid });
  batch.create(db.doc(`setups/${setupId}/graphs/current`), graph);
  await batch.commit();
}
const session = await issueBlenderSession(uid, setupId, true);
writeFileSync('tmp/blender-integration/connection.json', JSON.stringify({ ...session, setupId, appUrl: 'http://localhost:3000' }), { mode: 0o600 });
console.log(JSON.stringify({ setupId, created: !existing.exists, connection: 'Written to ignored local file; secret not logged' }));
