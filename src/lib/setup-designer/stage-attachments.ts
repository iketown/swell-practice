import type { BlenderAttachment, BlenderPose } from "@/lib/setup-designer/blender-contract";
import type { SetupNode, StagePlan } from "@/lib/setup-designer/domain";
import { stagePositionForNode } from "@/lib/setup-designer/stage-plot";
import { stagePositionToPose, poseToStagePosition, METERS_PER_FOOT as FT } from "@/lib/setup-designer/blender-coordinates";

const rad = Math.PI / 180;
type Matrix = number[][];
const multiply = (a: Matrix, b: Matrix): Matrix => a.map((row) => b[0].map((_, col) => row.reduce((sum, value, k) => sum + value * b[k][col], 0)));
const transpose = (m: Matrix): Matrix => m[0].map((_, i) => m.map((row) => row[i]));
function rotation(x: number, y: number, z: number): Matrix {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x*rad), Math.sin(x*rad), Math.cos(y*rad), Math.sin(y*rad), Math.cos(z*rad), Math.sin(z*rad)];
  return [[cz*cy, cz*sy*sx-sz*cx, cz*sy*cx+sz*sx], [sz*cy, sz*sy*sx+cz*cx, sz*sy*cx-cz*sx], [-sy, cy*sx, cy*cx]];
}
function euler(m: Matrix) {
  const y = Math.asin(Math.max(-1, Math.min(1, -m[2][0])));
  const regular = Math.abs(Math.cos(y)) > 1e-7;
  return { x: (regular ? Math.atan2(m[2][1], m[2][2]) : 0)/rad, y: y/rad, z: (regular ? Math.atan2(m[1][0], m[0][0]) : Math.atan2(-m[0][1], m[1][1]))/rad };
}
const pos = (p: BlenderPose) => [p.centerXMeters, -p.centerYMeters, p.elevationMeters];
const rot = (p: BlenderPose) => rotation(p.rollDegrees, p.pitchDegrees, -p.headingDegrees);
const vector = (m: Matrix, v: number[]) => m.map((row) => row.reduce((sum, value, i) => sum + value*v[i], 0));
export function attachmentFromPoses(parentNodeId: string, parent: BlenderPose, child: BlenderPose): BlenderAttachment {
  const inverse = transpose(rot(parent)), p = pos(parent), c = pos(child);
  const [x,y,z] = vector(inverse, c.map((v,i) => v-p[i]));
  return { parentNodeId, offsetMeters: {x,y,z}, rotationXYZDegrees: euler(multiply(inverse, rot(child))) };
}
export function attachedPose(parent: BlenderPose, attachment: BlenderAttachment): BlenderPose {
  const offset = vector(rot(parent), [attachment.offsetMeters.x, attachment.offsetMeters.y, attachment.offsetMeters.z]);
  const p = pos(parent).map((v,i) => v+offset[i]);
  const angles = attachment.rotationXYZDegrees;
  const r = euler(multiply(rot(parent), rotation(angles.x, angles.y, angles.z)));
  return { centerXMeters: p[0], centerYMeters: -p[1], elevationMeters: p[2], headingDegrees: ((-r.z%360)+360)%360, pitchDegrees: r.y, rollDegrees: r.x };
}

/** Explicit child moves adjust its attachment; parent-only moves carry descendants. */
export function reconcileStageAttachments(before: readonly SetupNode[], after: readonly SetupNode[], stage: StagePlan): SetupNode[] {
  const previous = new Map(before.map((node) => [node.id, node]));
  const nodes = new Map(after.map((node) => [node.id, structuredClone(node)]));
  const visiting = new Set<string>(), done = new Set<string>();
  const pose = (node: SetupNode) => stagePositionToPose(stagePositionForNode(node, stage), node.data.stage3d);
  function visit(id: string) {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error("Attachment cycle: detach an item before parenting it here.");
    visiting.add(id);
    const node = nodes.get(id)!, attachment = node.data.stage3d?.attachment;
    if (attachment) {
      const parent = nodes.get(attachment.parentNodeId);
      if (!parent) { delete node.data.stage3d!.attachment; }
      else {
        visit(parent.id);
        const old = previous.get(id);
        const explicitMove = old && JSON.stringify(pose(old)) !== JSON.stringify(pose(node));
        const updatedLink = explicitMove ? attachmentFromPoses(parent.id, pose(parent), pose(node)) : attachment;
        const effective = attachedPose(pose(parent), updatedLink), p = stagePositionForNode(node, stage);
        node.stagePosition = poseToStagePosition(effective, p, { widthMeters: p.widthFeet * FT, depthMeters: p.depthFeet * FT });
        node.data.stage3d = { ...node.data.stage3d!, elevationFeet: effective.elevationMeters / FT, pitchDegrees: effective.pitchDegrees, rollDegrees: effective.rollDegrees, attachment: updatedLink };
      }
    }
    visiting.delete(id); done.add(id);
  }
  for (const id of nodes.keys()) visit(id);
  return [...nodes.values()];
}
