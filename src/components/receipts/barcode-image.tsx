'use client';

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

/** Renders the receipt reference as a crisp, printable QR code. */
export function BarcodeImage({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  if (!value) return null;

  return (
    <QRCodeSVG
      value={value}
      size={96}
      level="M"
      marginSize={2}
      className={className}
      data-qr-value={value}
    />
  );
}
