// Creates the initial spatial arrangement only while playroom is empty.
// Existing catalog records are read-only. Estimates belong to these placements.
import {writeFileSync} from 'node:fs';
import {getServerFirestore,getServerAuth} from '@/lib/server/firebase-admin';
import {issueBlenderSession} from '@/lib/server/blender-auth';
import {nodeFromTemplate,SAMPLE_EQUIPMENT_TEMPLATES} from '@/lib/setup-designer/sample-data';
import {setupGraphFromData,normalizeSetupGraph} from '@/lib/setup-designer/serialization';
import {attachmentFromPoses} from '@/lib/setup-designer/stage-attachments';
import {stagePositionToPose} from '@/lib/setup-designer/blender-coordinates';
import {equipmentPortsFromData} from '@/lib/setup-designer/ports';
import {stagePositionForNode} from '@/lib/setup-designer/stage-plot';
if(!process.argv.includes('--run')) throw Error('Pass --run to populate the empty playroom.');
const db=getServerFirestore(),setupId='QWSok55nO20JC3B8WL0x';
const uid=(await getServerAuth().getUserByEmail(process.env.NEXT_PUBLIC_ADMIN_EMAILS.split(',')[0].trim())).uid;
const docs=await db.collection('equipmentTemplates').get();
const catalog=new Map(SAMPLE_EQUIPMENT_TEMPLATES.map(t=>[t.id,t]));
for(const doc of docs.docs) catalog.set(doc.id,{id:doc.id,definitionKind:'equipment',equipmentKind:'device',version:1,...doc.data(),ports:equipmentPortsFromData(doc.data().ports)});
const generic=(id,name,category='Stage planning')=>({id,name,definitionKind:'equipment',category,equipmentKind:'device',ports:[],needsPowerSource:false,needsPowerAdapter:false,showInSignalView:false,showPortNumbers:false,showPortLabels:false,version:1,status:'active'});
const planned=[];
function add(id,templateOrId,cx,cy,estimate,elevation=0,name){
 const t=typeof templateOrId==='string'?catalog.get(templateOrId):templateOrId;
 if(!t) throw Error('Missing definition '+templateOrId);
 const node=nodeFromTemplate(t,id,(planned.length%5)*360,Math.floor(planned.length/5)*280,name??t.name);
 const old=node.data.physicalDimensions??{};
 const missing=['widthInches','depthInches','heightInches'].some(k=>!old[k]);
 node.data.physicalDimensions={...old,widthInches:old.widthInches||estimate[0],depthInches:old.depthInches||estimate[1],heightInches:old.heightInches||estimate[2],...(missing?{sourceText:[old.sourceText,'Unspecified dimensions filled with planning estimates for this placement only; verify before correcting the gear definition.'].filter(Boolean).join('\n')}:{})};
 node.data.notes=[node.data.notes,'Initial Blender stage arrangement; placement and inventory assignment are provisional.'].filter(Boolean).join('\n');
 const d=node.data.physicalDimensions;
 node.stagePosition={xFeet:cx-d.widthInches/24,yFeet:cy-d.depthInches/24,widthFeet:d.widthInches/12,depthFeet:d.depthInches/12,rotationDegrees:0};
 node.data.stage3d={schemaVersion:1,elevationFeet:elevation,pitchDegrees:0,rollDegrees:0,footprintMode:'physical'};
 planned.push(node);return node;
}
const locations=[[4,7.5],[9,8],[14,8],[20.5,7.2],[13,2]];
const performer=generic('swell-planning-performer','Six-foot performer','performer');
for(let i=0;i<5;i++) {const [x,y]=locations[i];const n=add(`playroom-performer-${i+1}`,performer,x,y,[24,12,72],0,`Performer ${i+1}`);n.data.physicalDimensions.sourceText='Planning mannequin: exactly 6 ft tall; not a measurement of a band member.';}
for(let i=0;i<5;i++) {
 const [x,y]=locations[i];const stand=add(`playroom-mic-stand-${i+1}`,'template-microphone-stand',x,y+1.35,[24,24,64],0,`Microphone stand ${i+1}`);
 const mic=add(`playroom-vocal-mic-${i+1}`,'template-vocal-mic',x,y+2.31,[2,6.5,2],5.2,`Vocal microphone ${i+1}`);
 mic.data.stage3d.attachment=attachmentFromPoses(stand.id,stagePositionToPose(stagePositionForNode(stand,{widthFeet:26,depthFeet:12}),stand.data.stage3d),stagePositionToPose(stagePositionForNode(mic,{widthFeet:26,depthFeet:12}),mic.data.stage3d));
}
const guitarStand=[...catalog.values()].find(t=>t.name==='Guitar stand')??generic('swell-planning-guitar-stand','Guitar stand');
add('playroom-guitar-stand-1',guitarStand,6,5.2,[18,20,36]);
add('playroom-guitar-stand-2',guitarStand,2.5,5.5,[18,20,36]);
add('playroom-guitar','template-guitar',6,5.2,[13,3,39],0.3);
add('playroom-bass','template-bass',2.5,5.5,[14,3,45],0.3);
add('playroom-bass-di','template-bass-di',3,10.5,[5,6,2]);
const guitarDI=[...catalog.values()].find(t=>t.name==='Guitar D.I.')??generic('swell-planning-guitar-di','Guitar D.I.');
add('playroom-guitar-di',guitarDI,10,10.5,[5,6,2]);
add('playroom-amp-1',generic('swell-planning-amplifier','Guitar amp · estimate'),7,2.2,[24,12,22]);
add('playroom-amp-2',generic('swell-planning-bass-amplifier','Bass amp · estimate'),3.5,2.2,[22,16,28]);
add('playroom-drums',generic('swell-planning-drums','Drum kit · estimate'),13,4,[72,60,48]);
add('playroom-keyboard','3pln0O7vOU8acYbF2apQ',20.5,8.8,[43,13,5],2.8);
add('playroom-keyboard-stand',generic('swell-planning-keyboard-stand','Keyboard stand · estimate'),20.5,8.8,[36,20,34]);
add('playroom-guitar-pedal','oQwf9OqYEHr3WcEbLiq7',8.3,10.7,[12.5,5,2.7]);
add('playroom-bass-pedal','mSR0GIIdD1kWG8x5kBVK',4.5,10.7,[5.5,9.5,3]);
await db.runTransaction(async tx=>{
 const ref=db.doc(`setups/${setupId}/graphs/current`),raw=await tx.get(ref),graph=setupGraphFromData(raw.data());
 if(graph.nodes.length) throw Error('Playroom already has placements; no changes made.');
 const metadata=await tx.get(db.doc(`setups/${setupId}`));
 if(metadata.data().revision!==graph.revision) throw Error('Inconsistent revision');
 writeFileSync('tmp/blender-integration/playroom-before.json',JSON.stringify(raw.data(),null,2));
 const updated=normalizeSetupGraph({...graph,nodes:planned,revision:graph.revision+1});
 tx.set(ref,JSON.parse(JSON.stringify({...raw.data(),...updated})));
 tx.update(metadata.ref,{revision:updated.revision,nodeCount:planned.length,updatedAt:new Date(),updatedBy:uid});
});
const session=await issueBlenderSession(uid,setupId,true);
writeFileSync('tmp/blender-integration/playroom-connection.json',JSON.stringify({...session,setupId,appUrl:'http://localhost:3000'}),{mode:0o600});
console.log(JSON.stringify({setupId,placements:planned.length,performers:5,source:'Existing definitions plus clearly labeled placement-only estimates',catalogWrites:0}));
