'use client';

import JsBarcode from 'jsbarcode';

/**
 * Renders `value` as a CODE128 linear barcode onto an offscreen <canvas> and
 * returns a PNG data URL. Used by the PDF receipt renderer (jsPDF can only
 * embed images, not draw a barcode directly) and can also be used anywhere
 * else a static barcode image is needed.
 *
 * Must only be called in the browser (client components) — jsbarcode's
 * canvas renderer needs a real DOM `document`.
 */
export function renderBarcodeDataUrl(
  value: string,
  options: { width?: number; height?: number; fontSize?: number } = {}
): string | null {
  if (typeof document === 'undefined' || !value) return null;
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, {
      format: 'CODE128',
      width: options.width ?? 1.6,
      height: options.height ?? 40,
      displayValue: false,
      margin: 4,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
