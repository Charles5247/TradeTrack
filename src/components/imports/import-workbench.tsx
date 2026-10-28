'use client';
import { TranslatedText, useCopy } from '@/i18n/text';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/store';
import { getDB } from '@/lib/offline/db';
import { fields, mapRows, previewImport, type DuplicateMode, type ImportKind, type ImportRow, type PreviewRow } from '@/lib/imports/preview';
import { autoMapLegacy, detectSource, cleanProducts, cleanSales, type DateOrder } from '@/lib/imports/normalize';
import { parseImportFile } from '@/lib/imports/parse';
import { executeImport, loadImportCatalog, type RowResult } from '@/lib/imports/execute';
import { csvCell } from '@/lib/accounting/reconciliation';
import { syncEngine } from '@/lib/offline/sync-engine';

export function ImportWorkbench({ initialRows, onApproved }: { initialRows?: ImportRow[]; onApproved?: (batch: string) => Promise<void> }) {
  const copy = useCopy();
  const user = useAuthStore(s => s.user);
  const [kind, setKind] = useState<ImportKind>('products');
  const [source, setSource] = useState<ImportRow[]>(initialRows || []);
  const [mapping, setMapping] = useState<Record<string,string>>({});
  const [dateOrder, setDateOrder] = useState<DateOrder>('unknown');
  const [utcOffset, setUtcOffset] = useState('');
  const [paymentMap, setPaymentMap] = useState<Record<string,string>>({});
  const [mode, setMode] = useState<DuplicateMode>('skip');
  const [warehouse, setWarehouse] = useState(''); const [warehouses, setWarehouses] = useState<any[]>([]);
  const [preview, setPreview] = useState<PreviewRow[]>([]); const [results, setResults] = useState<RowResult[]>([]);
  const [progress, setProgress] = useState(0); const [error, setError] = useState('');
  const [batchId, setBatchId] = useState(''); const [batches, setBatches] = useState<any[]>([]);
  const [reverseBatch, setReverseBatch] = useState(''); const [reason, setReason] = useState('');
  const headers = useMemo(() => Array.from(new Set(source.flatMap(Object.keys))),[source]);
  useEffect(() => { setMapping(autoMapLegacy(headers,kind)); setPreview([]); },[headers,kind]);
  useEffect(() => { if (initialRows) { setSource(initialRows); setKind('products'); } },[initialRows]);
  useEffect(() => {
    if (!user?.organization_id) return;
    void getDB().then(db => db.getAll('warehouses')).then(rows => setWarehouses(rows.filter(r => r.organization_id === user.organization_id)));
    void fetch('/api/imports?kind=warehouses').then(async r => { if (r.ok) setWarehouses(await r.json()); }).catch(() => {});
    void fetch('/api/imports').then(r => r.ok ? r.json() : []).then(setBatches).catch(() => {});
  },[user?.organization_id]);
  const mutation = useMutation({ networkMode: 'always', mutationFn: async () => {
    if (!user?.organization_id) throw new Error('Business membership required');
    if (!preview.length) throw new Error('Create a preview first');
    if (preview.some(r=>r.fixes?.some(f=>f.severity==='review') && !r.reviewAccepted)) throw new Error('Review the proposed changes first');
    const batch = crypto.randomUUID(); setBatchId(batch);
    await onApproved?.(batch);
    return executeImport({ batchId: batch, kind, mode, warehouseId: warehouse, org: user.organization_id, userId: user.id, role: user.role, rows: preview },setProgress);
  }, onSuccess: rows => { setResults(rows); void syncEngine?.sync(); void fetch('/api/imports').then(r => r.ok ? r.json() : []).then(setBatches).catch(() => {}); }, onError: e => setError(e.message) });
  const downloadChanges = () => {
    const csv = [['row','original','imported','fixes','blocked'].join(','),...preview.map(r=>[r.index,JSON.stringify(r.original),JSON.stringify(r.data),JSON.stringify(r.fixes),r.errors.join('; ')].map(csvCell).join(','))].join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='import-change-log.csv';a.click();URL.revokeObjectURL(url);
  };
  const downloadResults = (rows = results) => {
    const columns = ['row_number','outcome','entity_id','error'];
    const csv = [columns.join(','), ...rows.map(r => columns.map(k => csvCell((r as any)[k])).join(','))].join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=`import-${batchId || 'results'}.csv`;a.click();URL.revokeObjectURL(url);
  };
  const buildPreview = async () => {
    setError('');setResults([]);
    try {
      if (!user?.organization_id) throw new Error('Business membership required');
      if (kind === 'products' && !warehouse) throw new Error('Choose a warehouse for opening stock');
      const existing=await loadImportCatalog(kind,user.organization_id);
      const cleaned = kind === 'products' ? cleanProducts(source,mapping,headers.find(h => /^item.?id$/i.test(h))) : kind === 'historical_sales' ? cleanSales(source,mapping,{dateOrder:dateOrder === 'unknown' ? undefined : dateOrder,utcOffset:utcOffset || '+01:00',paymentMap}) : null;
      const rows = previewImport(cleaned ? cleaned.map(r=>r.data) : mapRows(source,mapping),kind,mode,existing);
      setPreview(rows.map((r,i)=> { const c=cleaned?.[i]; if(!c)return r; const errors=[...r.errors,...c.blocked,...(kind==='historical_sales' && !utcOffset ? ['Choose the source time zone'] : [])]; return {...r,original:c.original,fixes:c.fixes,blocked:c.blocked,errors,outcome:errors.length?'error':r.outcome}; }));
    } catch(e) { setError(e instanceof Error ? e.message : 'Preview failed'); }
  };
  const summary=Object.fromEntries(['create','update','skip','error'].map(k => [k,preview.filter(r => r.outcome === k).length]));
  const templateKey=`TracKasuwa-import-mapping:${user?.organization_id}:${kind}`;
  return <div className="min-w-0 space-y-6 [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:h-auto [&_button]:min-h-11 [&_button]:py-2"><p className="text-sm tt-muted"><TranslatedText text={"Upload → map columns → validate → preview → confirm. Offline previews are provisional; the server rechecks duplicates on sync."} /></p>
    <fieldset disabled={mutation.isPending} className="space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6"><legend className="tt-section-title px-2"><TranslatedText text={"Upload and map your data"} /></legend>
      <label className="block min-w-0 space-y-2 text-sm font-medium"><TranslatedText text={"Record type"} />{" "}<NativeSelect disabled={!!onApproved}  value={kind} onChange={e => setKind(e.target.value as ImportKind)}>{Object.keys(fields).filter(k => k !== 'staff_invites' || user?.role === 'business_owner').map(k => <option key={k} value={k}>{k.replaceAll('_',' ')}</option>)}</NativeSelect></label>
      <Input aria-label={copy("CSV or Excel file")} type="file" accept=".csv,.xlsx" onChange={async e => { const file=e.target.files?.[0]; if (!file) return; try { setSource(await parseImportFile(file)); setResults([]); } catch(error) { setError(error instanceof Error ? error.message : 'Could not parse file'); } }} />
      {kind === 'products' && <label className="block min-w-0 space-y-2 text-sm font-medium"><TranslatedText text={"Opening-stock warehouse"} />{" "}<NativeSelect value={warehouse} onChange={e => {setWarehouse(e.target.value);setPreview([]);}} ><option value=""><TranslatedText text={"Choose warehouse"} /></option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</NativeSelect></label>}
      <label className="block min-w-0 space-y-2 text-sm font-medium"><TranslatedText text={"Duplicates"} />{" "}<NativeSelect value={mode} onChange={e => {setMode(e.target.value as DuplicateMode);setPreview([]);}} ><option value="skip"><TranslatedText text={"Skip"} /></option><option value="update"><TranslatedText text={"Update"} /></option><option value="create"><TranslatedText text={"Create another record"} /></option></NativeSelect></label>
      {kind === 'historical_sales' && <div className="space-y-2"><label>Date order<NativeSelect value={dateOrder} onChange={e=>{setDateOrder(e.target.value as DateOrder);setPreview([]);}}><option value="unknown">Detect from whole column</option><option value="dmy">Day / month / year</option><option value="mdy">Month / day / year</option></NativeSelect></label><label>Source time zone<NativeSelect value={utcOffset} onChange={e=>{setUtcOffset(e.target.value);setPreview([]);}}><option value="">Choose time zone</option><option value="+01:00">Nigeria (UTC+01:00)</option><option value="+00:00">UTC</option></NativeSelect></label></div>}
      {source.length > 0 && <><p>Source: {detectSource(headers) === 'phppos' ? 'PHP Point of Sale' : 'Generic export'}</p><p>{source.length}{" "}<TranslatedText text={"rows loaded"} /></p><div className="grid gap-2 sm:grid-cols-2">{fields[kind].map(field => <label key={field}>{field.replaceAll('_',' ')} <NativeSelect  value={mapping[field] || ''} onChange={e => {setMapping({...mapping,[field]:e.target.value});setPreview([]);}}><option value=""><TranslatedText text={"Unmapped"} /></option>{headers.map(h => <option key={h}>{h}</option>)}</NativeSelect></label>)}</div>
        <Button variant="outline" className="mr-2 mb-2" onClick={() => localStorage.setItem(templateKey,JSON.stringify(mapping))}><TranslatedText text={"Save mapping template"} /></Button><Button variant="outline" className="mr-2 mb-2" onClick={() => { try { const saved=localStorage.getItem(templateKey);if(saved)setMapping(JSON.parse(saved));setPreview([]); } catch {setError('Saved mapping is invalid');} }}><TranslatedText text={"Load saved mapping"} /></Button><Button  onClick={buildPreview}><TranslatedText text={"Validate and preview"} /></Button></>}
    </fieldset>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {preview.length > 0 && <Button variant="outline" onClick={() => downloadResults(preview.map(r => ({ row_number: r.index, outcome: r.outcome, entity_id: r.id, error: r.errors.join('; ') })))}><TranslatedText text={"Download full validation report"} /></Button>}
    {preview.length > 0 && <><p>{preview.filter(r=>r.fixes?.some(f=>f.severity==='auto')).length} rows auto-fixed, {preview.filter(r=>r.errors.length || (r.fixes?.some(f=>f.severity==='review')&&!r.reviewAccepted)).length} need your decision</p><Button variant="outline" onClick={downloadChanges}>Download change log</Button><ul>{Object.entries(preview.flatMap(r=>r.fixes || []).reduce<Record<string,number>>((counts,f)=>({...counts,[f.reason]:(counts[f.reason]||0)+1}),{})).map(([reason,count])=><li key={reason}>{count}: {reason}</li>)}</ul>{Array.from(new Set(preview.flatMap(r=>r.blocked || []).map(b=>/unrecognised "([^"]+)"/.exec(b)?.[1]).filter((v):v is string=>!!v))).map(label=><label key={label}>Map payment: {label}<NativeSelect value={paymentMap[label]||''} onChange={e=>{setPaymentMap({...paymentMap,[label]:e.target.value});setPreview([]);}}><option value="">Choose method then rebuild preview</option>{['cash','transfer','pos_terminal','split','partial'].map(method=><option key={method}>{method}</option>)}</NativeSelect></label>)}<p>{Object.entries(summary).map(([k,v]) => `${v} ${k}`).join(' · ')}</p><div className="max-h-96 overflow-auto"><table className="w-full min-w-[600px] text-sm tt-tabular [&_th]:bg-muted [&_th]:p-3 [&_th]:text-left [&_td]:border-b [&_td]:border-border [&_td]:p-3"><thead><tr><th><TranslatedText text={"Row"} /></th><th><TranslatedText text={"Result"} /></th><th><TranslatedText text={"Values"} /></th><th><TranslatedText text={"Errors"} /></th></tr></thead><tbody>{preview.slice(0,200).map(r => <tr key={r.index}><td>{r.index}</td><td>{r.outcome}</td><td><dl className="min-w-48 space-y-1">{Object.entries(r.data).map(([key,value]) => <div key={key}><dt className="inline tt-muted capitalize">{key.replaceAll("_"," ")}: </dt><dd className="inline break-words">{String(value ?? "")}</dd></div>)}</dl></td><td>{r.errors.join('; ')}{r.original && <details><summary>Original source and changes</summary><pre className="max-w-sm whitespace-pre-wrap">{JSON.stringify(r.original,null,2)}</pre><ul>{r.fixes?.map((f,i)=><li key={i}>{f.field}: {f.from} ? {f.to} ? {f.reason}</li>)}</ul></details>}{r.fixes?.some(f=>f.severity==='review') && <label><input type="checkbox" checked={!!r.reviewAccepted} onChange={e=>setPreview(rows=>rows.map(row=>row.index===r.index?{...row,reviewAccepted:e.target.checked}:row))} /> Accept reviewed changes for this row</label>}</td></tr>)}</tbody></table></div><p><TranslatedText text={"Showing the first 200 rows; validation covers every row. Fix errors in the source file and upload again."} /></p><Button disabled={mutation.isPending || summary.error > 0 || preview.some(r=>r.fixes?.some(f=>f.severity==='review') && !r.reviewAccepted) || results.length > 0}  onClick={() => {setError('');mutation.mutate();}}><TranslatedText text={"Confirm"} />{" "}{preview.length}{" "}<TranslatedText text={"rows"} /></Button></>}
    {mutation.isPending && <p role="status"><TranslatedText text={"Processed"} />{" "}{progress} / {preview.length}{" "}<TranslatedText text={"rows…"} /></p>}
    {results.length > 0 && <p><TranslatedText text={"Batch"} />{" "}{batchId}: {results.length}{" "}<TranslatedText text={"row results."} />{" "}<Button onClick={() => downloadResults()} variant="outline"><TranslatedText text={"Download row-level report"} /></Button></p>}
    <details className="space-y-4 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-6"><summary className="min-h-11 cursor-pointer py-2 font-semibold"><TranslatedText text={"Import history and audited reversal"} /></summary>{batches.length === 0 && <p className="tt-muted text-sm"><TranslatedText text={"No import history loaded. Completed batches appear here when online."} /></p>}<ul className="space-y-4">{batches.map(b => <li className="space-y-2 break-words rounded-lg border border-border p-3 text-sm" key={b.id}>{b.kind} · {b.created_at} · {b.id} <Button variant="outline" onClick={async () => {const r=await fetch(`/api/imports?batch=${b.id}`);if(r.ok)downloadResults(await r.json());}}><TranslatedText text={"Results"} /></Button> <Button variant="outline" onClick={() => setReverseBatch(b.id)}><TranslatedText text={"Review reversal"} /></Button></li>)}</ul>
      {reverseBatch && <div className="space-y-4 rounded-lg border border-border bg-muted p-4 break-words"><p><TranslatedText text={"Reverse batch"} />{" "}{reverseBatch}<TranslatedText text={". Changed or consumed records will require reconciliation first."} /></p><label className="block min-w-0 space-y-2 text-sm font-medium"><TranslatedText text={"Reason"} />{" "}<Input value={reason} onChange={e => setReason(e.target.value)} /></label><Button disabled={reason.trim().length<3} onClick={async () => {try {const r=await fetch('/api/imports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reverse',batch_id:reverseBatch,reason,confirm:true})});const body=await r.json();if(!r.ok)throw new Error(body.error);setReverseBatch('');setReason('');}catch(e){setError(e instanceof Error?e.message:'Reversal failed');}}}><TranslatedText text={"Confirm reversal"} /></Button><Button variant="outline" className="ml-2" onClick={() => setReverseBatch('')}><TranslatedText text={"Cancel"} /></Button></div>}
    </details>
  </div>;
}
