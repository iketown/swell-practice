import {writeFileSync} from 'node:fs';
import {getServerFirestore} from '@/lib/server/firebase-admin';
const db=getServerFirestore(),id='g8qTbUz0v4xk40HzhHoD';
const graph=(await db.doc(`setups/${id}/graphs/current`).get()).data();
const meta=(await db.doc(`setups/${id}`).get()).data();
writeFileSync('tmp/stage-plot-draft/setup-graph.json',JSON.stringify(graph,null,2));
writeFileSync('tmp/stage-plot-draft/setup-meta.json',JSON.stringify(meta,null,2));
console.log(JSON.stringify({name:meta.name,revision:meta.revision,stage:graph.stage,nodes:graph.nodes.map(n=>({id:n.id,name:n.data.name,category:n.data.category,stage:n.stagePosition,ports:n.data.ports,assembly:n.data.assemblyId})),edges:graph.edges},null,2));
