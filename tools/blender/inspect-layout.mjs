import {getServerFirestore} from '@/lib/server/firebase-admin';
const db=getServerFirestore();
const templates=await db.collection('equipmentTemplates').get();
console.log(JSON.stringify(templates.docs.map(d=>({id:d.id,name:d.data().name,dimensions:d.data().physicalDimensions,kind:d.data().definitionKind,category:d.data().category})),null,2));
