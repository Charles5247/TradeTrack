'use client';

/**
 * TradeTrack — Forced Password Change Gate
 *
 * Shown when the signed-in user's `must_change_password` flag is true
 * (set at merchant onboarding when a business_owner is created with a
 * server-generated temporary password — see /api/merchants/onboard).
 * The user cannot reach any dashboard screen until they set their own
 * password here. Deliberately lives OUTSIDE the `(dashboard)` route
 * group so it renders without the sidebar/header chrome and without
 * re-triggering the dashboard layout's own redirect-to-login check.
 *
 * Re-skinned onto the shared <AuthShell> split-panel (design_files/
 * auth.jsx's `ChangePassword`) — logic unchanged.
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AuthShell } from '@/components/layout/auth-shell';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store';
import { useI18n } from '@/i18n';

export default function ChangePasswordPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, setUser } = useAuthStore();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // If the user isn't signed in, or doesn't actually need to change
    // their password, there's nothing to gate — send them on their way.
    if (user && !user.must_change_password) {
      router.replace('/dashboard');
    } else if (!user) {
      router.replace('/login');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) {
      toast.error(t.forcedPasswordChange.password_required);
      return;
    }
    if (newPassword.length < 8) {
      toast.error(t.forcedPasswordChange.password_min_length);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t.forcedPasswordChange.passwords_do_not_match);
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createClient();

      // 1. Set the new password via Supabase Auth.
      const { error: pwdErr } = await supabase.auth.updateUser({ password: newPassword });
      if (pwdErr) throw pwdErr;

      // 2. Clear must_change_password on the profile row.
      if (user) {
        const { error: profileErr } = await supabase
          .from('users')
          .update({ must_change_password: false } as any)
          .eq('id', user.id);
        if (profileErr) throw profileErr;

        setUser({ ...user, must_change_password: false });
      }

      toast.success(t.forcedPasswordChange.success);
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.forcedPasswordChange.update_failed;
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const strength = [newPassword.length >= 8, /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword), /\d/.test(newPassword), /[^A-Za-z0-9]/.test(newPassword)];
  const strengthCount = strength.filter(Boolean).length;

  return (
    <AuthShell variant="change">
      <Badge variant="warning" className="mb-4">
        <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
        Required · First-time login
      </Badge>
      <h1 className="tt-head text-3xl mb-2">{t.forcedPasswordChange.title}</h1>
      <p className="tt-muted text-sm mb-8">{t.forcedPasswordChange.desc}</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-password">{t.forcedPasswordChange.new_password}</Label>
          <Input
            id="new-password"
            type={showPassword ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={isLoading}
            rightIcon={
              <button type="button" onClick={() => setShowPassword((s) => !s)} className="p-0">
                {showPassword ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
              </button>
            }
          />
          <div className="flex gap-1 mt-1.5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex-1 h-[3px] rounded-full"
                style={{ background: i <= strengthCount ? 'var(--c-success)' : 'var(--c-border)' }}
              />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">{t.forcedPasswordChange.confirm_password}</Label>
          <Input
            id="confirm-password"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {t.forcedPasswordChange.submitting}
            </>
          ) : (
            t.forcedPasswordChange.submit
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
