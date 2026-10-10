'use client';
import { TranslatedLabel, TranslatedText } from '@/i18n/text';


import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Printer, RefreshCw, Download, Bell, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { usePrinter } from '@/hooks/use-printer';
import { useOrgStore, useSyncStore } from '@/store';
import { syncEngine } from '@/lib/offline/sync-engine';
import { getPendingSyncItems } from '@/lib/offline/db';
import { formatDateTime } from '@/lib/utils/format';

export function OperationsSettings({ section }: { section: 'receipts' | 'devices' | 'sync' | 'notifications' | 'export' }) {
  const printer = usePrinter();
  const org = useOrgStore();
  const sync = useSyncStore();
  const [pending, setPending] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function refresh() {
    setBusy(true); setError('');
    try { await syncEngine?.sync(); setPending((await getPendingSyncItems()).length); }
    catch (e) { setError((e as Error).message || 'Offline storage is unavailable. Try again.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (section !== 'sync') return;
    let disposed = false;
    void getPendingSyncItems().then(items => { if (!disposed) setPending(items.length); }).catch(() => { if (!disposed) setError('Could not read pending changes.'); });
    return () => { disposed = true; };
  }, [section]);
  if (section === 'devices') return <Card><CardHeader><CardTitle><TranslatedText text={"Devices & printers"} /></CardTitle><CardDescription><TranslatedText text={"Pair a receipt printer with this browser. Connect it again from the receipt screen when you are ready to print."} /></CardDescription></CardHeader><CardContent className="space-y-5"><div className="flex items-center gap-3 rounded-lg border p-4"><Printer className="h-7 w-7 text-primary" /><div><p className="font-semibold">{printer.deviceName || 'No printer connected'}</p><p className="text-sm capitalize text-muted-foreground">{printer.status}</p></div></div>{printer.error && <p role="alert" className="text-destructive">{printer.error}</p>}<div className="flex flex-wrap gap-3"><Button disabled={!printer.usbSupported || printer.status === 'connecting' || printer.isConnected} onClick={printer.connectUsb}><TranslatedText text={"Connect USB"} /></Button><Button variant="outline" disabled={!printer.bluetoothSupported || printer.status === 'connecting' || printer.isConnected} onClick={printer.connectBluetooth}><TranslatedText text={"Connect Bluetooth"} /></Button>{printer.isConnected && <Button variant="ghost" onClick={printer.disconnect}><TranslatedText text={"Disconnect"} /></Button>}</div><p className="text-sm text-muted-foreground"><TranslatedText text={"Browser printing and downloadable PDF receipts remain available when USB or Bluetooth is unsupported."} /></p></CardContent></Card>;
  if (section === 'sync') return <Card><CardHeader><CardTitle><TranslatedText text={"Offline sync"} /></CardTitle><CardDescription><TranslatedText text={"Your sales and stock changes stay on this device until they sync."} /></CardDescription></CardHeader><CardContent className="space-y-5"><dl className="grid gap-4 sm:grid-cols-3">{[['Pending changes', pending === null ? 'Checking…' : pending], ['Status', sync.syncStatus], ['Last synced', sync.lastSync ? formatDateTime(sync.lastSync) : 'Not yet synced']].map(([label, value]) => <div key={label} className="rounded-lg bg-muted p-4"><dt className="text-xs text-muted-foreground"><TranslatedLabel>{label}</TranslatedLabel></dt><dd className="mt-2 font-semibold">{value}</dd></div>)}</dl>{error && <p role="alert" className="text-destructive">{error}</p>}<Button onClick={refresh} disabled={busy}><RefreshCw className={busy ? 'animate-spin' : ''} /><TranslatedText text={busy ? 'Syncing…' : 'Sync now'} /></Button><p className="text-xs text-muted-foreground"><TranslatedText text={"Keep this tab open while syncing. Clearing browser storage removes changes that have not reached the server."} /></p></CardContent></Card>;
  if (section === 'receipts') return <div className="grid gap-5 xl:grid-cols-[1fr_320px]"><Card><CardHeader><CardTitle><TranslatedText text={"Receipt template"} /></CardTitle><CardDescription><TranslatedText text={"Your business profile supplies the receipt header. Saved sales retain their original totals and payment details."} /></CardDescription></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground"><TranslatedText text={"The standard invoice includes item quantities, prices, discount, tax, payment, change and a scannable receipt code."} /></p><Button asChild><Link href="/receipts"><ReceiptText /><TranslatedText text={"View & print receipts"} /></Link></Button></CardContent></Card><Card className="p-6 font-mono text-xs"><p className="text-center font-bold">{org.organizationName}</p><p className="text-center">{org.organizationAddress}</p><p className="text-center">{org.organizationPhone}</p><div className="my-5 border-y border-dashed py-3 text-center"><TranslatedText text={"RECEIPT PREVIEW"} /></div><p className="flex justify-between"><span><TranslatedText text={"Item × 1"} /></span><span>₦1,000</span></p><p className="mt-5 flex justify-between border-t border-dashed pt-4 font-bold"><span><TranslatedText text={"Total"} /></span><span>₦1,000</span></p><p className="mt-8 text-center"><TranslatedText text={"Thank you for your purchase"} /></p></Card></div>;
  if (section === 'notifications') return <Card><CardHeader><CardTitle><TranslatedText text={"Notifications"} /></CardTitle><CardDescription><TranslatedText text={"Review stock alerts, subscription updates and team activity in one place."} /></CardDescription></CardHeader><CardContent><Button asChild><Link href="/notifications"><Bell /><TranslatedText text={"Manage notifications"} /></Link></Button></CardContent></Card>;
  return <Card><CardHeader><CardTitle><TranslatedText text={"Data & export"} /></CardTitle><CardDescription><TranslatedText text={"Download your business records using the filters on each report."} /></CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{[{href:'/reports', title:'Sales & financial reports'}, {href:'/inventory',title:'Inventory & stock'}, {href:'/audit',title:'Audit trail'}, {href:'/imports',title:'Import products'}].map(item => <Link className="flex items-center justify-between rounded-lg border p-4 hover:border-primary hover:bg-primary/5" key={item.href} href={item.href}><TranslatedLabel>{item.title}</TranslatedLabel><Download className="h-4 w-4 text-muted-foreground" /></Link>)}</CardContent></Card>;
}
