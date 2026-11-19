import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeSetupGraphs, sameSetupValue } from '@/lib/setup-designer/merge-setup';
import { SAMPLE_SETUP_WORKSPACE } from '@/lib/setup-designer/sample-data';

const reorder = value => Array.isArray(value) ? value.map(reorder)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)])) : value;
function fixture() {
  const graph = structuredClone(SAMPLE_SETUP_WORKSPACE.graph);
  graph.edges[0].data.cableEnds = { end1: [{typeId:'xlr',gender:'female',label:'XLR'}], end2: [{typeId:'quarter-trs',gender:'male',label:'1/4-inch TRS'}] };
  graph.edges[0].data.cableAssemblyLegs = [{nodeId:graph.nodes[0].id,portId:'output',primary:true}];
  return graph;
}

test('Firestore key reordering does not create cable conflicts or dirty graphs', () => {
  const base=fixture(), local=reorder(base), remote=structuredClone(base);
  remote.revision+=1;
  const result=mergeSetupGraphs(base,local,remote);
  assert.deepEqual(result.conflicts,[]);
  assert.ok(sameSetupValue(result.graph.nodes,remote.nodes));
  assert.ok(sameSetupValue(result.graph.edges,remote.edges));
  assert.ok(sameSetupValue({optional:undefined,ends:[{typeId:'xlr',gender:'female'}]}, {ends:[{gender:'female',typeId:'xlr'}]}));
});

test('a local connector edit survives an incoming key reorder', () => {
  const base=fixture(),local=structuredClone(base),remote=reorder(base);
  local.edges[0].data.cableEnds.end1[0].gender='male';remote.revision+=1;
  const result=mergeSetupGraphs(base,local,remote);
  assert.deepEqual(result.conflicts,[]);
  assert.equal(result.graph.edges[0].data.cableEnds.end1[0].gender,'male');
});

test('real conflicting connector edits still require an explicit choice', () => {
  const base=fixture(),local=reorder(base),remote=structuredClone(base);
  local.edges[0].data.cableEnds.end1[0].gender='male';
  remote.edges[0].data.cableEnds.end1[0].typeId='quarter-trs';remote.revision+=1;
  const result=mergeSetupGraphs(base,local,remote);
  assert.equal(result.conflicts.length,1);
  assert.match(result.conflicts[0].path,/cableEnds.end1$/);
  const resolved=mergeSetupGraphs(base,local,remote,{[result.conflicts[0].path]:'local'});
  assert.deepEqual(resolved.graph.edges[0].data.cableEnds.end1,local.edges[0].data.cableEnds.end1);
  assert.equal(sameSetupValue([{typeId:'xlr'},{typeId:'quarter-trs'}],[{typeId:'quarter-trs'},{typeId:'xlr'}]),false);
  assert.equal(sameSetupValue({port:1},{port:'1'}),false);
  assert.equal(sameSetupValue({port:null},{}),false);
});
