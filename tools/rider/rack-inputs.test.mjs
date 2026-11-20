import assert from "node:assert/strict";
import test from "node:test";
import { rackInputs, wirelessRoutes } from "../../src/lib/rider/rack-inputs.ts";
import { standardRackMap, rackMapSchema } from "../../src/lib/rider/rack-map.ts";

const plot = {
  stageBoxes: [{id:"drum", label:"upstage box"}, {id:"left", label:"stage left box"}],
  inputs: [[1,"drum"],[2,"drum"],[3,"left"],[4,"left"],[5,"drum"],[17,null]].map(
    ([number, stageBoxId]) => ({id:String(number), source:"Source "+number, number, stageBoxId})
  )
};

test("a source move renumbers both looms; S16 swaps change destinations independently", () => {
  const original = rackInputs(plot, standardRackMap);
  assert.equal(original[4].socket, "U·3");
  const inputs = plot.inputs.map(r => r.number === 2 ? {...r,stageBoxId:"left"} : r);
  const ports = [...standardRackMap.s16Inputs];
  [ports[4],ports[6]] = [ports[6],ports[4]];
  const moved = rackInputs({...plot, inputs}, {...standardRackMap,s16Inputs:ports});
  assert.deepEqual(moved.map(r=>r.socket), ["U·1","L·1","L·2","L·3","U·2"]);
  assert.equal(moved[4].s16, 7);
  assert.equal(moved[4].number, 5);
  assert.equal(rackInputs(plot)[4].s16, 5);
  assert.equal(rackInputs({...plot,stageBoxes:[]})[0].channel, null);
  assert.equal(rackMapSchema.safeParse({...standardRackMap,s16Inputs:ports.fill(1)}).success,false);
});

test("receiver endpoints follow the revision layout and source labels", () => {
  assert.equal(wirelessRoutes(plot,standardRackMap)[0].source, "Source 17");
  assert.equal(wirelessRoutes(plot,standardRackMap)[0].input, "XLR IN 1");
  assert.equal(wirelessRoutes(plot,{...standardRackMap,layout:"s16-v1"})[1].input,"AUX IN 2");
});

test("a receiver or monitor swap reaches the saved cable notes and patch diagrams", async () => {
  const { applyRackMap, earRoutes } = await import("../../src/lib/rider/rack-map.ts");
  const inputs = Array.from({length:18}, (_,i) => ({id: i < 16 ? String(i+1) : "wl-vocal-"+(i+1),number:i+1,source:"Source "+(i+1)}));
  const original = {stageBoxes:[],inputs,rackMap:standardRackMap,gear:[{id:"wl-iem-lead-1"},{id:"wl-mic-lead-1"}]};
  const map = {...standardRackMap,wirelessInputs:[2,1],earPairs:[5,2,3,4,1]};
  const saved = applyRackMap(original,map);
  assert.equal(wirelessRoutes(saved,map)[0].input,"XLR IN 2");
  assert.match(saved.gear[1].notes,/split tail 17 → X32 Rack XLR IN 2/);
  assert.match(saved.inputs[16].patch,/XLR IN 2 → CH 17/);
  assert.deepEqual(earRoutes(map)[0],{name:"Joe",tx:1,bus:1,device:"X32",out:1});
  assert.match(saved.gear[0].notes,/Joe bus 1 → X32 XLR Out 1/);
  assert.equal(earRoutes(original.rackMap)[0].device,"S16");
});

test("the table cable order follows patch swaps and only replaces matching venue allocations", async () => {
  const { sideStageCables } = await import("../../src/lib/rider/side-stage-cables.ts");
  const { rackTableXlr } = await import("../../src/lib/rider/rack-map.ts");
  const gear = [
    ...Array.from({length: 10}, (_, i) => "wl-iem-lead-" + (i + 1)),
    "wl-mic-lead-1", "wl-mic-lead-2", "rack-map-rx-patch",
  ].map(id => ({ id, quantity: id === "rack-map-rx-patch" ? 2 : 1, required: true, provider: "Venue production", spec: rackTableXlr }));
  const map = {...standardRackMap, earPairs: [5,2,3,4,1], wirelessInputs: [2,1]};
  const summary = sideStageCables({gear, rackMap: map});
  assert.equal(summary.included.size, 13);
  assert.match(summary.monitors[0], /S16 OUT 1–8 → IEM TX 5, 2, 3, 4/);
  assert.match(summary.monitors[1], /X32 Rack OUT 1\/2 → IEM TX 1/);
  assert.match(summary.wireless[1], /X32 Rack inputs 2 and 1/);
  const partial = sideStageCables({gear: gear.map(g => g.id === "wl-iem-lead-1" ? {...g, provider:"Backline"} : g), rackMap: map});
  assert.equal(partial.monitors.length, 1);
  assert(!partial.included.has("wl-iem-lead-2"));
  assert.equal(sideStageCables({gear}).included.size, 0);
});
