'use client';
import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/store';
import { getDB } from '@/lib/offline/db';
import { autoMap, fields, mapRows, previewImport, type DuplicateMode, type ImportKind, type ImportRow, type PreviewRow } from '@/lib/imports/preview';
import { parseImportFile } from '@/lib/imports/parse';
import { executeImport, loadImportCatalog, type RowResult } from '@/lib/imports/execute';
import { csvCell } from '@/lib/accounting/reconciliation';
import { syncEngine } from '@/lib/offline/sync-engine';

export function ImportWorkbench({ initialRows, onApproved }: { initialRows?: ImportRow[]; onApproved?: (batch: string) => Promise<void> }) {
  const user = useAuthStore(s => s.user);
  const [kind, setKind] = useState<ImportKind>('products');
  const [source, setSource] = useState<ImportRow[]>(initialRows || []);
  const [mapping, setMapping] = useState<Record<string,string>>({});
  const [mode, setMode] = useState<DuplicateMode>('skip');
  const [warehouse, setWarehouse] = useState(''); const [warehouses, setWarehouses] = useState<any[]>([]);
  const [preview, setPreview] = useState<PreviewRow[]>([]); const [results, setResults] = useState<RowResult[]>([]);
  const [progress, setProgress] = useState(0); const [error, setError] = useState('');
  const [batchId, setBatchId] = useState(''); const [batches, setBatches] = useState<any[]>([]);
  const [reverseBatch, setReverseBatch] = useState(''); const [reason, setReason] = useState('');
  const headers = useMemo(() => Array.from(new Set(source.flatMap(Object.keys))),[source]);
  useEffect(() => { setMapping(autoMap(headers,kind)); setPreview([]); },[headers,kind]);
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
    const batch = crypto.randomUUID(); setBatchId(batch);
    await onApproved?.(batch);
    return executeImport({ batchId: batch, kind, mode, warehouseId: warehouse, org: user.organization_id, userId: user.id, role: user.role, rows: preview },setProgress);
  }, onSuccess: rows => { setResults(rows); void syncEngine?.sync(); void fetch('/api/imports').then(r => r.ok ? r.json() : []).then(setBatches).catch(() => {}); }, onError: e => setError(e.message) });
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
      setPreview(previewImport(mapRows(source,mapping),kind,mode,existing));
    } catch(e) { setError(e instanceof Error ? e.message : 'Preview failed'); }
  };
  const summary=Object.fromEntries(['create','update','skip','error'].map(k => [k,preview.filter(r => r.outcome === k).length]));
  const templateKey=`TracKasuwa-import-mapping:${user?.organization_id}:${kind}`;
  return <div className="space-y-4"><p>Upload → map columns → validate → preview → confirm. Offline previews are provisional; the server rechecks duplicates on sync.</p>
    <fieldset disabled={mutation.isPending} className="space-y-3">
      <label>Record type <select disabled={!!onApproved} className="border p-2" value={kind} onChange={e => setKind(e.target.value as ImportKind)}>{Object.keys(fields).filter(k => k !== 'staff_invites' || user?.role === 'business_owner').map(k => <option key={k} value={k}>{k.replaceAll('_',' ')}</option>)}</select></label>
      <input aria-label="CSV or Excel file" type="file" accept=".csv,.xlsx" onChange={async e => { const file=e.target.files?.[0]; if (!file) return; try { setSource(await parseImportFile(file)); setResults([]); } catch(error) { setError(error instanceof Error ? error.message : 'Could not parse file'); } }} />
      {kind === 'products' && <label>Opening-stock warehouse <select value={warehouse} onChange={e => {setWarehouse(e.target.value);setPreview([]);}} className="border p-2"><option value="">Choose warehouse</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}
      <label>Duplicates <select value={mode} onChange={e => {setMode(e.target.value as DuplicateMode);setPreview([]);}} className="border p-2"><option value="skip">Skip</option><option value="update">Update</option><option value="create">Create another record</option></select></label>
      {source.length > 0 && <><p>{source.length} rows loaded</p><div className="grid gap-2 sm:grid-cols-2">{fields[kind].map(field => <label key={field}>{field.replaceAll('_',' ')} <select className="border p-2" value={mapping[field] || ''} onChange={e => {setMapping({...mapping,[field]:e.target.value});setPreview([]);}}><option value="">Unmapped</option>{headers.map(h => <option key={h}>{h}</option>)}</select></label>)}</div>
        <button className="mr-4 underline" onClick={() => localStorage.setItem(templateKey,JSON.stringify(mapping))}>Save mapping template</button><button className="mr-4 underline" onClick={() => { try { const saved=localStorage.getItem(templateKey);if(saved)setMapping(JSON.parse(saved));setPreview([]); } catch {setError('Saved mapping is invalid');} }}>Load saved mapping</button><button className="border p-2" onClick={buildPreview}>Validate and preview</button></>}
    </fieldset>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {preview.length > 0 && <button className="underline" onClick={() => downloadResults(preview.map(r => ({ row_number: r.index, outcome: r.outcome, entity_id: r.id, error: r.errors.join('; ') })))}>Download full validation report</button>}
    {preview.length > 0 && <><p>{Object.entries(summary).map(([k,v]) => `${v} ${k}`).join(' · ')}</p><div className="max-h-96 overflow-auto"><table className="w-full text-sm"><thead><tr><th>Row</th><th>Result</th><th>Values</th><th>Errors</th></tr></thead><tbody>{preview.slice(0,200).map(r => <tr key={r.index}><td>{r.index}</td><td>{r.outcome}</td><td>{JSON.stringify(r.data)}</td><td>{r.errors.join('; ')}</td></tr>)}</tbody></table></div><p>Showing the first 200 rows; validation covers every row. Fix errors in the source file and upload again.</p><button disabled={mutation.isPending || summary.error > 0 || results.length > 0} className="border p-3" onClick={() => {setError('');mutation.mutate();}}>Confirm {preview.length} rows</button></>}
    {mutation.isPending && <p role="status">Processed {progress} / {preview.length} rows…</p>}
    {results.length > 0 && <p>Batch {batchId}: {results.length} row results. <button onClick={() => downloadResults()} className="underline">Download row-level report</button></p>}
    <details className="border p-3"><summary>Import history and audited reversal</summary><ul>{batches.map(b => <li key={b.id}>{b.kind} · {b.created_at} · {b.id} <button className="underline" onClick={async () => {const r=await fetch(`/api/imports?batch=${b.id}`);if(r.ok)downloadResults(await r.json());}}>Results</button> <button className="underline" onClick={() => setReverseBatch(b.id)}>Review reversal</button></li>)}</ul>
      {reverseBatch && <div><p>Reverse batch {reverseBatch}. Changed or consumed records will require reconciliation first.</p><label>Reason <input value={reason} onChange={e => setReason(e.target.value)} /></label><button disabled={reason.trim().length<3} onClick={async () => {try {const r=await fetch('/api/imports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reverse',batch_id:reverseBatch,reason,confirm:true})});const body=await r.json();if(!r.ok)throw new Error(body.error);setReverseBatch('');setReason('');}catch(e){setError(e instanceof Error?e.message:'Reversal failed');}}}>Confirm reversal</button><button onClick={() => setReverseBatch('')}>Cancel</button></div>}
    </details>
  </div>;
}
