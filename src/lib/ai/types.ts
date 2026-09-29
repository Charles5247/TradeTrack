import type { ImportRow } from '@/lib/imports/preview';
export interface BusinessAggregate { productCount: number; unitsOnHand: number; stockCost: number; salesTotal: number; saleCount: number; lowStock: { name: string; quantity: number }[]; }
export interface Insight { title: string; message: string; source: 'organization-data-only'; }
export interface AIProvider {
  readonly name: string;
  readonly stub: boolean;
  mapInventory(text: string): Promise<ImportRow[]>;
  insights(data: BusinessAggregate): Promise<Insight[]>;
}
export interface DeliveryAdapter {
  readonly enabled: boolean;
  send(input: { recipient: string; title: string; message: string; idempotencyKey: string }): Promise<void>;
}
