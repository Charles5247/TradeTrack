'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Save, User, Building, Globe, Palette, Lock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore, useOrgStore } from '@/store';
import { createClient } from '@/lib/supabase/client';
import { SUPPORTED_LOCALES, useI18n } from '@/i18n';
import { useTheme } from 'next-themes';
import type { Locale } from '@/types';
import { cacheUserSession } from '@/lib/offline/db';

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const { setCurrency, setOrganizationName } = useOrgStore();
  const { theme, setTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isOrgLoading, setIsOrgLoading] = useState(false);
  const [isPwdLoading, setIsPwdLoading] = useState(false);

  const [profileData, setProfileData] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
  });

  const [orgData, setOrgData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    currency: 'NGN',
    timezone: 'Africa/Lagos',
  });

  const [pwdData, setPwdData] = useState({
    newPassword: '',
    confirmPassword: '',
  });

  // Load organization data
  useEffect(() => {
    async function loadOrg() {
      if (!user?.organization_id) return;
      const supabase = createClient();
      const { data } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', user.organization_id)
        .single();
      if (data) {
        setOrgData({
          name: data.name || '',
          phone: data.phone || '',
          email: data.email || '',
          address: data.address || '',
          currency: data.currency || 'NGN',
          timezone: data.timezone || 'Africa/Lagos',
        });
        if (data.currency) setCurrency(data.currency);
        if (data.name) setOrganizationName(data.name);
      }
    }
    loadOrg();
  }, [user?.organization_id, setCurrency, setOrganizationName]);

  // Keep form in sync with user store
  useEffect(() => {
    if (user) {
      setProfileData({ full_name: user.full_name || '', phone: user.phone || '' });
    }
  }, [user]);

  const handleUpdateProfile = async () => {
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
        .eq('id', user?.id ?? '')
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
      console.error(err);
      toast.error(t.settings.profile_update_failed);
    } finally {
      setIsProfileLoading(false);
    }
  };

  const handleUpdateOrg = async () => {
    if (!orgData.name.trim()) {
      toast.error(t.settings.business_name_required);
      return;
    }
    setIsOrgLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('organizations')
        .update({
          name: orgData.name.trim(),
          phone: orgData.phone.trim() || null,
          email: orgData.email.trim() || null,
          address: orgData.address.trim() || null,
          currency: orgData.currency,
          timezone: orgData.timezone,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user?.organization_id ?? '');

      if (error) throw error;
      setCurrency(orgData.currency);
      setOrganizationName(orgData.name.trim());
      toast.success(t.settings.org_settings_saved);
    } catch (err) {
      console.error(err);
      toast.error(t.settings.org_settings_save_failed);
    } finally {
      setIsOrgLoading(false);
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
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">{t.settings.title}</h1>
        <p className="text-muted-foreground text-sm">{t.settings.subtitle}</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="profile">
            <User className="h-4 w-4 mr-1.5" />
            {t.settings.tab_profile}
          </TabsTrigger>
          <TabsTrigger value="organization">
            <Building className="h-4 w-4 mr-1.5" />
            {t.settings.tab_business}
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="h-4 w-4 mr-1.5" />
            {t.settings.tab_display}
          </TabsTrigger>
          <TabsTrigger value="security">
            <Lock className="h-4 w-4 mr-1.5" />
            {t.settings.tab_security}
          </TabsTrigger>
        </TabsList>

        {/* ── Profile Tab ─────────────────────────────────── */}
        <TabsContent value="profile" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.personal_information}</CardTitle>
              <CardDescription>{t.settings.personal_information_desc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Avatar */}
              <div className="flex items-center gap-4 pb-4 border-b">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                  {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="font-medium">{user?.full_name}</p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                  <p className="text-xs text-muted-foreground capitalize mt-0.5">
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
                <p className="text-xs text-muted-foreground">{t.settings.email_cannot_change}</p>
              </div>

              <Button onClick={handleUpdateProfile} disabled={isProfileLoading}>
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
        <TabsContent value="organization" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.business_information}</CardTitle>
              <CardDescription>{t.settings.business_information_desc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org_name">{t.settings.business_name}</Label>
                <Input
                  id="org_name"
                  value={orgData.name}
                  onChange={(e) => setOrgData({ ...orgData, name: e.target.value })}
                  placeholder={t.settings.business_name_placeholder}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="org_phone">{t.common.phone}</Label>
                  <Input
                    id="org_phone"
                    type="tel"
                    value={orgData.phone}
                    onChange={(e) => setOrgData({ ...orgData, phone: e.target.value })}
                    placeholder="+234 800 000 0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org_email">{t.common.email}</Label>
                  <Input
                    id="org_email"
                    type="email"
                    value={orgData.email}
                    onChange={(e) => setOrgData({ ...orgData, email: e.target.value })}
                    placeholder={t.settings.business_email_placeholder}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="org_address">{t.settings.business_address}</Label>
                <Input
                  id="org_address"
                  value={orgData.address}
                  onChange={(e) => setOrgData({ ...orgData, address: e.target.value })}
                  placeholder={t.settings.business_address_placeholder}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.settings.currency}</Label>
                  <Select
                    value={orgData.currency}
                    onValueChange={(v) => setOrgData({ ...orgData, currency: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NGN">Nigerian Naira (₦)</SelectItem>
                      <SelectItem value="USD">US Dollar ($)</SelectItem>
                      <SelectItem value="GBP">British Pound (£)</SelectItem>
                      <SelectItem value="EUR">Euro (€)</SelectItem>
                      <SelectItem value="GHS">Ghanaian Cedi (₵)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t.settings.timezone}</Label>
                  <Select
                    value={orgData.timezone}
                    onValueChange={(v) => setOrgData({ ...orgData, timezone: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Africa/Lagos">Africa/Lagos (WAT)</SelectItem>
                      <SelectItem value="Africa/Accra">Africa/Accra (GMT)</SelectItem>
                      <SelectItem value="Africa/Nairobi">Africa/Nairobi (EAT)</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={handleUpdateOrg} disabled={isOrgLoading}>
                {isOrgLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {t.settings.save_business_settings}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Appearance Tab ──────────────────────────────── */}
        <TabsContent value="appearance" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.display_preferences}</CardTitle>
              <CardDescription>{t.settings.display_preferences_desc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Theme */}
              <div className="space-y-3">
                <Label>{t.settings.theme}</Label>
                <div className="grid grid-cols-3 gap-3">
                  {(['light', 'dark', 'system'] as const).map((themeOption) => (
                    <button
                      key={themeOption}
                      onClick={() => setTheme(themeOption)}
                      className={`border-2 rounded-lg p-3 text-sm font-medium capitalize transition-all ${
                        theme === themeOption
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:border-primary/50 text-muted-foreground'
                      }`}
                    >
                      {themeOption === 'light' ? `☀️ ${t.settings.theme_light}` : themeOption === 'dark' ? `🌙 ${t.settings.theme_dark}` : `💻 ${t.settings.theme_system}`}
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
                    <Globe className="h-4 w-4 mr-2 text-muted-foreground" />
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
                <p className="text-xs text-muted-foreground">
                  {t.settings.language_hint}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Security Tab ─────────────────────────────────── */}
        <TabsContent value="security" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.change_password}</CardTitle>
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
      </Tabs>
    </div>
  );
}
