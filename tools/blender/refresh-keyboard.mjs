import {writeFileSync} from 'node:fs';
import {getServerFirestore} from '@/lib/server/firebase-admin';
import {readBlenderSnapshot} from '@/lib/server/blender-store';
const id='g8qTbUz0v4xk40HzhHoD';
const snapshot=await readBlenderSnapshot(id);
writeFileSync('tmp/blender-integration/keyboard-snapshot.json',JSON.stringify(snapshot,null,2));
writeFileSync('tmp/blender-integration/keyboard-graph.json',JSON.stringify((await getServerFirestore().doc(`setups/${id}/graphs/current`).get()).data(),null,2));
console.log({revision:snapshot.revision,items:snapshot.items.length,cables:snapshot.cables.length});
