'use client';
import { TranslatedLabel, TranslatedText, useCopy } from '@/i18n/text';


import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Save, User, Building, Globe, Palette, Lock, Loader2, Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/store';
import { createClient } from '@/lib/supabase/client';
import { SUPPORTED_LOCALES, useI18n } from '@/i18n';
import { useTheme } from 'next-themes';
import type { Locale } from '@/types';
import { BusinessSettings } from '@/components/settings/business-settings';
import { OperationsSettings } from '@/components/settings/operations-settings';
import { cacheUserSession } from '@/lib/offline/db';

export default function SettingsPage() {
  const copy = useCopy();
  const { user, setUser } = useAuthStore();
  const isPlatformOwner = user?.role === 'platform_owner';
  const hasBusiness = !isPlatformOwner && Boolean(user?.organization_id);
  const { theme, setTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isOrgLoading, setIsOrgLoading] = useState(false);
  const [isPwdLoading, setIsPwdLoading] = useState(false);

  const [profileData, setProfileData] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
  });

  const [pwdData, setPwdData] = useState({
    newPassword: '',
    confirmPassword: '',
  });

  // Keep form in sync with user store
  useEffect(() => {
    if (user) {
      setProfileData({ full_name: user.full_name || '', phone: user.phone || '' });
    }
  }, [user]);

  const handleUpdateProfile = async () => {
    if (!user?.id) {
      toast.error(t.settings.profile_update_failed, {
        description: 'Your profile is not loaded. Refresh the page and sign in again if needed.',
      });
      return;
    }
    if (!profileData.full_name.trim()) {
      toast.error(t.settings.full_name_required);
      return;
    }
    setIsProfileLoading(true);
    try {
      const supabase = createClient();
      const { data: updatedProfile, error } = await supabase
        .from('users')
        .update({
          full_name: profileData.full_name.trim(),
          phone: profileData.phone.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select('*')
        .single();

      if (error) throw error;

      // Update Zustand store
      if (updatedProfile) {
        setUser(updatedProfile as typeof user);
        // Update offline cache
        await cacheUserSession(updatedProfile.id, updatedProfile as Record<string, unknown>);
      }

      toast.success(t.settings.profile_updated);
    } catch (err) {
      // PostgREST errors are plain objects; the dev overlay can render them as {}.
      const failure = err !== null && typeof err === 'object' ? err as Record<string, unknown> : null;
      const message = typeof failure?.message === 'string' && failure.message.trim()
        ? failure.message
        : err instanceof Error ? err.message : 'An unexpected error occurred while saving your profile.';
      const code = typeof failure?.code === 'string' && failure.code ? ` [${failure.code}]` : '';
      console.error(`Profile update failed${code}: ${message}`);
      toast.error(t.settings.profile_update_failed, { description: `${message}${code}` });
    } finally {
      setIsProfileLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!pwdData.newPassword) {
      toast.error(t.settings.password_required);
      return;
    }
    if (pwdData.newPassword.length < 8) {
      toast.error(t.settings.password_min_length);
      return;
    }
    if (pwdData.newPassword !== pwdData.confirmPassword) {
      toast.error(t.settings.passwords_do_not_match);
      return;
    }
    setIsPwdLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: pwdData.newPassword });
      if (error) throw error;
      toast.success(t.settings.password_changed);
      setPwdData({ newPassword: '', confirmPassword: '' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.settings.password_change_failed;
      toast.error(msg);
    } finally {
      setIsPwdLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1360px] space-y-6">
      <div>
        <h1 className="tt-page-title">{t.settings.title}</h1>
        <p className="tt-muted text-sm">{isPlatformOwner ? 'Manage your platform account, appearance, and security.' : t.settings.subtitle}</p>
      </div>

      <Tabs key={user?.role} defaultValue={hasBusiness ? "organization" : "profile"} orientation="vertical" className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        <TabsList aria-label={copy("Settings sections")} className="grid grid-cols-2 gap-1 border-0 lg:sticky lg:top-4 lg:grid-cols-1 [&>button]:min-h-11 [&>button]:justify-start [&>button]:rounded-[var(--radius)] [&>button]:border-0 [&>button]:px-3 [&>button]:data-[state=active]:bg-primary/10 [&>button]:data-[state=active]:border-l-2 [&>button]:data-[state=active]:border-primary">
          {isPlatformOwner && <TabsTrigger value="platform"><Building className="h-4 w-4 mr-1.5" /><TranslatedText text={"Platform operations"} /></TabsTrigger>}
          {hasBusiness && <><TabsTrigger value="organization">{t.settings.tab_business}</TabsTrigger>
          <TabsTrigger value="localization"><TranslatedText text={"Localization"} /></TabsTrigger>
          <TabsTrigger value="receipts"><TranslatedText text={"Receipt template"} /></TabsTrigger>
          <TabsTrigger value="devices"><TranslatedText text={"Devices & printers"} /></TabsTrigger>
          <TabsTrigger value="sync"><TranslatedText text={"Offline sync"} /></TabsTrigger>
          <TabsTrigger value="notifications"><TranslatedText text={"Notifications"} /></TabsTrigger>
          <TabsTrigger value="export"><TranslatedText text={"Data & export"} /></TabsTrigger></>}
          <TabsTrigger value="profile"><User className="mr-1.5 h-4 w-4" />{t.settings.tab_profile}</TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="h-4 w-4 mr-1.5" />
            {t.settings.tab_display}
          </TabsTrigger>
          <TabsTrigger value="security">
            <Lock className="h-4 w-4 mr-1.5" />
            {t.settings.tab_security}
          </TabsTrigger>
        </TabsList>
        <div className="min-w-0 space-y-6">
        {isPlatformOwner && <TabsContent value="platform" className="mt-0"><Card><CardHeader><CardTitle><TranslatedText text={"Platform operations"} /></CardTitle><CardDescription><TranslatedText text={"Manage TracKasuwa across merchants. Personal language and theme preferences are in Display."} /></CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">{[{ href: "/subscriptions", title: "Plans and subscriptions", body: "Manage the plans available to merchants and review subscriptions." }, { href: "/merchants", title: "Merchant access", body: "Review onboarding, verification, account status and device limits." }, { href: "/admin", title: "Platform overview", body: "Monitor platform activity and merchant growth." }, { href: "/notifications", title: "Notifications", body: "Review updates requiring your attention." }].map(item => <Link key={item.href} href={item.href} className="rounded-lg border p-4 transition-colors hover:border-primary hover:bg-primary/5"><h3 className="tt-head text-base"><TranslatedLabel>{item.title}</TranslatedLabel></h3><p className="mt-2 text-sm tt-muted"><TranslatedLabel>{item.body}</TranslatedLabel></p></Link>)}</CardContent></Card></TabsContent>}

        {/* ── Profile Tab ─────────────────────────────────── */}
        <TabsContent value="profile" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="tt-section-title">{t.settings.personal_information}</CardTitle>
              <CardDescription>{t.settings.personal_information_desc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Avatar */}
              <div className="flex items-center gap-4 pb-4 border-b">
                <div className="tt-avatar shrink-0 w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                  {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div className="min-w-0 break-words">
                  <p className="font-medium">{user?.full_name}</p>
                  <p className="text-sm tt-muted">{user?.email}</p>
                  <p className="text-xs tt-muted capitalize mt-0.5">
                    {user?.role?.replace('_', ' ')}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="full_name">{t.settings.full_name}</Label>
                <Input
                  id="full_name"
                  value={profileData.full_name}
                  onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                  placeholder={t.settings.full_name_placeholder}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">{t.settings.phone_number}</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={profileData.phone}
                  onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                  placeholder="+234 800 000 0000"
                />
              </div>

              <div className="space-y-2">
                <Label>{t.settings.email_address}</Label>
                <Input value={user?.email || ''} disabled className="bg-muted" />
                <p className="text-xs tt-muted">{t.settings.email_cannot_change}</p>
              </div>

              <Button className="w-full sm:w-auto" onClick={handleUpdateProfile} disabled={isProfileLoading}>
                {isProfileLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {t.settings.save_changes}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Organization Tab ─────────────────────────────── */}
        {hasBusiness && <>
          <TabsContent value="organization" className="mt-0"><BusinessSettings key={user?.organization_id} /></TabsContent>
          <TabsContent value="localization" className="mt-0"><BusinessSettings key={user?.organization_id + '-locale'} localizationOnly /></TabsContent>
          {(['receipts', 'devices', 'sync', 'notifications', 'export'] as const).map(section => <TabsContent key={section} value={section} className="mt-0"><OperationsSettings section={section} /></TabsContent>)}
        </>}

        <TabsContent value="appearance" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="tt-section-title">{t.settings.display_preferences}</CardTitle>
              <CardDescription>{t.settings.display_preferences_desc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Theme */}
              <div className="space-y-3">
                <Label>{t.settings.theme}</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(['light', 'dark', 'system'] as const).map((themeOption) => (
                    <button
                      key={themeOption}
                      type="button"
                      aria-pressed={theme === themeOption}
                      onClick={() => setTheme(themeOption)}
                      className={`min-h-11 border rounded-[var(--radius)] p-4 text-sm font-medium capitalize transition-all ${
                        theme === themeOption
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:border-primary/50 tt-muted'
                      }`}
                    >
                      {themeOption === 'light' ? <Sun className="mx-auto mb-2 h-5 w-5" strokeWidth={1.75} /> : themeOption === 'dark' ? <Moon className="mx-auto mb-2 h-5 w-5" strokeWidth={1.75} /> : <Monitor className="mx-auto mb-2 h-5 w-5" strokeWidth={1.75} />}
                      {themeOption === 'light' ? t.settings.theme_light : themeOption === 'dark' ? t.settings.theme_dark : t.settings.theme_system}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language — connected to i18n context */}
              <div className="space-y-3">
                <Label>{t.settings.language}</Label>
                <Select
                  value={locale}
                  onValueChange={(v) => setLocale(v as Locale)}
                >
                  <SelectTrigger className="max-w-xs">
                    <Globe className="h-4 w-4 mr-2 tt-muted" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_LOCALES.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.name} — {l.native}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs tt-muted">
                  {t.settings.language_hint}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Security Tab ─────────────────────────────────── */}
        <TabsContent value="security" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="tt-section-title">{t.settings.change_password}</CardTitle>
              <CardDescription>{t.settings.change_password_desc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">{t.settings.new_password}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="••••••••"
                  value={pwdData.newPassword}
                  onChange={(e) => setPwdData({ ...pwdData, newPassword: e.target.value })}
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t.settings.confirm_new_password}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={pwdData.confirmPassword}
                  onChange={(e) => setPwdData({ ...pwdData, confirmPassword: e.target.value })}
                  minLength={8}
                  error={
                    pwdData.confirmPassword && pwdData.newPassword !== pwdData.confirmPassword
                      ? t.settings.passwords_do_not_match
                      : undefined
                  }
                />
              </div>
              <Button
                className="w-full sm:w-auto"
                onClick={handleChangePassword}
                disabled={isPwdLoading}
              >
                {isPwdLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Lock className="h-4 w-4 mr-2" />
                )}
                {t.settings.change_password}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
