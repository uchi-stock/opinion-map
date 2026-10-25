import QRCode from "qrcode";
import { useMemo } from "react";

/** QRコード。SVGの図形として描く（HTML文字列を埋め込まない） */
export function QrCode({ value, label }: { value: string; label: string }) {
  const cells = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const size = qr.modules.size;
    const dark: Array<[number, number]> = [];
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (qr.modules.get(row, col)) dark.push([row, col]);
      }
    }
    return { size, dark };
  }, [value]);
  const margin = 2;
  const total = cells.size + margin * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${total} ${total}`}
      width="100%"
      style={{ maxWidth: 240 }}
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill="#fff" />
      {cells.dark.map(([row, col]) => (
        <rect key={`${row}-${col}`} x={col + margin} y={row + margin} width={1} height={1} fill="#000" />
      ))}
    </svg>
  );
}
