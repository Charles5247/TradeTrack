'use client';
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
  return <AccessGuard allow={['business_owner','admin']}><div className="space-y-5 p-4">
    <h1 className="text-2xl font-semibold">TracKasuwa assistant</h1>
    <p>Stub provider: suggestions use your business data only. No external market data or live model is connected. Review every proposed change before confirming.</p>
    <p><Link className="underline" href="/imports">Business imports</Link> · <Link className="underline" href="/notifications">Notifications</Link></p>
    {error && <p role="alert" className="text-red-700">{error}</p>}{notice && <p role="status">{notice}</p>}
    <fieldset disabled={busy || !status} className="space-y-3 border p-4">
      <legend>Bulk inventory draft</legend><p>Paste product data only, without customer or staff details. The stub recognizes column headers or “product quantity price”.</p>
      <input aria-label="Product CSV or Excel file" type="file" accept=".csv,.xlsx" onChange={e => { const file = e.target.files?.[0]; if (file) void run(async () => { const rows = await parseImportFile(file); const headers = Array.from(new Set(rows.flatMap(Object.keys))); setText([headers.join('\t'), ...rows.map(row => headers.map(h => String(row[h] ?? '').replace(/[\t\r\n]/g,' ')).join('\t'))].join('\n')); }); }} />
      <textarea aria-label="Messy product data" className="block w-full border p-2" rows={7} value={text} onChange={e => setText(e.target.value)} />
      <button className="border p-2" onClick={() => void run(async () => setProposal(await call({ action: 'inventory', text })))}>Propose mapped rows</button>
    </fieldset>
    {proposal && <section className="space-y-3"><h2 className="text-xl">Review inventory proposal</h2><ImportWorkbench key={proposal.job} initialRows={proposal.rows} onApproved={async batch => { await call({ action: 'approve', job: proposal.job, batch, confirm: true }); }} /></section>}
    <fieldset disabled={busy || !status} className="space-y-3 border p-4"><legend>Business insights</legend>
      <button className="border p-2" onClick={() => void run(async () => setReport(await call({ action: 'insights' })))}>Generate organization-only insights</button>
      {report && <div className="space-y-3">{report.insights.map(i => <article key={i.title}><h3 className="font-semibold">{i.title}</h3><p>{i.message}</p></article>)}
        <label>Deliver this preview to your profile <select className="border p-2" value={channel} onChange={e => setChannel(e.target.value)}>{['in_app','email','sms'].map(c => <option key={c} value={c} disabled={!status?.channels[c]}>{c.replace('_',' ')}{!status?.channels[c] ? ' (disabled)' : ''}</option>)}</select></label>
        <button className="border p-2" onClick={() => void run(async () => { await call({ action: 'deliver', job: report.job, channel, confirm: true }); setNotice('Insight delivered.'); })}>Confirm and deliver displayed insights</button>
      </div>}
    </fieldset>
    <fieldset disabled={busy || !status} className="space-y-3 border p-4"><legend>Your delivery opt-ins</legend>
      {(['in_app','email','sms'] as const).map(c => <label className="block" key={c}><input type="checkbox" checked={preferences[c]} disabled={!status?.channels[c]} onChange={e => setPreferences(p => ({ ...p, [c]: e.target.checked }))} /> {c.replace('_',' ')}{!status?.channels[c] ? ' — adapter not configured' : ''}</label>)}
      <button className="border p-2" onClick={() => void run(async () => { await call({ action: 'preferences', ...preferences, confirm: true }); setNotice('Delivery preferences saved.'); })}>Confirm delivery preferences</button>
      <p>Limits: 20 requests per hour; 5 deliveries per channel per hour. Each insight can be delivered once per channel.</p>
    </fieldset>
  </div></AccessGuard>;
}
