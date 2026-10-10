// Nigerian Pidgin. Shared technical terms stay familiar.
import { en } from './en';
import copy from './pcm-copy.json';
const phrases: Record<string, string> = copy;
function localize(value: unknown): unknown {
  if (typeof value === 'string') return phrases[value] ?? value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, localize(child)]));
}
export const pcm = localize(en) as typeof en;
