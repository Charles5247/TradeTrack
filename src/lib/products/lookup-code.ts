import { createClient } from '@/lib/supabase/client';
import { getDB } from '@/lib/offline/db';
import type { Product } from '@/types';

export type CodeMatch = Pick<Product, 'id' | 'organization_id' | 'name' | 'sku' | 'selling_price' | 'cost_price' | 'status'> & Partial<Product>;

export async function lookupProductCode(code: string, organizationId: string): Promise<{ product: CodeMatch | null; cached: boolean }> {
  const value = code.trim();
  if (!organizationId) throw new Error('Business membership is required to look up a product.');
  if (!value || value.length > 255) throw new Error('Enter a code between 1 and 255 characters.');
  const cachedLookup = async () => {
    const db = await getDB();
    const products = (await db.getAll('products')).filter(p => p.organization_id === organizationId && (p.barcode === value || p.sku === value));
    if (products.length > 1) throw new Error('More than one product uses this code. Search Products to choose the correct record.');
    return { product: products[0] as CodeMatch || null, cached: true };
  };
  if (!navigator.onLine) return cachedLookup();
  const supabase = createClient();
  // Separate exact comparisons avoid interpreting scanned punctuation as a filter.
  const [barcode, sku] = await Promise.all([
    supabase.from('products').select('*').eq('organization_id', organizationId).eq('barcode', value).limit(2),
    supabase.from('products').select('*').eq('organization_id', organizationId).eq('sku', value).limit(2),
  ]);
  if (barcode.error || sku.error) {
    const cached = await cachedLookup();
    if (cached.product) return cached;
    throw new Error('Product lookup is unavailable. Reconnect and try again.');
  }
  const matches = Array.from(new Map([...(barcode.data || []), ...(sku.data || [])].map(p => [p.id, p])).values());
  if (matches.length > 1) throw new Error('More than one product uses this code. Search Products to choose the correct record.');
  return { product: matches[0] as CodeMatch || null, cached: false };
}
