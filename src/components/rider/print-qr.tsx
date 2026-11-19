import { memo } from "react";
import QRCodeWriter from "@zxing/library/esm/core/qrcode/QRCodeWriter";
import BarcodeFormat from "@zxing/library/esm/core/BarcodeFormat";
import EncodeHintType from "@zxing/library/esm/core/EncodeHintType";

export function qrArtwork(url: string) {
  const matrix = new QRCodeWriter().encode(
    url,
    BarcodeFormat.QR_CODE,
    0,
    0,
    new Map([[EncodeHintType.ERROR_CORRECTION, "M"]]),
  );
  const size = matrix.getWidth(),
    rows: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!matrix.get(x, y)) continue;
      const start = x;
      while (x + 1 < size && matrix.get(x + 1, y)) x++;
      rows.push(`M${start} ${y}h${x - start + 1}v1H${start}z`);
    }
  }
  return { size, path: rows.join("") };
}

export function qrDataUrl(url: string) {
  const { size, path } = qrArtwork(url);
  return "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="77" height="77" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="white"/><path d="${path}" fill="black"/></svg>`);
}

export const PrintQr = memo(function PrintQr({ url, label }: { url: string; label: string }) {
  const { size, path } = qrArtwork(url);
  return (
    <a
      className="print-qr"
      href={url}
      aria-label={label}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <rect width={size} height={size} fill="white" />
        <path d={path} fill="black" />
      </svg>
    </a>
  );
});
