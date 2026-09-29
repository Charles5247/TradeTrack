import { autoMap, mapRows } from '@/lib/imports/preview';
import type { AIProvider, BusinessAggregate, Insight } from './types';
export class MockAIProvider implements AIProvider {
  readonly name = 'mock'; readonly stub = true;
  async mapInventory(text: string) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
    const split = (line: string) => line.split(delimiter).map(s => s.trim());
    const headers=split(lines[0]);const mapping=autoMap(headers,'products');
    if (mapping.name && Object.values(mapping).filter(Boolean).length>=2) {
      return mapRows(lines.slice(1).map(line => Object.fromEntries(split(line).map((value,i) => [headers[i] || String(i),value]))),mapping);
    }
    return lines.map((line,i) => {
      const match=/^(.*?)\s+(\d+)\s+(\d+(?:\.\d+)?)$/.exec(line);
      return { name: match?.[1] || line, sku: `DRAFT-${i+1}`, opening_stock: match?.[2] || '', selling_price: match?.[3] || '', cost_price: '' };
    });
  }
  async insights(data: BusinessAggregate): Promise<Insight[]> {
    return [
      { title: 'Stub: product summary', message: `Your business has ${data.productCount} products and ${data.unitsOnHand} units on hand.`, source: 'organization-data-only' },
      { title: 'Stub: inventory review', message: data.lowStock.length ? `Review low stock: ${data.lowStock.map(p => `${p.name} (${p.quantity})`).join(', ')}.` : 'No low-stock items were found in the supplied business data.', source: 'organization-data-only' },
      { title: 'Stub: your-business sales summary', message: `${data.saleCount} recorded sales total ${data.salesTotal.toFixed(2)} in your business currency. No external market data is connected.`, source: 'organization-data-only' },
    ];
  }
}
