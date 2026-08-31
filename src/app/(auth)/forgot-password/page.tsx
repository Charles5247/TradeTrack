'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Mail, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { AuthShell } from '@/components/layout/auth-shell';
import { forgotPasswordSchema, type ForgotPasswordFormData } from '@/lib/validations';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success('Password reset email sent!');
    } catch {
      toast.error('Failed to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell variant="forgot">
      <div className="tt-eyebrow mb-2">Reset password</div>
      <h1 className="tt-head text-3xl mb-2">Let&apos;s get you back in.</h1>
      <p className="tt-muted text-sm mb-8">
        Enter the email tied to your merchant account. We&apos;ll send a reset link.
      </p>

      {sent ? (
        <div className="text-center py-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'color-mix(in oklch, var(--c-success), transparent 85%)' }}
          >
            <Mail className="h-6 w-6" style={{ color: 'var(--c-success)' }} strokeWidth={1.75} />
          </div>
          <p className="tt-muted text-sm mb-4">
            We have sent a password reset link to your email address.
          </p>
          <Link href="/login">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" strokeWidth={1.75} />
              Back to Login
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@shop.com"
              leftIcon={<Mail className="h-4 w-4" strokeWidth={1.75} />}
              {...register('email')}
              error={errors.email?.message}
              disabled={isLoading}
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending...</>
            ) : 'Send Reset Link'}
          </Button>
          <Link href="/login">
            <Button variant="ghost" className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" strokeWidth={1.75} />
              Back to Login
            </Button>
          </Link>
        </form>
      )}

      <Card flat className="mt-6">
        <CardContent className="p-4 flex gap-3">
          <Info className="h-4 w-4 tt-muted shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <div className="text-sm font-semibold">Cashier or admin account?</div>
            <div className="tt-muted text-xs mt-1">
              Ask your business owner to reset your password from Settings → Team.
              We only send resets directly to business owners.
            </div>
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
