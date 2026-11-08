'use client';

import { useEffect, useState } from 'react';
import { getDB } from '@/lib/offline/db';

export function OfflineProductImage({ id, alt, className }: { id: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;
    void getDB().then(db => db.get('pending_product_images', id)).then((record: { blob: Blob } | undefined) => {
      if (!active || !record) return;
      objectUrl = URL.createObjectURL(record.blob);
      setUrl(objectUrl);
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  return url ? <img src={url} alt={alt} className={className} /> : null;
}
