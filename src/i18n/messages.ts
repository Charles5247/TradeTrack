import type { Locale } from '@/types';
import catalog from './messages.json';

export const messages: Record<string, Partial<Record<Exclude<Locale, 'en'>, string>>> = catalog;
