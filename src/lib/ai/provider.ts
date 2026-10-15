import 'server-only';
import type { AIProvider } from './types';
import { MockAIProvider } from './mock';
import { OpenAIProvider } from './openai';
export function getAIProvider(): AIProvider {
  const provider=process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'mock');
  if (provider === 'mock') return new MockAIProvider();
  if (provider !== 'openai') throw new Error('Unsupported AI provider. Choose openai or mock.');
  const key = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
  if (!key) throw new Error('Live AI needs OPENAI_API_KEY in the server environment.');
  return new OpenAIProvider(key);
}
