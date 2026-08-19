'use client';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { QRCodeCanvas } from 'qrcode.react';

/** Creates a QR PNG entirely in-browser for offline PDF receipts. */
export async function renderQRCodeDataUrl(value: string): Promise<string | null> {
  if (typeof document === 'undefined' || !value) return null;

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:-10000px;';
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    root.render(
      React.createElement(QRCodeCanvas, {
        value,
        size: 160,
        level: 'M',
        marginSize: 2,
      }),
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const canvas = host.querySelector('canvas');
    return canvas?.toDataURL('image/png') ?? null;
  } catch {
    return null;
  } finally {
    root.unmount();
    host.remove();
  }
}
