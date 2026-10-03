'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AccessGuard } from '@/components/shared/access-guard';
import { ImportWorkbench } from '@/components/imports/import-workbench';
import { parseImportFile } from '@/lib/imports/parse';
import type { ImportRow } from '@/lib/imports/preview';
import type { Insight } from '@/lib/ai/types';

async function call(body: Record<string, unknown>) {
  const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
export default function AssistantPage() {
  const [text, setText] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<any>(null); const [preferences, setPreferences] = useState({ in_app: false, email: false, sms: false });
  const [proposal, setProposal] = useState<{ job: string; rows: ImportRow[] } | null>(null);
  const [report, setReport] = useState<{ job: string; insights: Insight[] } | null>(null);
  const [channel, setChannel] = useState('in_app'); const [notice, setNotice] = useState('');
  useEffect(() => { void fetch('/api/ai').then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); setStatus(data); setPreferences(data.preferences); }).catch(e => setError(e.message)); }, []);
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Assistant unavailable'); } finally { setBusy(false); } };
  return <AccessGuard allow={['business_owner','admin']}><div className="min-w-0 space-y-6 [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:h-auto [&_button]:min-h-11 [&_button]:py-2">
    <h1 className="tt-page-title">TracKasuwa assistant</h1>
    <p className="tt-muted text-sm">Prepare product imports and review insights from your business data.</p><p className="rounded-lg border border-border bg-muted p-4 text-sm">Preview mode: this assistant uses fixed rules, with no live AI model or external market data. Review every proposed change before confirming.</p>
    <p><Link className="text-sm font-medium text-primary underline underline-offset-4" href="/imports">Business imports</Link> · <Link className="text-sm font-medium text-primary underline underline-offset-4" href="/notifications">Notifications</Link></p>
    {busy && <p role="status" className="tt-muted text-sm">Working on your request?</p>}{!status && !error && <p role="status" className="tt-muted text-sm">Loading assistant preferences?</p>}{error && <p role="alert" className="text-destructive">{error}</p>}{notice && <p role="status">{notice}</p>}
    <fieldset disabled={busy || !status} className="min-w-0 space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6">
      <legend className="tt-section-title px-2">Bulk inventory draft</legend><p>Paste product data only, without customer or staff details. Use column headers or “product quantity price”.</p>
      <Input aria-label="Product CSV or Excel file" type="file" accept=".csv,.xlsx" onChange={e => { const file = e.target.files?.[0]; if (file) void run(async () => { const rows = await parseImportFile(file); const headers = Array.from(new Set(rows.flatMap(Object.keys))); setText([headers.join('\t'), ...rows.map(row => headers.map(h => String(row[h] ?? '').replace(/[\t\r\n]/g,' ')).join('\t'))].join('\n')); }); }} />
      <Textarea aria-label="Messy product data"  rows={7} value={text} onChange={e => setText(e.target.value)} />
      <Button  onClick={() => void run(async () => setProposal(await call({ action: 'inventory', text })))}>Propose mapped rows</Button>
    </fieldset>
    {proposal && <section className="space-y-3"><h2 className="tt-section-title">Review inventory proposal</h2><ImportWorkbench key={proposal.job} initialRows={proposal.rows} onApproved={async batch => { await call({ action: 'approve', job: proposal.job, batch, confirm: true }); }} /></section>}
    <fieldset disabled={busy || !status} className="min-w-0 space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6"><legend className="tt-section-title px-2">Business insights</legend>
      <Button  onClick={() => void run(async () => setReport(await call({ action: 'insights' })))}>Generate organization-only insights</Button>
      {report && <div className="space-y-3">{report.insights.map(i => <article key={i.title}><h3 className="font-semibold">{i.title}</h3><p>{i.message}</p></article>)}
        <label className="block min-w-0 space-y-2 text-sm font-medium">Deliver this preview to your profile <NativeSelect  value={channel} onChange={e => setChannel(e.target.value)}>{['in_app','email','sms'].map(c => <option key={c} value={c} disabled={!status?.channels[c]}>{c.replace('_',' ')}{!status?.channels[c] ? ' (disabled)' : ''}</option>)}</NativeSelect></label>
        <Button  onClick={() => void run(async () => { await call({ action: 'deliver', job: report.job, channel, confirm: true }); setNotice('Insight delivered.'); })}>Confirm and deliver displayed insights</Button>
      </div>}
    </fieldset>
    <fieldset disabled={busy || !status} className="min-w-0 space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6"><legend className="tt-section-title px-2">Your delivery opt-ins</legend>
      {(['in_app','email','sms'] as const).map(c => <label className="block" key={c}><input type="checkbox" checked={preferences[c]} disabled={!status?.channels[c]} onChange={e => setPreferences(p => ({ ...p, [c]: e.target.checked }))} /> {c.replace('_',' ')}{!status?.channels[c] ? ' — adapter not configured' : ''}</label>)}
      <Button  onClick={() => void run(async () => { await call({ action: 'preferences', ...preferences, confirm: true }); setNotice('Delivery preferences saved.'); })}>Confirm delivery preferences</Button>
      <p>Limits: 20 requests per hour; 5 deliveries per channel per hour. Each insight can be delivered once per channel.</p>
    </fieldset>
  </div></AccessGuard>;
}
