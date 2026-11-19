import type { EquipmentNodeData } from "@/lib/setup-designer/domain";

/** Plan symbols use +Y (down the page) as forward, matching Blender's -Y. */
export function stageSymbolForEquipment(data: Pick<EquipmentNodeData, "name" | "category" | "templateId">): "microphone" | "mic-stand" | "drum-kit" | undefined {
  const description = `${data.category} ${data.name}`.toLowerCase();
  if (data.templateId === "template-microphone-stand" || /\b(?:mic|microphone|boom)\s+stand\b/.test(description)) return "mic-stand";
  // Microphone accessories may carry a mic signal but are not microphones.
  if (/\b(?:stand|preamp|amplifier|receiver|mixer|clip|cable|adapter|headphone)\b/.test(description)) return undefined;
  if (["template-vocal-mic", "template-kick-mic", "template-snare-mic", "template-overhead-mic"].includes(data.templateId ?? "")
    || /\b(?:microphones?|mic)\b/.test(description)) return "microphone";
  if (/\bdrum\s+(?:kit|set)\b/.test(description)) return "drum-kit";
  return undefined;
}
