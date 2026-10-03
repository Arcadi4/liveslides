import { cn } from "@/lib/utils";
import { encode } from "uqr";
import { useMemo } from "react";

interface QrCodeProps extends React.ComponentProps<"svg"> {
  /** Text to encode, e.g. the audience link. */
  value: string;
  /** Error correction level; `M` recovers from ~15% damage, enough for a photographed screen. */
  ecc?: "L" | "M" | "Q" | "H";
  /** Quiet zone in modules. The QR spec requires at least 4 for reliable scanning. */
  border?: number;
}

/**
 * Renders `value` as a scannable QR code. Modules are always black on white so the
 * code stays readable in dark mode and on projectors with low contrast.
 */
export function QrCode({ value, ecc = "M", border = 4, className, ...props }: QrCodeProps) {
  const { size, data } = useMemo(() => encode(value, { ecc, border }), [value, ecc, border]);

  // Collapse every row into horizontal runs so the whole symbol is one path instead
  // of up to ~1700 separate rects.
  const path = useMemo(() => {
    const runs: string[] = [];
    for (let y = 0; y < size; y += 1) {
      const row = data[y];
      let x = 0;
      while (x < size) {
        if (!row[x]) {
          x += 1;
          continue;
        }
        let end = x;
        while (end + 1 < size && row[end + 1]) end += 1;
        runs.push(`M${x},${y}h${end - x + 1}v1h-${end - x + 1}z`);
        x = end + 1;
      }
    }
    return runs.join("");
  }, [data, size]);

  return (
    <svg
      data-slot="qr-code"
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      className={cn("block size-full", className)}
      {...props}
    >
      <rect width={size} height={size} fill="white" />
      <path d={path} fill="black" />
    </svg>
  );
}
