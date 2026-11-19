import type { StagePosition } from "@/lib/setup-designer/domain";
import type { BlenderCalibration, BlenderPose, Stage3d } from "@/lib/setup-designer/blender-contract";

export const METERS_PER_FOOT = 0.3048;
export const METERS_PER_INCH = 0.0254;
const RADIANS_PER_DEGREE = Math.PI / 180;

function heading(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

type SizedPosition = StagePosition & { widthFeet: number; depthFeet: number };

export function stagePositionToPose(position: SizedPosition, spatial?: Stage3d): BlenderPose {
  return {
    centerXMeters: (position.xFeet + position.widthFeet / 2) * METERS_PER_FOOT,
    centerYMeters: (position.yFeet + position.depthFeet / 2) * METERS_PER_FOOT,
    elevationMeters: (spatial?.elevationFeet ?? 0) * METERS_PER_FOOT,
    headingDegrees: heading(position.rotationDegrees ?? 0),
    pitchDegrees: spatial?.pitchDegrees ?? 0,
    rollDegrees: spatial?.rollDegrees ?? 0,
  };
}

/** Keep the center fixed when width/depth are corrected, retaining cable anchors. */
export function poseToStagePosition(
  pose: BlenderPose,
  previous: StagePosition,
  footprintMeters: { widthMeters: number; depthMeters: number },
): SizedPosition {
  const widthFeet = footprintMeters.widthMeters / METERS_PER_FOOT;
  const depthFeet = footprintMeters.depthMeters / METERS_PER_FOOT;
  return {
    ...previous,
    xFeet: pose.centerXMeters / METERS_PER_FOOT - widthFeet / 2,
    yFeet: pose.centerYMeters / METERS_PER_FOOT - depthFeet / 2,
    widthFeet,
    depthFeet,
    rotationDegrees: heading(pose.headingDegrees),
  };
}

/** Stage origin is the backstage/left bounds corner; stage +Y points at audience. */
export function poseToBlenderTransform(pose: BlenderPose, frame: BlenderCalibration) {
  const yaw = frame.frameYawDegrees * RADIANS_PER_DEGREE;
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const scale = frame.metersPerBlenderUnit;
  return {
    location: {
      x: (frame.originWorldMeters.x + cosine * pose.centerXMeters + sine * pose.centerYMeters) / scale,
      y: (frame.originWorldMeters.y + sine * pose.centerXMeters - cosine * pose.centerYMeters) / scale,
      z: (frame.originWorldMeters.z + pose.elevationMeters) / scale,
    },
    // Blender XYZ Euler: Rz(frameYaw - heading) * Ry(pitch) * Rx(roll).
    rotationXYZ: {
      x: pose.rollDegrees * RADIANS_PER_DEGREE,
      y: pose.pitchDegrees * RADIANS_PER_DEGREE,
      z: (frame.frameYawDegrees - pose.headingDegrees) * RADIANS_PER_DEGREE,
    },
  };
}

/** Input must be the placement root's world transform, with scale removed. */
export function blenderTransformToPose(
  transform: ReturnType<typeof poseToBlenderTransform>,
  frame: BlenderCalibration,
): BlenderPose {
  const yaw = frame.frameYawDegrees * RADIANS_PER_DEGREE;
  const dx = transform.location.x * frame.metersPerBlenderUnit - frame.originWorldMeters.x;
  const dy = transform.location.y * frame.metersPerBlenderUnit - frame.originWorldMeters.y;
  return {
    centerXMeters: Math.cos(yaw) * dx + Math.sin(yaw) * dy,
    centerYMeters: Math.sin(yaw) * dx - Math.cos(yaw) * dy,
    elevationMeters: transform.location.z * frame.metersPerBlenderUnit - frame.originWorldMeters.z,
    headingDegrees: heading(frame.frameYawDegrees - transform.rotationXYZ.z / RADIANS_PER_DEGREE),
    pitchDegrees: transform.rotationXYZ.y / RADIANS_PER_DEGREE,
    rollDegrees: transform.rotationXYZ.x / RADIANS_PER_DEGREE,
  };
}
