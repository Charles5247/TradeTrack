import 'server-only';
import type { AIProvider } from './types';
import { MockAIProvider } from './mock';
export function getAIProvider(): AIProvider {
  const provider=process.env.AI_PROVIDER || 'mock';
  if (provider === 'mock') return new MockAIProvider();
  // AI_API_KEY is reserved for a future server-side adapter. Fail closed
  // rather than pretending an unimplemented model generated a response.
  if (!process.env.AI_API_KEY) throw new Error('The configured AI provider needs a server-side API key.');
  throw new Error('This AI provider is not connected yet. Set AI_PROVIDER=mock.');
}
