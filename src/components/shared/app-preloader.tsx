'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PRELOADER_STORAGE_KEY = 'tradetrack-app-preloader-seen';

export function AppPreloader() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(PRELOADER_STORAGE_KEY) !== '1') setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    try {
      sessionStorage.setItem(PRELOADER_STORAGE_KEY, '1');
    } catch {
      // Preloader remains dismissible even if storage is unavailable.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Loading TracKasuwa"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-card"
    >
      <video
        autoPlay
        muted
        playsInline
        preload="auto"
        src="/preloader.mp4"
        className="h-full w-full object-contain"
        onEnded={dismiss}
        onError={dismiss}
      />
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))]"
        onClick={dismiss}
        aria-label="Close loading animation"
      >
        <X className="h-5 w-5" />
      </Button>
    </div>
  );
}
