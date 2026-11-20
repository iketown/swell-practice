import { checkHref, type RecipientPacket } from "./releases";

export function printedUrl(code: string | undefined, packet: RecipientPacket) {
  return new URL(
    code ? checkHref(code, packet) : "/sp?draft=1",
    "https://theswell.live",
  ).href;
}
