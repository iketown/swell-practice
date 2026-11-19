import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerFirestore } from '@/lib/server/firebase-admin';
import { setupGraphFromData, normalizeSetupGraph } from '@/lib/setup-designer/serialization';
import { stagePositionForNode } from '@/lib/setup-designer/stage-plot';
import { stagePositionToPose, poseToStagePosition } from '@/lib/setup-designer/blender-coordinates';
import { attachmentFromPoses } from '@/lib/setup-designer/stage-attachments';
import { readBlenderSnapshot } from '@/lib/server/blender-store';
const plan=JSON.parse(readFileSync('tmp/blender-integration/separate-drums-plan.json','utf8'));
const db=getServerFirestore(),metaRef=db.doc(`setups/${plan.setupId}`),graphRef=metaRef.collection('graphs').doc('current');
const [metaDoc,graphDoc]=await Promise.all([metaRef.get(),graphRef.get()]);
const raw=graphDoc.data(),graph=setupGraphFromData(raw);
assert.equal(graph.revision,plan.revision);assert.equal(metaDoc.data().revision,plan.revision);
const graphBefore=JSON.stringify(graph),nodes=structuredClone(graph.nodes);
const ids=['stage-drum-kit','stage-kick-mic-stand','stage-snare-mic-stand','stage-overhead-mic-stand-l','stage-overhead-mic-stand-r'];
assert.ok(ids.every(id=>!nodes.some(n=>n.id===id)),'Drum kit migration already applied');
const sourceText='Planning dimensions for an unassigned microphone; confirm the actual model before treating as measured.';
const micSizes={
 'template-kick-mic':{size:[.05,.19,.05],source:sourceText},
 'template-snare-mic':{size:[.032,.157,.032],source:'Assigned Shure SM57: 157 mm length, 32 mm maximum diameter. https://pubs.shure.com/view/guide/SM57/en-US.pdf'},
 'template-overhead-mic':{size:[.025,.18,.025],source:sourceText},
};
function dimensions(size,source){return {widthInches:size[0]/.0254,depthInches:size[1]/.0254,heightInches:size[2]/.0254,sourceText:source};}
function add(id,name,category,pose,size,source){
 const n={id,type:'equipment',position:{x:0,y:0},data:{name,category,equipmentKind:'device',ports:[],showInSignalView:false,showPortLabels:false,showPortNumbers:false,isExpanded:false,fulfillment:'unplanned',needsPowerSource:false,needsPowerAdapter:false,physicalDimensions:dimensions(size,source),stage3d:{schemaVersion:1,elevationFeet:pose.elevationMeters/.3048,pitchDegrees:pose.pitchDegrees,rollDegrees:pose.rollDegrees,footprintMode:'physical'}}};
 n.stagePosition=poseToStagePosition(pose,{xFeet:0,yFeet:0},{widthMeters:size[0],depthMeters:size[1]});nodes.push(n);return n;
}
const kit=add(ids[0],'Drum kit','Drum kit',plan.kit,plan.kit.sizeMeters,'Measured from the imported Blender model at its existing 22-inch kick planning scale. Not manufacturer measurements.');
const names=['Kick mic stand · short boom','Snare mic stand · low boom','Overhead mic stand L · tall boom','Overhead mic stand R · tall boom'];
const bindings=[{nodeId:kit.id,blenderName:'Drum kit',importName:'drum set import'}];
const changed=[];
for(let i=0;i<plan.supports.length;i++){
 const support=plan.supports[i],mic=nodes.find(n=>n.id===support.micId);assert.ok(mic);
 const before=stagePositionForNode(mic,graph.stage),pose=stagePositionToPose(before,mic.data.stage3d);
 const spec=micSizes[mic.data.templateId];assert.ok(spec);
 mic.data.physicalDimensions=dimensions(spec.size,spec.source);
 mic.stagePosition={...poseToStagePosition(pose,before,{widthMeters:spec.size[0],depthMeters:spec.size[1]}),outputAnchor:{side:'top',offset:.5}};
 mic.data.stage3d={...mic.data.stage3d,footprintMode:'physical'};
 delete mic.data.image;delete mic.data.stageImage;
 const size=Object.values(support.dimensions);
 const stand=add(ids[i+1],names[i],'Microphone stand',support.pose,size,'Planning support dimensions from the existing Blender stand; no inventory assignment.');
 mic.data.stage3d.attachment=attachmentFromPoses(stand.id,support.pose,pose);
 assert.deepEqual(stagePositionToPose(stagePositionForNode(mic,graph.stage),mic.data.stage3d),pose,'Microphone center/heading must remain unchanged');
 changed.push(mic.id);bindings.push({nodeId:stand.id,blenderName:support.blenderName,micId:mic.id});
}
const next=normalizeSetupGraph({...graph,nodes,revision:graph.revision+1});
assert.deepEqual(next.edges,graph.edges);
for(const n of graph.nodes.filter(n=>!changed.includes(n.id)))assert.deepEqual(next.nodes.find(x=>x.id===n.id),n);
writeFileSync('tmp/blender-integration/separate-drums-before.json',JSON.stringify({metadata:metaDoc.data(),graph:raw},null,2),{mode:0o600});
writeFileSync('tmp/blender-integration/separate-drums-bindings.json',JSON.stringify(bindings,null,2));
console.log(JSON.stringify({revision:next.revision,microphones:changed.length,newStageOnlyObjects:bindings.map(b=>b.nodeId),cablesUnchanged:next.edges.length,kitSizeMeters:plan.kit.sizeMeters}));
if(!process.argv.includes('--apply'))process.exit(0);
const token=randomUUID(),storagePath=`setup-designer/stage-symbols/microphone-${token}.png`;
const bucket=getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
const image=readFileSync('output/stage-symbols/microphone.png');
await bucket.file(storagePath).save(image,{contentType:'image/png',metadata:{metadata:{firebaseStorageDownloadTokens:token}}});
const reference={storagePath,downloadUrl:`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`,contentType:'image/png'};
for(const n of next.nodes.filter(n=>changed.includes(n.id)))n.data.image=reference;
await db.runTransaction(async tx=>{
 const [m,g]=await tx.getAll(metaRef,graphRef);
 assert.equal(m.data().revision,plan.revision,'Setup changed during preparation');
 assert.equal(JSON.stringify(setupGraphFromData(g.data())),graphBefore,'Setup changed during preparation');
 tx.set(graphRef,{...raw,...JSON.parse(JSON.stringify(next)),updatedAt:FieldValue.serverTimestamp()});
 tx.update(metaRef,{revision:next.revision,nodeCount:new Set(next.nodes.map(n=>n.data.assemblyId??n.id)).size,updatedAt:FieldValue.serverTimestamp()});
});
writeFileSync('tmp/blender-integration/keyboard-snapshot.json',JSON.stringify(await readBlenderSnapshot(plan.setupId),null,2));
console.log('Applied and exported matching Blender snapshot.');
