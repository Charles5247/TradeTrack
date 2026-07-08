'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { User } from '@/types';

export async function getSession() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  return data as User | null;
}

export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireRole(roles: string[]): Promise<User> {
  const user = await requireAuth();
  if (!roles.includes(user.role)) redirect('/dashboard');
  return user;
}

export async function signIn(email: string, password: string) {
  const supabase = await createClient();
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function resetPassword(email: string) {
  const supabase = await createClient();
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  });
}

export async function updatePassword(password: string) {
  const supabase = await createClient();
  return supabase.auth.updateUser({ password });
}
