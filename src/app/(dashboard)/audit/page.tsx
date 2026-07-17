'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ClipboardList, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import { formatDateTime } from '@/lib/utils/format';
import type { AuditLog } from '@/types';
import { useI18n } from '@/i18n';

async function fetchAuditLogs(search: string, resourceType: string, startDate: string, endDate: string) {
  const supabase = createClient();
  let query = supabase
    .from('audit_logs')
    .select('*, user:users(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (resourceType && resourceType !== 'all') query = query.eq('resource_type', resourceType);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate + 'T23:59:59');

  const { data, error } = await query;
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logs = (data as any) as AuditLog[];
  if (search) {
    return logs.filter((l) =>
      l.action?.toLowerCase().includes(search.toLowerCase()) ||
      (l.user as { full_name?: string } | null)?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      l.resource_type?.toLowerCase().includes(search.toLowerCase())
    );
  }
  return logs;
}

const actionColors: Record<string, string> = {
  CREATE: 'success',
  UPDATE: 'warning',
  DELETE: 'destructive',
  CREATE_SALE: 'info',
  ADJUST_STOCK: 'pending',
  LOGIN: 'outline',
};

export default function AuditPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [resourceType, setResourceType] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [viewLog, setViewLog] = useState<AuditLog | null>(null);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit-logs', search, resourceType, startDate, endDate],
    queryFn: () => fetchAuditLogs(search, resourceType, startDate, endDate),
  });

  const exportLogs = () => {
    const headers = ['Time', 'User', 'Action', 'Resource', 'IP Address'];
    const rows = logs.map((l) => [
      formatDateTime(l.created_at),
      (l.user as { full_name?: string } | null)?.full_name || '',
      l.action,
      l.resource_type,
      l.ip_address || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.audit.title}</h1>
          <p className="text-muted-foreground text-sm">
            {t.audit.subtitle}
          </p>
        </div>
        <Button variant="outline" onClick={exportLogs}>
          <Download className="h-4 w-4 mr-2" />
          {t.audit.export_csv}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder={t.audit.search_placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              className="w-60"
            />
            <Select value={resourceType} onValueChange={setResourceType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t.audit.title} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.audit.all_resources}</SelectItem>
                <SelectItem value="product">{t.audit.resource_products}</SelectItem>
                <SelectItem value="inventory">{t.audit.resource_inventory}</SelectItem>
                <SelectItem value="sale">{t.audit.resource_sales}</SelectItem>
                <SelectItem value="user">{t.audit.resource_users}</SelectItem>
                <SelectItem value="warehouse">{t.audit.resource_warehouses}</SelectItem>
                <SelectItem value="vendor_transaction">{t.audit.resource_vendor_transactions}</SelectItem>
                <SelectItem value="warehouse_transfer">{t.audit.resource_transfers}</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36" />
              <span className="text-xs text-muted-foreground">{t.audit.to_separator}</span>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.audit.timestamp}</TableHead>
                <TableHead>{t.audit.user}</TableHead>
                <TableHead>{t.audit.action}</TableHead>
                <TableHead>{t.audit.resource}</TableHead>
                <TableHead>{t.audit.ip_address}</TableHead>
                <TableHead>{t.audit.changes}</TableHead>
                <TableHead className="text-right">{t.audit.details}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(7)].map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <ClipboardList className="h-8 w-8 opacity-30" />
                      <p>{t.audit.no_logs}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{(log.user as { full_name?: string } | null)?.full_name || 'System'}</p>
                        <p className="text-xs text-muted-foreground">{(log.user as { email?: string } | null)?.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={(actionColors[log.action] || 'outline') as Parameters<typeof Badge>[0]['variant']}
                        className="text-xs"
                      >
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{log.resource_type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{log.ip_address || '—'}</TableCell>
                    <TableCell>
                      {log.old_values && log.new_values ? (
                        <span className="text-xs text-muted-foreground">
                          {t.audit.fields_changed.replace('{count}', String(Object.keys(log.new_values).length))}
                        </span>
                      ) : log.new_values ? (
                        <span className="text-xs text-muted-foreground">{t.audit.new_record}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewLog(log)}
                        className="text-xs h-7"
                      >
                        {t.audit.view}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Log Detail Dialog */}
      {viewLog && (
        <Dialog open={!!viewLog} onOpenChange={() => setViewLog(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t.audit.dialog_title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">{t.audit.timestamp}:</span><br /><span className="font-medium">{formatDateTime(viewLog.created_at)}</span></div>
                <div><span className="text-muted-foreground">{t.audit.action}:</span><br />
                  <Badge variant={(actionColors[viewLog.action] || 'outline') as Parameters<typeof Badge>[0]['variant']}>{viewLog.action}</Badge>
                </div>
                <div><span className="text-muted-foreground">{t.audit.user}:</span><br /><span className="font-medium">{(viewLog.user as { full_name?: string } | null)?.full_name}</span></div>
                <div><span className="text-muted-foreground">{t.audit.resource}:</span><br /><span className="font-medium capitalize">{viewLog.resource_type}</span></div>
                <div><span className="text-muted-foreground">{t.audit.ip_address}:</span><br /><span className="font-mono text-xs">{viewLog.ip_address || '—'}</span></div>
                <div><span className="text-muted-foreground">{t.audit.browser}:</span><br /><span className="text-xs truncate">{viewLog.user_agent?.split(' ')[0] || '—'}</span></div>
              </div>
              {viewLog.reason && (
                <div><span className="text-muted-foreground">{t.audit.reason}:</span><br /><span className="font-medium">{viewLog.reason}</span></div>
              )}
              {viewLog.old_values && (
                <div>
                  <p className="text-muted-foreground mb-1">{t.audit.previous_values}:</p>
                  <pre className="bg-muted rounded p-3 text-xs overflow-auto">
                    {JSON.stringify(viewLog.old_values, null, 2)}
                  </pre>
                </div>
              )}
              {viewLog.new_values && (
                <div>
                  <p className="text-muted-foreground mb-1">{t.audit.new_values}:</p>
                  <pre className="bg-muted rounded p-3 text-xs overflow-auto">
                    {JSON.stringify(viewLog.new_values, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
