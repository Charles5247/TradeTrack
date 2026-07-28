'use client';

import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/**
 * Renders a scannable CODE128 linear barcode directly onto an inline
 * <svg>. Used at the bottom of every receipt (sales, vendor, and
 * warehouse-transfer templates) so it can be scanned — with any barcode
 * scanner, a phone camera app, or the in-app scanner on
 * `/receipts/lookup` — to pull up the full item list for that receipt.
 *
 * SVG (not <canvas>) is used so it renders identically in the on-screen
 * print-only view AND survives html2canvas/print — no extra async image
 * load step needed.
 */
export function BarcodeImage({
  value,
  height = 40,
  width = 1.4,
  className,
}: {
  value: string;
  height?: number;
  width?: number;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        width,
        height,
        displayValue: false,
        margin: 0,
        background: 'transparent',
        lineColor: '#000000',
      });
    } catch {
      // Invalid characters for CODE128 (shouldn't happen — invoice/transfer
      // refs are always ASCII) — fail silently rather than crash the
      // receipt render.
    }
  }, [value, width, height]);

  if (!value) return null;

  return <svg ref={ref} className={className} data-barcode-value={value} />;
}
