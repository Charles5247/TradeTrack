'use client';
import { TranslatedText, useCopy } from '@/i18n/text';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import { AccessGuard } from '@/components/shared/access-guard';
import { downloadTablePDF } from '@/lib/pdf/table-pdf';
import { csvCell } from '@/lib/accounting/reconciliation';

export default function AccountingPage() { return <AccessGuard allow={['business_owner', 'admin']}><Accounting /></AccessGuard>; }
function Accounting() {
  const copy = useCopy();
  const client = useQueryClient();
  const [report, setReport] = useState('daily');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [includeHistory, setIncludeHistory] = useState(false);
  const [action, setAction] = useState<any>(null); const [reason, setReason] = useState('');
  const [cashier, setCashier] = useState(''); const [opened, setOpened] = useState('');
  const [counted, setCounted] = useState<Record<string, string>>({ cash: '', transfer: '', pos_terminal: '', split: '', partial: '' });
  const [pending, setPending] = useState(false);
  const { data, error, isLoading } = useQuery({ queryKey: ['accounting', from, to, includeHistory], queryFn: async () => {
    const r = await fetch(`/api/accounting?from=${from}&to=${to}&include_history=${includeHistory}`); const body = await r.json(); if (!r.ok) throw new Error(body.error); return body;
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
  return <div className="min-w-0 space-y-6"><h1 className="tt-page-title"><TranslatedText text={"Accounting and reconciliation"} /></h1>
    <p className="tt-muted text-sm"><TranslatedText text={"Review sales, reconcile payments, and sign off cash-up periods."} /></p>
    <div className="flex flex-wrap gap-3"><Button asChild variant="outline"><Link href="/audit"><TranslatedText text={"Audit trail and exports"} /></Link></Button>
    <Button asChild variant="outline"><Link href="/imports"><TranslatedText text={"Import business data"} /></Link></Button></div>
    <label className="block"><input type="checkbox" checked={includeHistory} onChange={e => setIncludeHistory(e.target.checked)} />{" "}<TranslatedText text={"Include imported historical sales"} /></label>
    <Card><CardContent className="grid items-end gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-4"><label className="block min-w-0 space-y-2 text-sm font-medium"><TranslatedText text={"Report"} />{" "}<NativeSelect value={report} onChange={e => setReport(e.target.value)} >{Object.entries({ daily: 'Daily sales', mismatches: 'Vendor payment reconciliation', exceptions: 'Voids, discounts and adjustments', movements: 'Stock movements', closes: 'Cash-up closes', sales: 'Sales and reversals' }).map(([k,v]) => <option key={k} value={k}><TranslatedText text={v} /></option>)}</NativeSelect></label>
      <label className="block min-w-0 space-y-2 text-sm font-medium"><TranslatedText text={"From"} />{" "}<Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="block min-w-0 space-y-2 text-sm font-medium"><TranslatedText text={"To"} />{" "}<Input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={exportCSV}><TranslatedText text={"Export CSV"} /></Button><Button variant="outline" onClick={() => downloadTablePDF({ title: report, headers: columns, rows: rows.map(r => columns.map(k => text(r[k]))), filename: report })}><TranslatedText text={"Export PDF"} /></Button></div></CardContent></Card>
    {isLoading && <p><TranslatedText text={"Loading…"} /></p>}{error && <p role="alert">{error.message}</p>}
    <div className="overflow-auto"><table className="w-full min-w-[600px] text-sm tt-tabular [&_th]:bg-muted [&_th]:p-3 [&_th]:text-left [&_td]:border-b [&_td]:border-border [&_td]:p-3"><thead><tr>{columns.map(k => <th  key={k}>{k.replaceAll('_',' ')}</th>)}<th><TranslatedText text={"Action"} /></th></tr></thead><tbody>{rows.map((r,i) => <tr key={r.id || i}>{columns.map(k => <td key={k} className="max-w-sm border p-2 break-words">{text(r[k])}</td>)}<td>{report === 'mismatches' && r.sale_id && <Button onClick={() => setAction({ sale_id: r.sale_id, kind: 'vendor_payment_correction' })}><TranslatedText text={"Review correction"} /></Button>}{report === 'sales' && !r.imported && ['void','refund','return'].map(kind => <Button className="p-1 underline" key={kind} onClick={() => setAction({ sale_id: r.id, kind })}><TranslatedText text={kind} /></Button>)}</td></tr>)}</tbody></table></div>
    <details className="space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6"><summary className="min-h-11 cursor-pointer py-2 font-semibold"><TranslatedText text={"Close a cash-up period"} /></summary><p><TranslatedText text={"Owner/manager sign-off. Enter actual counted totals per payment method."} /></p>
      <label className="block min-w-0 space-y-2 text-sm font-medium"><TranslatedText text={"Cashier ID"} />{" "}<Input  value={cashier} onChange={e => setCashier(e.target.value)} /></label><label className="block min-w-0 space-y-2 text-sm font-medium"><TranslatedText text={"Opened"} />{" "}<Input type="datetime-local" value={opened} onChange={e => setOpened(e.target.value)} /></label>
      {Object.keys(counted).map(k => <label className="block" key={k}>{k} <Input type="number" min="0" step="0.01" value={counted[k]} onChange={e => setCounted({ ...counted, [k]: e.target.value })} /></label>)}
      <Button disabled={!cashier || !opened || Object.values(counted).some(v => v === '')} onClick={() => setAction({ action: 'close', cashier_id: cashier, opened_at: new Date(opened).toISOString(), counted: Object.fromEntries(Object.entries(counted).map(([k,v]) => [k, Number(v)])) })}><TranslatedText text={"Preview close"} /></Button></details>
    {!isLoading && !error && rows.length === 0 && <EmptyState title={copy("No entries for this report")} body={copy("Choose another report or date range. New business activity will appear here.")} />}
    <Dialog open={Boolean(action)} onOpenChange={open => { if (!open && !pending) setAction(null); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle><TranslatedText text={"Review permanent accounting entry"} /></DialogTitle><DialogDescription><TranslatedText text={"Check the entry and enter a reason before confirming. This action is recorded in your audit trail."} /></DialogDescription></DialogHeader>
        <dl className="space-y-3 rounded-lg bg-muted p-4 text-sm">{Object.entries(action || {}).map(([key,value]) => <div key={key} className="space-y-1"><dt className="tt-muted capitalize">{key.replaceAll('_',' ')}</dt><dd className="break-words font-medium">{text(value)}</dd></div>)}</dl>
        <label className="block space-y-2 text-sm font-medium"><TranslatedText text={"Reason"} />{" "}<Textarea value={reason} onChange={e => setReason(e.target.value)} /></label>
        <DialogFooter className="gap-2"><Button variant="outline" disabled={pending} onClick={() => setAction(null)}><TranslatedText text={"Cancel"} /></Button><Button disabled={pending || reason.trim().length < 3} onClick={confirm}><TranslatedText text={pending ? 'Saving…' : 'Confirm and sign'} /></Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
