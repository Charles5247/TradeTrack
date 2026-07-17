'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  UserCheck,
  UserX,
  Key,
  MoreHorizontal,
  Trash2,
  Edit,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDateTime } from '@/lib/utils/format';
import { useAuthStore } from '@/store';
import type { User } from '@/types';
import { useI18n } from '@/i18n';

// ── API Helpers ───────────────────────────────────────────────

async function fetchUsers(): Promise<User[]> {
  const res = await fetch('/api/users');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to fetch users');
  }
  const { users } = await res.json();
  return users;
}

async function createUser(data: {
  email: string;
  full_name: string;
  role: string;
  phone: string;
  password: string;
}): Promise<User> {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to create user');
  return body.user;
}

async function updateUser(id: string, data: Record<string, unknown>): Promise<User> {
  const res = await fetch(`/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Failed to update user');
  return body.user;
}

async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to delete user');
  }
}

// ── Badge helpers ─────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, Parameters<typeof Badge>[0]['variant']> = {
    super_admin: 'default',
    owner: 'default',
    admin: 'info',
    manager: 'info',
    cashier: 'outline',
  };
  return (
    <Badge variant={map[role] ?? 'outline'} className="capitalize">
      {role.replace('_', ' ')}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === 'active' ? 'success' : status === 'suspended' ? 'destructive' : 'warning'
      }
    >
      {status}
    </Badge>
  );
}

// ── Form state ────────────────────────────────────────────────

const defaultForm = {
  email: '',
  full_name: '',
  role: 'cashier' as 'super_admin' | 'owner' | 'admin' | 'manager' | 'cashier',
  phone: '',
  password: '',
};

// ── Main Component ────────────────────────────────────────────

export default function UsersPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [resetPwdUser, setResetPwdUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Form data
  const [formData, setFormData] = useState(defaultForm);
  const [editData, setEditData] = useState<Partial<User>>({});

  // Queries & mutations
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: currentUser?.role === 'super_admin',
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsCreateOpen(false);
      setFormData(defaultForm);
      toast.success(t.common.success);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create user'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditUser(null);
      toast.success(t.common.success);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to update user'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeleteTarget(null);
      toast.success(t.common.success);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete user'),
  });

  const resetPwdMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      updateUser(id, { password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setResetPwdUser(null);
      setNewPassword('');
      setConfirmNewPassword('');
      toast.success(t.common.success);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to reset password'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) =>
      updateUser(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(t.common.success);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to update status'),
  });

  // Guard: only super_admin
  if (currentUser?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <ShieldCheck className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <p className="font-medium">{t.users.access_denied}</p>
          <p className="text-sm text-muted-foreground">{t.users.access_denied_desc}</p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.users.title}</h1>
          <p className="text-muted-foreground text-sm">{t.users.subtitle.replace('{count}', String(users.length))}</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t.users.add_user}
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.users.title.split(' ')[0]}</TableHead>
                <TableHead>{t.users.role}</TableHead>
                <TableHead>{t.users.phone}</TableHead>
                <TableHead>{t.users.status}</TableHead>
                <TableHead>{t.users.last_login}</TableHead>
                <TableHead>{t.users.joined}</TableHead>
                <TableHead className="text-right">{t.users.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(7)].map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    {t.users.no_users_desc}
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
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
                    <TableCell><RoleBadge role={u.role} /></TableCell>
                    <TableCell className="text-sm">{u.phone || '—'}</TableCell>
                    <TableCell><StatusBadge status={u.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.last_login ? formatDateTime(u.last_login) : t.users.never}
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
                          <DropdownMenuItem
                            onClick={() => {
                              setEditUser(u);
                              setEditData({
                                full_name: u.full_name,
                                phone: u.phone,
                                role: u.role,
                              });
                            }}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            {t.users.edit}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setResetPwdUser(u);
                              setNewPassword('');
                              setConfirmNewPassword('');
                            }}
                          >
                            <Key className="h-4 w-4 mr-2" />
                            {t.users.reset_password}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {u.status === 'active' ? (
                            <DropdownMenuItem
                              className="text-amber-600"
                              onClick={() => statusMutation.mutate({ id: u.id, status: 'suspended' })}
                            >
                              <UserX className="h-4 w-4 mr-2" />
                              {t.users.suspend_user}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-green-600"
                              onClick={() => statusMutation.mutate({ id: u.id, status: 'active' })}
                            >
                              <UserCheck className="h-4 w-4 mr-2" />
                              {t.users.activate_user}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {u.id !== currentUser?.id && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeleteTarget(u)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t.users.delete}
                            </DropdownMenuItem>
                          )}
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

      {/* ── Create User Dialog ─────────────────────────────── */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.users.create_dialog_title}</DialogTitle>
            <DialogDescription>
              {t.users.create_dialog_desc}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>{t.users.full_name} *</Label>
              <Input
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label>{t.users.email} *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{t.users.phone}</Label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+234 800 000 0000"
              />
            </div>
            <div className="space-y-2">
              <Label>{t.users.role} *</Label>
              <Select
                value={formData.role}
                onValueChange={(v) => setFormData({ ...formData, role: v as typeof formData.role })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cashier">{t.users.cashier}</SelectItem>
                  <SelectItem value="manager">{t.users.manager}</SelectItem>
                  <SelectItem value="admin">{t.users.admin}</SelectItem>
                  <SelectItem value="owner">{t.users.owner}</SelectItem>
                  <SelectItem value="super_admin">{t.users.super_admin}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t.users.password} *</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Min. 8 characters"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setIsCreateOpen(false)}>
                {t.users.cancel}
              </Button>
              <Button
                className="flex-1"
                disabled={createMutation.isPending}
                loading={createMutation.isPending}
                onClick={() => {
                  if (!formData.email || !formData.full_name || !formData.password) {
                    toast.error(t.users.fill_required);
                    return;
                  }
                  createMutation.mutate(formData);
                }}
              >
                {t.users.create_user}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit User Dialog ───────────────────────────────── */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.users.edit_dialog_title}</DialogTitle>
            <DialogDescription>{t.users.edit_dialog_desc}</DialogDescription>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>{t.users.full_name}</Label>
                <Input
                  value={editData.full_name ?? ''}
                  onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.users.phone}</Label>
                <Input
                  type="tel"
                  value={editData.phone ?? ''}
                  onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.users.role}</Label>
                <Select
                  value={editData.role ?? editUser.role}
                  onValueChange={(v) => setEditData({ ...editData, role: v as User['role'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cashier">{t.users.cashier}</SelectItem>
                    <SelectItem value="manager">{t.users.manager}</SelectItem>
                    <SelectItem value="admin">{t.users.admin}</SelectItem>
                    <SelectItem value="owner">{t.users.owner}</SelectItem>
                    <SelectItem value="super_admin">{t.users.super_admin}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditUser(null)}>
                  {t.users.cancel}
                </Button>
                <Button
                  className="flex-1"
                  disabled={updateMutation.isPending}
                  loading={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({ id: editUser.id, data: editData as Record<string, unknown> })
                  }
                >
                  {t.users.save_changes}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Reset Password Dialog ──────────────────────────── */}
      <Dialog open={!!resetPwdUser} onOpenChange={(o) => !o && setResetPwdUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.users.reset_password_title}</DialogTitle>
            <DialogDescription>
              {t.users.reset_password_desc}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>{t.users.new_password}</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
              />
            </div>
            <div className="space-y-2">
              <Label>{t.users.confirm_password}</Label>
              <Input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Repeat password"
                error={
                  confirmNewPassword && newPassword !== confirmNewPassword
                    ? t.users.passwords_do_not_match
                    : undefined
                }
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setResetPwdUser(null)}>
                {t.users.cancel}
              </Button>
              <Button
                className="flex-1"
                disabled={resetPwdMutation.isPending}
                loading={resetPwdMutation.isPending}
                onClick={() => {
                  if (!newPassword || newPassword.length < 8) {
                    toast.error(t.users.password_min_length);
                    return;
                  }
                  if (newPassword !== confirmNewPassword) {
                    toast.error(t.users.passwords_do_not_match);
                    return;
                  }
                  resetPwdMutation.mutate({ id: resetPwdUser!.id, password: newPassword });
                }}
              >
                {t.users.reset_password}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ─────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t.users.delete_title}
            </DialogTitle>
            <DialogDescription>
              {t.users.delete_warning}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>
              {t.users.cancel}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={deleteMutation.isPending}
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(deleteTarget!.id)}
            >
              {t.users.delete_user}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
