'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import { AccessGuard } from '@/components/shared/access-guard';
import { downloadTablePDF } from '@/lib/pdf/table-pdf';
import { csvCell } from '@/lib/accounting/reconciliation';

export default function AccountingPage() { return <AccessGuard allow={['business_owner', 'admin']}><Accounting /></AccessGuard>; }
function Accounting() {
  const client = useQueryClient();
  const [report, setReport] = useState('daily');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [action, setAction] = useState<any>(null); const [reason, setReason] = useState('');
  const [cashier, setCashier] = useState(''); const [opened, setOpened] = useState('');
  const [counted, setCounted] = useState<Record<string, string>>({ cash: '', transfer: '', pos_terminal: '', split: '', partial: '' });
  const [pending, setPending] = useState(false);
  const { data, error, isLoading } = useQuery({ queryKey: ['accounting', from, to], queryFn: async () => {
    const r = await fetch(`/api/accounting?from=${from}&to=${to}`); const body = await r.json(); if (!r.ok) throw new Error(body.error); return body;
  } });
  const rows: Record<string, any>[] = data?.[report] || [];
  const columns = Array.from(new Set(rows.flatMap(Object.keys)));
  const text = (v: unknown) => typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
  const exportCSV = () => {
    const url = URL.createObjectURL(new Blob([[columns.map(csvCell).join(','), ...rows.map(r => columns.map(k => csvCell(r[k])).join(','))].join('\r\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `${report}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const confirm = async () => {
    setPending(true);
    try { const r = await fetch('/api/accounting', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...action, reason, confirm: true }) }); const body = await r.json(); if (!r.ok) throw new Error(body.error); toast.success('Accounting entry recorded'); setAction(null); setReason(''); await client.invalidateQueries({ queryKey: ['accounting'] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); } finally { setPending(false); }
  };
  return <div className="space-y-4 p-4"><h1 className="text-2xl font-semibold">Accounting and reconciliation</h1>
    <Link href="/audit" className="underline">Audit trail and exports</Link>
    <div className="flex flex-wrap gap-3"><label>Report <select value={report} onChange={e => setReport(e.target.value)} className="border p-2">{Object.entries({ daily: 'Daily sales', mismatches: 'Vendor payment reconciliation', exceptions: 'Voids, discounts and adjustments', movements: 'Stock movements', closes: 'Cash-up closes', sales: 'Sales and reversals' }).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>To <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
      <button onClick={exportCSV}>Export CSV</button><button onClick={() => downloadTablePDF({ title: report, headers: columns, rows: rows.map(r => columns.map(k => text(r[k]))), filename: report })}>Export PDF</button></div>
    {isLoading && <p>Loading…</p>}{error && <p role="alert">{error.message}</p>}
    <div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{columns.map(k => <th className="border p-2" key={k}>{k.replaceAll('_',' ')}</th>)}<th>Action</th></tr></thead><tbody>{rows.map((r,i) => <tr key={r.id || i}>{columns.map(k => <td key={k} className="max-w-sm border p-2 break-words">{text(r[k])}</td>)}<td>{report === 'mismatches' && r.sale_id && <button onClick={() => setAction({ sale_id: r.sale_id, kind: 'vendor_payment_correction' })}>Review correction</button>}{report === 'sales' && ['void','refund','return'].map(kind => <button className="p-1 underline" key={kind} onClick={() => setAction({ sale_id: r.id, kind })}>{kind}</button>)}</td></tr>)}</tbody></table></div>
    <details className="border p-4"><summary>Close a cash-up period</summary><p>Owner/manager sign-off. Enter actual counted totals per payment method.</p>
      <label>Cashier ID <input className="border p-2" value={cashier} onChange={e => setCashier(e.target.value)} /></label><label>Opened <input type="datetime-local" value={opened} onChange={e => setOpened(e.target.value)} /></label>
      {Object.keys(counted).map(k => <label className="block" key={k}>{k} <input type="number" min="0" step="0.01" value={counted[k]} onChange={e => setCounted({ ...counted, [k]: e.target.value })} /></label>)}
      <button disabled={!cashier || !opened || Object.values(counted).some(v => v === '')} onClick={() => setAction({ action: 'close', cashier_id: cashier, opened_at: new Date(opened).toISOString(), counted: Object.fromEntries(Object.entries(counted).map(([k,v]) => [k, Number(v)])) })}>Preview close</button></details>
    {action && <section role="dialog" aria-label="Confirm accounting entry" className="border bg-muted p-4"><h2>Review permanent accounting entry</h2><pre className="overflow-auto">{JSON.stringify(action,null,2)}</pre><label>Reason <textarea className="block w-full border" value={reason} onChange={e => setReason(e.target.value)} /></label><button disabled={pending || reason.trim().length < 3} onClick={confirm}>Confirm and sign</button><button disabled={pending} onClick={() => setAction(null)}>Cancel</button></section>}
  </div>;
}
