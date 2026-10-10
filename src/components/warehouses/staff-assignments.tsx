'use client';
import { TranslatedText } from '@/i18n/text';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export function StaffAssignments({ warehouseId, name }: { warehouseId: string; name: string }) {
  const { user } = useAuthStore();
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState('');
  const owner = user?.role === 'business_owner';
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['warehouse-staff', user?.organization_id], enabled: Boolean(user?.organization_id),
    queryFn: async () => {
      const db = createClient();
      const [staff, assignments] = await Promise.all([
        db.from('users').select('id,full_name,role,status').eq('organization_id', user!.organization_id).in('role', ['admin','cashier']).order('full_name'),
        db.from('warehouse_staff').select('*').eq('organization_id', user!.organization_id),
      ]);
      if (staff.error) throw staff.error; if (assignments.error) throw assignments.error;
      return { staff: staff.data || [], assignments: assignments.data || [] };
    },
  });
  const mutation = useMutation({
    mutationFn: async ({ id, remove }: { id: string; remove?: boolean }) => {
      if (!owner || !user?.organization_id) throw new Error('Only the business owner can change assignments.');
      const db = createClient();
      const member = data?.staff.find(s => s.id === id);
      if (!remove && (!member || member.status !== 'active')) throw new Error('Select an active manager or cashier.');
      const result = remove ? await db.from('warehouse_staff').delete().eq('organization_id', user.organization_id).eq('warehouse_id', warehouseId).eq('user_id', id) : await db.from('warehouse_staff').insert({organization_id:user.organization_id,warehouse_id:warehouseId,user_id:id,assignment_role:member?.role === 'admin' ? 'manager' : 'cashier'});
      if (result.error) throw result.error;
    },
    onSuccess: () => { cache.invalidateQueries({queryKey:['warehouse-staff']}); setPerson(''); },
  });
  const assigned = data?.assignments.filter(a => a.warehouse_id === warehouseId) || [];
  return <div className="space-y-3 border-t pt-4"><div className="flex items-center justify-between gap-2"><p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Users className="h-4 w-4" />{isLoading ? 'Loading team…' : `${assigned.length} staff assigned`}</p>{owner && <Button variant="ghost" size="sm" onClick={() => setOpen(true)}><TranslatedText text={"Assign staff"} /></Button>}</div>{error ? <button className="text-xs text-destructive underline" onClick={() => refetch()}><TranslatedText text={"Could not load assignments. Retry"} /></button> : <div className="flex flex-wrap gap-2">{assigned.map(a => <Badge key={a.user_id} variant="outline">{data?.staff.find(s => s.id === a.user_id)?.full_name || 'Team member'} · {a.assignment_role}</Badge>)}</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle><TranslatedText text={"Team at"} />{" "}{name}</DialogTitle><DialogDescription><TranslatedText text={"Assign existing managers and cashiers to this location. Managers use the Admin account role. Assignments record responsibility; account permissions remain unchanged."} /></DialogDescription></DialogHeader>{(error || mutation.error) && <p role="alert" className="text-sm text-destructive">{(error || mutation.error)?.message}</p>}<ul className="divide-y">{assigned.map(a => <li key={a.user_id} className="flex items-center justify-between py-3"><div><p className="font-medium">{data?.staff.find(s => s.id === a.user_id)?.full_name || 'Team member'}</p><p className="text-xs capitalize text-muted-foreground">{a.assignment_role}</p></div><Button aria-label={`Remove ${data?.staff.find(s => s.id === a.user_id)?.full_name || 'staff assignment'}`} variant="ghost" size="icon" disabled={mutation.isPending} onClick={() => mutation.mutate({id:a.user_id,remove:true})}><X className="h-4 w-4" /></Button></li>)}</ul><Label htmlFor={`staff-${warehouseId}`}><TranslatedText text={"Manager or cashier"} /></Label><select id={`staff-${warehouseId}`} className="tt-input" value={person} onChange={e => setPerson(e.target.value)}><option value=""><TranslatedText text={"Select team member"} /></option>{data?.staff.filter(s => s.status === 'active' && !assigned.some(a => a.user_id === s.id)).map(s => <option key={s.id} value={s.id}>{s.full_name} · <TranslatedText text={s.role === 'admin' ? 'Manager' : 'Cashier'} /></option>)}</select><Button disabled={!person || mutation.isPending} onClick={() => mutation.mutate({id:person})}><Plus className="h-4 w-4" /><TranslatedText text={"Assign to location"} /></Button><p className="text-xs text-muted-foreground"><TranslatedText text={"Need a new account?"} />{" "}<a href="/users" className="text-primary underline"><TranslatedText text={"Add a team member"} /></a>{" "}<TranslatedText text={"first. A person can work at more than one location."} /></p></DialogContent></Dialog>
  </div>;
}
