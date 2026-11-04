'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';

type SupportCase = {
  id: string; organization_id: string; reporter_id: string; source: string;
  title: string; detail: string; status: 'open' | 'in_progress' | 'resolved';
  owner_note: string | null; created_at: string; updated_at: string;
};
type Merchant = { id: string; organization_id: string; business_name: string };

async function sendJson(url: string, method: string, body: object) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}

export function SupportCenter({ platform = false }: { platform?: boolean }) {
  const { user } = useAuthStore();
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [messageTitle, setMessageTitle] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('open');
  const [page, setPage] = useState(0);
  const { data: casePage, error, isLoading, refetch } = useQuery({
    queryKey: ['support-cases', user?.id, platform ? filter : 'all', page], enabled: !!user,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (platform && filter !== 'all') params.set('status', filter);
      const response = await fetch(`/api/support/cases?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load support cases.');
      return (await response.json()) as { cases: SupportCase[]; count: number };
    }, refetchInterval: 30000,
  });
  const { data: merchants = [] } = useQuery({
    queryKey: ['support-merchants'], enabled: platform && user?.role === 'platform_owner',
    queryFn: async () => {
      const { data, error } = await createClient().from('merchants')
        .select('id,organization_id,business_name').order('business_name').limit(500);
      if (error) throw error;
      return (data || []) as Merchant[];
    },
  });
  if (!user) return <p>Sign in to view support.</p>;
  if (platform && user.role !== 'platform_owner') return <p>Access denied.</p>;
  if (!platform && user.role === 'platform_owner') return <p>Open the platform support queue.</p>;

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try { await action(); toast.success(success); await refetch(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Request failed.'); }
    finally { setBusy(false); }
  };
  const visible = casePage?.cases || [];

  return <div className="space-y-6">
    <div><h1 className="tt-page-title">{platform ? 'Platform support queue' : 'Report an issue'}</h1>
      <p className="tt-muted mt-1">{platform ? 'Review merchant reports and sync failures, then update the merchant.' : 'Tell the platform team what happened. You can track their response here.'}</p></div>

    {!platform && <Card><CardHeader><CardTitle>New report</CardTitle></CardHeader><CardContent className="space-y-3">
      <Input aria-label="Issue title" placeholder="Short title" value={title} onChange={event => setTitle(event.target.value)} />
      <Textarea aria-label="Issue details" placeholder="What happened? Include any error message and when it occurred." value={detail} onChange={event => setDetail(event.target.value)} rows={5} />
      <Button disabled={busy || title.trim().length < 5 || detail.trim().length < 5} onClick={() => run(async () => {
        await sendJson('/api/support/cases', 'POST', { title, detail }); setTitle(''); setDetail('');
      }, 'Your report was sent.')}>Send report</Button>
    </CardContent></Card>}

    {platform && <Card><CardHeader><CardTitle>Message a merchant</CardTitle></CardHeader><CardContent className="space-y-3">
      <select aria-label="Merchant" className="tt-input w-full" value={merchantId} onChange={event => setMerchantId(event.target.value)}>
        <option value="">Select merchant</option>{merchants.map(merchant => <option key={merchant.id} value={merchant.organization_id}>{merchant.business_name}</option>)}
      </select>
      <Input aria-label="Message title" placeholder="Reminder or message title" value={messageTitle} onChange={event => setMessageTitle(event.target.value)} />
      <Textarea aria-label="Merchant message" placeholder="What does the merchant need to know or do?" value={messageBody} onChange={event => setMessageBody(event.target.value)} rows={4} />
      <Button disabled={busy || !merchantId || messageTitle.trim().length < 5 || messageBody.trim().length < 5} onClick={() => run(async () => {
        await sendJson('/api/platform/messages', 'POST', { organizationId: merchantId, title: messageTitle, message: messageBody });
        setMessageTitle(''); setMessageBody('');
      }, 'Message sent to merchant owners.')}>Send in-app message</Button>
    </CardContent></Card>}

    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="tt-section-title">{platform ? 'Cases' : 'Your business reports'} ({casePage?.count ?? 0})</h2>
      {platform && <select aria-label="Case status" className="tt-input" value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}>
        <option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="all">All</option>
      </select>}
    </div>
      {error && <p role="alert">{error.message} <Button variant="outline" onClick={() => refetch()}>Retry</Button></p>}
      {isLoading && <p>Loading cases…</p>}
      {!isLoading && !error && visible.length === 0 && <p className="tt-muted">No cases in this view.</p>}
      {visible.map(item => <Card key={item.id}><CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{item.title}</h3>
          <p className="text-xs tt-muted">{new Date(item.created_at).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })} · {item.source === 'sync' ? 'Automatic sync alert' : 'Reported by staff'}{platform ? ` · ${merchants.find(merchant => merchant.organization_id === item.organization_id)?.business_name || item.organization_id.slice(0, 8)}` : ''}</p></div>
          <Badge variant="outline">{item.status.replace('_', ' ')}</Badge></div>
        <p className="whitespace-pre-wrap break-words text-sm">{item.detail}</p>
        {item.owner_note && <div className="rounded-md border border-border p-3 text-sm"><strong>Platform response</strong><p className="mt-1 whitespace-pre-wrap">{item.owner_note}</p></div>}
        {platform && <div className="space-y-2 border-t border-border pt-3">
          <Textarea aria-label={`Response for ${item.title}`} placeholder="Response to merchant (optional)" value={notes[item.id] ?? ''} onChange={event => setNotes(previous => ({ ...previous, [item.id]: event.target.value }))} rows={3} />
          <div className="flex flex-wrap gap-2">{(['open', 'in_progress', 'resolved'] as const).map(status => <Button key={status} variant={status === item.status ? 'default' : 'outline'} size="sm" disabled={busy} onClick={() => run(async () => {
            await sendJson('/api/support/cases', 'PATCH', { id: item.id, status, ownerNote: notes[item.id]?.trim() || undefined });
            setNotes(previous => ({ ...previous, [item.id]: '' }));
          }, 'Case updated.')}>{status.replace('_', ' ')}</Button>)}</div>
        </div>}
      </CardContent></Card>)}
      <div className="flex items-center justify-end gap-3"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(previous => previous - 1)}>Previous</Button>
        <span className="text-sm tt-muted">Page {page + 1}</span><Button variant="outline" size="sm" disabled={(page + 1) * 25 >= (casePage?.count ?? 0)} onClick={() => setPage(previous => previous + 1)}>Next</Button></div>
    </section>
  </div>;
}
