'use client';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Info } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import type { Plan } from './plan-card';

export function BankAccountPanel({ organizationId }: { organizationId?: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['subscription-account', organizationId], enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await createClient().from('organizations').select('*').eq('id', organizationId!).single();
      if (error) throw error;
      return data as unknown as { zainpay_virtual_account_number?: string; zainpay_virtual_account_bank?: string; zainpay_virtual_account_name?: string };
    },
  });
  const number = data?.zainpay_virtual_account_number;
  return <Card className="flex flex-col gap-5 p-5"><h2 className="tt-eyebrow">Your Zainpay Naira account</h2>{error ? <ErrorState title="Account unavailable" body="Could not load your bank account." onRetry={() => refetch()} /> : isLoading ? <Skeleton className="h-44" /> : number ? <><dl className="space-y-4"><div><dt className="text-xs text-muted-foreground">Bank</dt><dd className="mt-1 font-semibold">{data?.zainpay_virtual_account_bank || 'Zainpay'}</dd></div><div><dt className="text-xs text-muted-foreground">Account number (NUBAN)</dt><dd className="mt-1 flex flex-wrap items-center gap-3"><span className="font-mono text-2xl font-semibold tracking-wide">{number}</span><Button variant="ghost" size="icon" aria-label="Copy account number" onClick={async () => { try { await navigator.clipboard.writeText(number); toast.success('Account number copied'); } catch { toast.error('Could not copy. Select the account number to copy it manually.'); } }}><Copy className="h-4 w-4" /></Button></dd></div><div><dt className="text-xs text-muted-foreground">Account name</dt><dd className="mt-1 break-words font-semibold">{data?.zainpay_virtual_account_name || 'Not provided'}</dd></div></dl><p className="mt-auto flex gap-2 rounded-lg border bg-muted p-3 text-xs text-muted-foreground"><Info className="h-4 w-4 shrink-0" />Payments appear in billing history after confirmation.</p></> : <div className="flex flex-1 flex-col justify-center gap-3"><p className="font-semibold">No account assigned yet</p><p className="text-sm text-muted-foreground">Your payment account will appear here after merchant onboarding is complete.</p><Button variant="outline" onClick={() => refetch()}>Check again</Button></div>}</Card>;
}

export function UsagePanel({ organizationId, plan }: { organizationId?: string; plan?: Plan }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['subscription-usage', organizationId], enabled: Boolean(organizationId),
    queryFn: async () => {
      const db = createClient();
      const results = await Promise.all([
        db.from('products').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId!),
        db.from('users').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId!).eq('role', 'cashier'),
        db.from('warehouses').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId!),
      ]);
      for (const result of results) if (result.error) throw result.error;
      return results.map(result => result.count ?? 0);
    },
  });
  if (error) return <ErrorState title="Usage unavailable" body={error.message} onRetry={() => refetch()} />;
  if (isLoading) return <Skeleton className="h-48" />;
  return <div className="grid gap-4 md:grid-cols-3">{[['Products', plan?.max_products], ['Cashiers', plan?.max_cashiers], ['Warehouses', plan?.max_warehouses]].map(([label, rawLimit], i) => {
    const limit = typeof rawLimit === 'number' && rawLimit >= 0 ? rawLimit : null;
    const used = data?.[i] ?? 0;
    return <Card key={label} className="space-y-4 p-5"><h3 className="font-semibold">{label}</h3><p className="font-mono text-2xl">{used.toLocaleString('en-NG')} <span className="text-sm text-muted-foreground">/ {plan ? limit === null ? 'Unlimited' : limit.toLocaleString('en-NG') : 'No plan'}</span></p><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${limit === null ? 0 : Math.min(100, used / Math.max(1, limit) * 100)}%` }} /></div></Card>;
  })}</div>;
}
