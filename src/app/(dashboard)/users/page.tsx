'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, UserCheck, UserX, Key, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { createClient } from '@/lib/supabase/client';
import { formatDateTime } from '@/lib/utils/format';
import { useAuthStore } from '@/store';
import type { User } from '@/types';

async function fetchUsers() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as User[];
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role: 'cashier' as const,
    phone: '',
    password: '',
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const supabase = createClient();
      const orgId = (currentUser as unknown as { organization_id: string })?.organization_id;

      // Create auth user
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
      });
      if (authErr) throw authErr;

      // Create profile
      const { error } = await supabase.from('users').insert({
        id: authData.user.id,
        email: data.email,
        full_name: data.full_name,
        role: data.role,
        phone: data.phone || null,
        organization_id: orgId,
        status: 'active',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsFormOpen(false);
      toast.success('User created successfully');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create user'),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'suspended' }) => {
      const supabase = createClient();
      const { error } = await supabase.from('users').update({ status }).eq('id', id);
      if (error) throw error;

      // Audit log
      await supabase.from('audit_logs').insert({
        organization_id: (currentUser as unknown as { organization_id: string })?.organization_id,
        user_id: currentUser?.id,
        action: status === 'suspended' ? 'SUSPEND_USER' : 'ACTIVATE_USER',
        resource_type: 'user',
        resource_id: id,
        new_values: { status },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User status updated');
    },
  });

  const getRoleBadge = (role: string) => {
    const map: Record<string, Parameters<typeof Badge>[0]['variant']> = {
      super_admin: 'default',
      admin: 'info',
      cashier: 'outline',
    };
    return <Badge variant={map[role] || 'outline'} className="capitalize">{role.replace('_', ' ')}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    return (
      <Badge variant={status === 'active' ? 'success' : status === 'suspended' ? 'destructive' : 'warning'}>
        {status}
      </Badge>
    );
  };

  // Only super_admin can access this page
  if (currentUser?.role !== 'super_admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Access denied. Super Admin only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-muted-foreground text-sm">{users.length} users</p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(7)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                  </TableRow>
                ))
              ) : (
                users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-semibold text-primary">
                            {u.full_name?.charAt(0)?.toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-sm">{u.full_name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getRoleBadge(u.role)}</TableCell>
                    <TableCell className="text-sm">{u.phone || '—'}</TableCell>
                    <TableCell>{getStatusBadge(u.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.last_login ? formatDateTime(u.last_login) : 'Never'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(u.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {u.status === 'active' ? (
                            <DropdownMenuItem
                              className="text-amber-600"
                              onClick={() => updateStatusMutation.mutate({ id: u.id, status: 'suspended' })}
                            >
                              <UserX className="h-4 w-4 mr-2" /> Suspend
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-green-600"
                              onClick={() => updateStatusMutation.mutate({ id: u.id, status: 'active' })}
                            >
                              <UserCheck className="h-4 w-4 mr-2" /> Activate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem>
                            <Key className="h-4 w-4 mr-2" /> Reset Password
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v as typeof formData.role })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={() => createUserMutation.mutate(formData)} disabled={createUserMutation.isPending}>
                Create User
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
