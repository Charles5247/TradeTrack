// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: { id: 'owner', organization_id: 'org', role: 'business_owner' },
  mutate: vi.fn(), pdf: vi.fn(),
}));
vi.mock('@/store', () => ({
  useAuthStore: () => ({ user: state.user }),
  useOrgStore: () => ({organizationName:'Test shop',organizationAddress:'Market Road',organizationPhone:'0800',currency:'NGN'}),
}));
vi.mock('@/lib/supabase/client', () => ({createClient:vi.fn()}));
vi.mock('@/i18n', () => ({useI18n:() => ({t:new Proxy({}, {get:() => new Proxy({}, {get:(_t,k) => String(k)})})})}));
vi.mock('@/lib/pdf/receipt-pdf', () => ({downloadReceiptPDF:state.pdf}));
vi.mock('@/components/pos/receipt', () => ({Receipt:() => <div>Printable receipt</div>}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({invalidateQueries:vi.fn()}),
  useMutation: () => ({mutate:state.mutate,isPending:false}),
  useQuery: ({queryKey}: {queryKey:string[]}) => ({isLoading:false,refetch:vi.fn(), data: queryKey[0] === 'supplier-directory' ? {
    suppliers:[{id:'supplier',name:'Rice supplier',phone:'0801',email:'rice@example.com',address:'Market'}],
    products:[{id:'product',name:'Rice',sku:'RICE',supplier_id:null,cost_price:500}],
    orders:[{id:'order',supplier_id:'supplier',total_value:5000,status:'received',created_at:'2026-10-01'}],links:[],
  } : {staff:[{id:'cashier',full_name:'Amina',role:'cashier',status:'active'}],assignments:[]}}),
}));
import Suppliers from '@/app/(dashboard)/suppliers/page';
import Lookup from '@/app/(dashboard)/receipts/lookup/page';
import { StaffAssignments } from '@/components/warehouses/staff-assignments';

beforeEach(() => {
  vi.clearAllMocks(); state.user.role='business_owner';
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  sessionStorage.clear(); window.history.replaceState({},'', '/');
  state.pdf.mockResolvedValue(undefined);
});
async function mount(node: React.ReactNode, run: (host: HTMLDivElement) => Promise<void>) {
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try {await act(() => root.render(node));await run(host);} finally {await act(() => root.unmount());host.remove();vi.unstubAllGlobals();}
}
async function click(label: string) {
  const button=Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === label);
  expect(button, `Missing button ${label}`).toBeDefined();await act(() => button!.click());
}
it('opens supplier history and links a product without conflating supplier purchases and vendor sales', async () => {
  await mount(<Suppliers />,async host => {
    await click('View');expect(host.textContent).toContain('Supply history');expect(host.textContent).toContain('received');
    const select=host.querySelector<HTMLSelectElement>('select[aria-label="Product to link"]')!;
    await act(() => {select.value='product';select.dispatchEvent(new Event('change',{bubbles:true}));});
    await click('Link product');expect(state.mutate).toHaveBeenCalledWith({product:'product'});
    await click('Add supplier');expect(document.querySelector('[role=dialog] #supplier-name')).not.toBeNull();
  });
});
it('lets an owner assign a cashier to the main shop and hides management for cashiers', async () => {
  await mount(<StaffAssignments warehouseId="main" name="Main shop" />,async () => {
    await click('Assign staff');expect(document.querySelector('[role=dialog]')?.textContent).toContain('Team at Main shop');
    const select=document.querySelector<HTMLSelectElement>('#staff-main')!;
    await act(() => {select.value='cashier';select.dispatchEvent(new Event('change',{bubbles:true}));});
    await click('Assign to location');expect(state.mutate).toHaveBeenCalledWith({id:'cashier'});
  });
  state.user.role='cashier';await mount(<StaffAssignments warehouseId="main" name="Main shop" />,async host => {expect(host.textContent).not.toContain('Assign staff');});
});
it('opens a receipt from the library, saves recent lookups and exports its actual items', async () => {
  window.history.replaceState({},'', '/receipts/lookup?code=INV-1');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async () => ({kind:'sale',receipt:{invoiceNumber:'INV-1',dateISO:'2026-10-01',status:'completed',paymentStatus:'paid',paymentMethod:'cash',subtotal:1000,discount:0,tax:0,total:1000,amountPaid:1000,changeAmount:0,items:[{name:'Rice',quantity:2,unitPrice:500,total:1000}]}})}));
  await mount(<Lookup />,async host => {
    expect(host.textContent).toContain('Rice');expect(host.textContent).toContain('Recent lookups');
    expect(JSON.parse(sessionStorage.getItem('receipt-lookups:org:owner')!)).toEqual(['INV-1']);
    await click('Download PDF');expect(state.pdf).toHaveBeenCalledWith(expect.objectContaining({invoiceNumber:'INV-1',orgName:'Test shop',items:[{name:'Rice',quantity:2,unitPrice:500,total:1000}]}));
  });
});
