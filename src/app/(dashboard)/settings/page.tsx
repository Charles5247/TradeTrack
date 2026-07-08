'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, User, Building, Globe, Bell, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/store';
import { createClient } from '@/lib/supabase/client';
import { SUPPORTED_LOCALES } from '@/i18n';
import { useTheme } from 'next-themes';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);

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
  });

  const handleUpdateProfile = async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('users')
        .update({ full_name: profileData.full_name, phone: profileData.phone })
        .eq('id', user?.id);
      if (error) throw error;
      toast.success('Profile updated successfully');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const newPwd = String(data.get('newPassword'));
    const confirm = String(data.get('confirmPassword'));

    if (newPwd !== confirm) {
      toast.error('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      toast.success('Password changed successfully');
      form.reset();
    } catch {
      toast.error('Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">Manage your account and application preferences</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="profile"><User className="h-4 w-4 mr-1" />Profile</TabsTrigger>
          <TabsTrigger value="organization"><Building className="h-4 w-4 mr-1" />Organization</TabsTrigger>
          <TabsTrigger value="appearance"><Palette className="h-4 w-4 mr-1" />Appearance</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>Update your personal details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 pb-4 border-b">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                  {user?.full_name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <p className="font-medium">{user?.full_name}</p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.role?.replace('_', ' ')}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  value={profileData.full_name}
                  onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input
                  value={profileData.phone}
                  onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input value={user?.email} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>
              <Button onClick={handleUpdateProfile} disabled={isLoading}>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organization Tab */}
        <TabsContent value="organization" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Organization Settings</CardTitle>
              <CardDescription>Update your business information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Business Name</Label>
                <Input
                  value={orgData.name}
                  onChange={(e) => setOrgData({ ...orgData, name: e.target.value })}
                  placeholder="Your business name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={orgData.phone}
                    onChange={(e) => setOrgData({ ...orgData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={orgData.email}
                    onChange={(e) => setOrgData({ ...orgData, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input
                  value={orgData.address}
                  onChange={(e) => setOrgData({ ...orgData, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={orgData.currency} onValueChange={(v) => setOrgData({ ...orgData, currency: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NGN">Nigerian Naira (₦)</SelectItem>
                    <SelectItem value="USD">US Dollar ($)</SelectItem>
                    <SelectItem value="GBP">British Pound (£)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button>
                <Save className="h-4 w-4 mr-2" />
                Save Organization Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Customize your display preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Theme</Label>
                <div className="grid grid-cols-3 gap-3">
                  {(['light', 'dark', 'system'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`border-2 rounded-lg p-3 text-sm font-medium capitalize transition-all ${
                        theme === t ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                      }`}
                    >
                      {t === 'light' ? '☀️ Light' : t === 'dark' ? '🌙 Dark' : '💻 System'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label>Language</Label>
                <Select defaultValue="en">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_LOCALES.map((locale) => (
                      <SelectItem key={locale.code} value={locale.code}>
                        {locale.name} — {locale.native}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input type="password" name="newPassword" placeholder="••••••••" required minLength={8} />
                </div>
                <div className="space-y-2">
                  <Label>Confirm New Password</Label>
                  <Input type="password" name="confirmPassword" placeholder="••••••••" required minLength={8} />
                </div>
                <Button type="submit" disabled={isLoading}>
                  Change Password
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
