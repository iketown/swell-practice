import type { ConnectorSnapshot } from "@/lib/setup-designer/domain";

const CABLE_END_IMAGES: Record<string, string> = {
  "xlr:male": "/cable-ends/xlr-male.webp",
  "xlr:female": "/cable-ends/xlr-female.webp",
  "quarter-ts:male": "/cable-ends/quarter-ts-male.webp",
  "quarter-ts:female": "/cable-ends/quarter-ts-female.webp",
  "quarter-trs:male": "/cable-ends/quarter-trs-male.webp",
  "quarter-trs:female": "/cable-ends/quarter-trs-female.webp",
  "mini-ts:male": "/cable-ends/mini-ts-male.webp",
  "mini-ts:female": "/cable-ends/mini-ts-female.webp",
  "mini-trs:male": "/cable-ends/mini-trs-male.webp",
  "mini-trs:female": "/cable-ends/mini-trs-female.webp",
  "rca:male": "/cable-ends/rca-male.webp",
  "rca:female": "/cable-ends/rca-female.webp",
  "speakon:none": "/cable-ends/speakon.webp",
  "rj45:none": "/cable-ends/rj45.webp",
  "bnc:male": "/cable-ends/bnc-male.webp",
  "bnc:female": "/cable-ends/bnc-female.webp",
  "hdmi:male": "/cable-ends/hdmi-male.webp",
  "hdmi:female": "/cable-ends/hdmi-female.webp",
  "usb-a:male": "/cable-ends/usb-a-male.webp",
  "usb-a:female": "/cable-ends/usb-a-female.webp",
  "usb-b:male": "/cable-ends/usb-b-male.webp",
  "usb-b:female": "/cable-ends/usb-b-female.webp",
  "usb-c:male": "/cable-ends/usb-c-male.webp",
  "usb-c:female": "/cable-ends/usb-c-female.webp",
  "toslink:none": "/cable-ends/toslink.webp",
  "midi-din:male": "/cable-ends/midi-din-male.webp",
  "midi-din:female": "/cable-ends/midi-din-female.webp",
  "iec:male": "/cable-ends/iec-male.webp",
  "iec:female": "/cable-ends/iec-female.webp",
  "edison:male": "/cable-ends/edison-male.webp",
  "edison:female": "/cable-ends/edison-female.webp",
  "other:none": "/cable-ends/other.webp",
};

export function cableEndImagePath(connector: Pick<ConnectorSnapshot, "typeId" | "gender">) {
  return CABLE_END_IMAGES[`${connector.typeId}:${connector.gender}`];
}
