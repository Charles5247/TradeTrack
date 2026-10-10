'use client';
import { TranslatedText, useCopy } from '@/i18n/text';


import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Truck, Package, ClipboardList, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store';
import { AccessGuard } from '@/components/shared/access-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState } from '@/components/ui/loading-state';
import { FormTemplate } from '@/components/ui/form-template';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/utils/format';

type Supplier = { id: string; name: string; phone: string | null; email: string | null; address: string | null };
const blank = { name: '', phone: '', email: '', address: '' };
export default function SuppliersPage() { return <AccessGuard allow={['business_owner', 'admin']}><Suppliers /></AccessGuard>; }
function Suppliers() {
  const copy = useCopy();
  const { user } = useAuthStore();
  const orgId = user?.organization_id;
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [formError, setFormError] = useState('');
  const [productId, setProductId] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['supplier-directory', orgId], enabled: Boolean(orgId),
    queryFn: async () => {
      const db = createClient();
      const [suppliers, products, orders, links] = await Promise.all([
        db.from('suppliers').select('*').eq('organization_id', orgId!).order('name'),
        db.from('products').select('id,name,sku,supplier_id,cost_price').eq('organization_id', orgId!).order('name'),
        db.from('purchase_orders').select('id,supplier_id,status,total_value,created_at').eq('organization_id', orgId!).order('created_at', { ascending: false }),
        db.from('supplier_products').select('*').eq('organization_id', orgId!),
      ]);
      for (const result of [suppliers, products, orders, links]) if (result.error) throw result.error;
      return { suppliers: suppliers.data as Supplier[], products: products.data || [], orders: orders.data || [], links: links.data || [] };
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Supplier name is required.');
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) throw new Error('Enter a valid email address.');
      if (!orgId) throw new Error('Business not loaded.');
      const db = createClient();
      const payload = { ...form, name: form.name.trim() };
      const result = editing ? await db.from('suppliers').update(payload).eq('id', editing.id).eq('organization_id', orgId).select().single() : await db.from('suppliers').insert({ ...payload, organization_id: orgId }).select().single();
      if (result.error) throw result.error;
      return result.data as Supplier;
    },
    onSuccess: next => { cache.invalidateQueries({ queryKey: ['supplier-directory'] }); cache.invalidateQueries({ queryKey: ['suppliers'] }); cache.invalidateQueries({ queryKey: ['po-suppliers-products-warehouses'] }); setOpen(false); setSelected(next); toast.success('Supplier saved'); },
    onError: e => setFormError(e.message),
  });
  const link = useMutation({
    mutationFn: async ({ product, remove }: { product: string; remove?: boolean }) => {
      if (!orgId || !selected) throw new Error('Select a supplier.');
      const db = createClient();
      const result = remove ? await db.from('supplier_products').delete().eq('organization_id', orgId).eq('supplier_id', selected.id).eq('product_id', product) : await db.from('supplier_products').upsert({ organization_id: orgId, supplier_id: selected.id, product_id: product }, { onConflict: 'supplier_id,product_id' });
      if (result.error) throw result.error;
    },
    onSuccess: () => { cache.invalidateQueries({ queryKey: ['supplier-directory'] }); setProductId(''); },
    onError: e => toast.error(e.message),
  });
  const suppliers = data?.suppliers || [];
  const filtered = suppliers.filter(s => [s.name, s.phone, s.email].join(' ').toLowerCase().includes(search.toLowerCase()));
  const productsFor = (id: string) => (data?.products || []).filter(p => p.supplier_id === id || data?.links.some(l => l.supplier_id === id && l.product_id === p.id));
  const orders = (data?.orders || []).filter(o => o.supplier_id === selected?.id);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="tt-page-title"><TranslatedText text={"Suppliers"} /></h1><p className="tt-muted mt-1 text-sm"><TranslatedText text={"Who supplies your products, what you ordered, and what arrived."} /></p></div><Button onClick={() => { setEditing(null); setForm(blank); setFormError(''); setOpen(true); }}><Plus /><TranslatedText text={"Add supplier"} /></Button></div>
    <div className="grid gap-4 sm:grid-cols-3"><StatCard label={copy("Suppliers")} value={suppliers.length} icon={Truck} loading={isLoading} /><StatCard label={copy("Products with suppliers")} value={data?.products.filter(p => p.supplier_id || data.links.some(l => l.product_id === p.id)).length || 0} icon={Package} loading={isLoading} /><StatCard label={copy("Purchase orders")} value={data?.orders.length || 0} icon={ClipboardList} loading={isLoading} /></div>
    <Input aria-label={copy("Search suppliers")} leftIcon={<Search className="h-4 w-4" />} placeholder={copy("Search supplier, phone or email…")} value={search} onChange={e => setSearch(e.target.value)} />
    {error ? <ErrorState title={copy("Could not load suppliers")} body={error.message} onRetry={() => refetch()} /> : isLoading ? <LoadingState rows={5} /> : !filtered.length ? <EmptyState icon={Truck} title={copy("No suppliers found")} body={copy("Add your first supplier or change your search.")} /> : <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,1fr)]"><Card className="overflow-hidden"><Table><TableHeader><TableRow><TableHead><TranslatedText text={"Supplier"} /></TableHead><TableHead><TranslatedText text={"Contact"} /></TableHead><TableHead><TranslatedText text={"Products"} /></TableHead><TableHead><TranslatedText text={"Details"} /></TableHead></TableRow></TableHeader><TableBody>{filtered.map(s => <TableRow key={s.id} className={selected?.id === s.id ? 'bg-primary/5' : ''}><TableCell className="font-semibold">{s.name}</TableCell><TableCell><div>{s.phone || '—'}</div><div className="text-xs text-muted-foreground">{s.email}</div></TableCell><TableCell className="tabular-nums">{productsFor(s.id).length}</TableCell><TableCell><Button variant="ghost" size="sm" onClick={() => setSelected(s)}><TranslatedText text={"View"} /></Button></TableCell></TableRow>)}</TableBody></Table></Card>
    <Card className="space-y-5 p-5">{selected ? <><div className="flex items-start justify-between gap-3"><div><h2 className="tt-section-title">{selected.name}</h2><p className="mt-1 text-sm text-muted-foreground">{selected.address || 'No address added'}</p></div><Button aria-label={copy("Edit supplier")} variant="outline" size="icon" onClick={() => { setEditing(selected); setForm({name:selected.name,phone:selected.phone || '',email:selected.email || '',address:selected.address || ''}); setFormError(''); setOpen(true); }}><Pencil className="h-4 w-4" /></Button></div><div><h3 className="mb-3 font-semibold"><TranslatedText text={"Products supplied"} /></h3><div className="flex flex-col gap-2 sm:flex-row"><select aria-label={copy("Product to link")} className="tt-input min-w-0 flex-1" value={productId} onChange={e => setProductId(e.target.value)}><option value=""><TranslatedText text={"Choose a product"} /></option>{data?.products.filter(p => !productsFor(selected.id).some(x => x.id === p.id)).map(p => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select><Button disabled={!productId || link.isPending} onClick={() => link.mutate({product:productId})}><TranslatedText text={"Link product"} /></Button></div><ul className="mt-3 divide-y">{productsFor(selected.id).map(p => <li key={p.id} className="flex items-center justify-between gap-3 py-3"><Link href={`/products/${p.id}/edit`} className="min-w-0 text-sm hover:text-primary">{p.name}<span className="block font-mono text-xs text-muted-foreground">{p.sku}</span></Link>{p.supplier_id === selected.id ? <Badge variant="outline"><TranslatedText text={"Primary"} /></Badge> : <Button size="sm" variant="ghost" disabled={link.isPending} onClick={() => link.mutate({product:p.id,remove:true})}><TranslatedText text={"Unlink"} /></Button>}</li>)}</ul></div><div><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold"><TranslatedText text={"Supply history"} /></h3><Button asChild variant="outline" size="sm"><Link href="/purchase-orders/new"><TranslatedText text={"New purchase order"} /></Link></Button></div>{!orders.length ? <p className="py-5 text-sm text-muted-foreground"><TranslatedText text={"No purchase orders for this supplier yet."} /></p> : <ul className="mt-3 divide-y">{orders.map(o => <li key={o.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><div><Link href="/purchase-orders" className="font-mono text-primary">{'PO-' + o.id.slice(0,8).toUpperCase()}</Link><p className="text-xs text-muted-foreground">{formatDate(o.created_at)}</p></div><div className="text-right"><p className="font-semibold">{formatCurrency(o.total_value)}</p><Badge variant="outline">{o.status}</Badge></div></li>)}</ul>}</div></> : <EmptyState icon={Truck} title={copy("Supplier details")} body={copy("Select a supplier to manage its product catalog and see supply history.")} />}</Card></div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle><TranslatedText text={editing ? 'Edit supplier' : 'Add supplier'} /></DialogTitle></DialogHeader>{formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}<FormTemplate isSaving={save.isPending} onCancel={() => setOpen(false)} onSave={() => save.mutate()} sections={[{title:'Supplier details',fields:<div className="grid gap-4 sm:grid-cols-2">{(['name','phone','email','address'] as const).map(key => <div key={key} className={key === 'address' ? 'sm:col-span-2' : ''}><Label htmlFor={`supplier-${key}`} className="mb-2 block capitalize">{key}<TranslatedText text={key === 'name' ? ' *' : ''} /></Label><Input id={`supplier-${key}`} value={form[key]} type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} onChange={e => setForm({...form,[key]:e.target.value})} /></div>)}</div>}]} /></DialogContent></Dialog>
  </div>;
}
