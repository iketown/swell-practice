import {getServerFirestore} from '@/lib/server/firebase-admin';
if(!process.argv.includes('--run')) throw Error('Pass --run');
const db=getServerFirestore(), setupId='blender-integration-check-20260907';
await db.runTransaction(async tx=>{
 const ref=db.doc('equipmentTemplates/blender-integration-box-20260907');
 const existing=await tx.get(ref);
 tx.update(db.doc(`setups/${setupId}`),{status:'archived',updatedAt:new Date()});
 if(existing.exists&&existing.data().status!=='archived')tx.update(ref,{status:'archived',version:existing.data().version+1});
});
const sessions=await db.collection('blenderSyncSessions').where('setupId','==',setupId).get();
for(const session of sessions.docs)await session.ref.update({revoked:true});
console.log('Archived isolated verification setup/definition; retained audit history and revoked test connections.');
