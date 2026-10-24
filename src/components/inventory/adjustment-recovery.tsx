'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store';
import { accountIdentity, getAccountRevision } from '@/lib/auth/account-state';
import { getDB, type SyncQueueRecord } from '@/lib/offline/db';
import { postSavedAdjustment } from '@/lib/offline/inventory-adjustment';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export function AdjustmentRecovery() {
  const user=useAuthStore(state=>state.user);
  return <Workspace key={accountIdentity(user)} />;
}
function Workspace() {
  const user=useAuthStore(state=>state.user), cache=useQueryClient();
  const [selected,setSelected]=useState<SyncQueueRecord|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const [page,setPage]=useState(0);
  const {data:entries=[],isError,refetch}=useQuery({queryKey:['adjustment-recovery',user?.organization_id,user?.id],
    enabled:!!user?.organization_id && ['business_owner','admin'].includes(user.role),refetchInterval:15000,
    queryFn:async()=>{
      const rows=await (await getDB()).getAllFromIndex('sync_queue','by-table','inventory_adjustment_commands') as SyncQueueRecord[];
      return rows.filter(row=>row.status!=='synced' && row.payload.organization_id===user?.organization_id);
    }});
  if(!entries.length && !isError) return null;
  async function retry() {
    if(!selected) return;
    const revision=getAccountRevision(); setBusy(true);setError(null);
    try {
      if(!navigator.onLine) throw new Error('Connect to the internet to retry this adjustment.');
      await postSavedAdjustment(await getDB(),selected,undefined,revision);
      if(revision!==getAccountRevision()) return;
      setSelected(null); await cache.invalidateQueries();
    } catch(failure) {if(revision===getAccountRevision()) setError(failure instanceof Error ? failure.message : 'Adjustment needs review.');}
    finally {setBusy(false);}
  }
  return <section aria-label="Saved stock adjustments" className="rounded-lg border border-border p-4 space-y-3">
    <h2 className="font-medium">Saved stock adjustments awaiting confirmation</h2>
    {isError && <p role="alert">Could not read saved adjustments. <Button variant="outline" onClick={()=>void refetch()}>Retry loading</Button></p>}
    <ul className="space-y-2">{entries.slice(page*10,page*10+10).map(entry=><li key={entry.id} className="flex flex-wrap justify-between gap-2">
      <span className="text-sm">{String(entry.payload.reason)} · {String(entry.payload.quantity_change)} units</span>
      <Button variant="outline" onClick={()=>{setError(null);setSelected(entry);}}>Review adjustment</Button>
    </li>)}</ul>
    {entries.length>10 && <div className="flex gap-3"><Button variant="outline" disabled={!page} onClick={()=>setPage(page-1)}>Previous adjustments</Button><Button variant="outline" disabled={(page+1)*10>=entries.length} onClick={()=>setPage(page+1)}>Next adjustments</Button></div>}
    <Dialog open={!!selected} onOpenChange={open=>{if(!open && !busy)setSelected(null);}}><DialogContent>
      <DialogHeader><DialogTitle>Review saved stock adjustment</DialogTitle><DialogDescription>Retry this original adjustment once connectivity or validation issues are resolved. A confirmed adjustment is never applied twice.</DialogDescription></DialogHeader>
      <p>Reason: {String(selected?.payload.reason ?? '')}</p><p>Stock change: {String(selected?.payload.quantity_change ?? '')} units</p>
      <p className="text-sm text-muted-foreground">{selected?.error}</p>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <Button disabled={busy} onClick={()=>void retry()}>{busy ? 'Checking adjustment…' : 'Retry saved adjustment'}</Button>
    </DialogContent></Dialog>
  </section>;
}
