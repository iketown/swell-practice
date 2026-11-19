import {getServerFirestore} from '@/lib/server/firebase-admin';
import {setupGraphFromData} from '@/lib/setup-designer/serialization';
import {attachmentFromPoses} from '@/lib/setup-designer/stage-attachments';
import {stagePositionToPose} from '@/lib/setup-designer/blender-coordinates';
import {stagePositionForNode} from '@/lib/setup-designer/stage-plot';
if(!process.argv.includes('--run')) throw Error('Pass --run');
const db=getServerFirestore(),id='blender-integration-check-20260907';
await db.runTransaction(async tx=>{
 const ref=db.doc(`setups/${id}/graphs/current`),snap=await tx.get(ref),graph=setupGraphFromData(snap.data());
 if(graph.nodes.length>1) return;
 for(let i=1;i<=5;i++) {const n=structuredClone(graph.nodes[0]);n.id=`verification-duplicate-${i}`;n.data.name='Same-name box';n.stagePosition.xFeet=3+i*2;n.stagePosition.yFeet=7;n.data.physicalDimensions={widthInches:24,depthInches:12,heightInches:6};n.stagePosition.widthFeet=2;n.stagePosition.depthFeet=1;graph.nodes.push(n);}
 const child=graph.nodes[1],parent=graph.nodes[0];
 child.data.stage3d.elevationFeet=4;
 child.data.stage3d.attachment=attachmentFromPoses(parent.id,stagePositionToPose(stagePositionForNode(parent,graph.stage),parent.data.stage3d),stagePositionToPose(stagePositionForNode(child,graph.stage),child.data.stage3d));
 graph.revision++;tx.set(ref,JSON.parse(JSON.stringify(graph)));tx.update(db.doc(`setups/${id}`),{revision:graph.revision,nodeCount:6});
});
console.log('Isolated setup expanded with five independently identified same-definition items and an attachment.');
