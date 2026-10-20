'use client';
import { MessageCircle } from 'lucide-react';
import { useCopy } from '@/i18n/text';
import { BUSINESS } from '@/lib/business-config';
export function WhatsAppLink({ floating = false }: { floating?: boolean }) {
  const copy = useCopy();
  return <a href={`${BUSINESS.whatsapp}?text=${encodeURIComponent(copy('Hello, I need help with TracKasuwa.'))}`}
    className={floating ? 'fixed bottom-4 right-4 z-40 flex min-h-12 items-center gap-2 rounded-full bg-green-700 px-4 py-3 text-white shadow-lg' : 'inline-flex items-center gap-2 underline'}>
    <MessageCircle size={20} aria-hidden />{copy('WhatsApp')}
  </a>;
}
