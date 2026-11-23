import 'server-only';
import type { AIProvider } from './types';
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from './gemini';
import { MockAIProvider } from './mock';

export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER?.trim() || 'mock';
  if (provider === 'mock') return new MockAIProvider();
  if (provider !== 'gemini') throw new Error('Unsupported assistant provider. Choose gemini or mock.');
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('Live assistant processing requires the server Gemini key.');
  return new GeminiProvider(key, process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL);
}
