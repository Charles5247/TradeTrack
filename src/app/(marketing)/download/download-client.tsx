"use client";

import React, { useEffect, useState } from 'react';
import { Download, Monitor, Smartphone, Globe } from 'lucide-react';
import { TranslatedText, useCopy } from '@/i18n/text';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { DownloadInfo } from '@/lib/downloads/config';

type Platform = 'android' | 'windows' | 'web';
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function DownloadClient({ versionInfo }: { versionInfo: DownloadInfo | null }) {
  const copy = useCopy();
  const [recommended, setRecommended] = useState<Platform | null>(null);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    setRecommended(/android/i.test(ua) ? 'android' : /Win/i.test(ua) ? 'windows' : 'web');
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    setInstalled(!!window.matchMedia?.('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  const badge = (platform: Platform) => recommended === platform ? <Badge variant="info"><TranslatedText text="Recommended for your device" /></Badge> : null;
  const cardClass = (platform: Platform) => 'scroll-mt-24 min-w-0 ' + (recommended === platform ? 'ring-2 ring-primary' : '');
  const installer = (platform: 'android' | 'windows', label: string) => {
    const release = versionInfo?.latest[platform];
    return <div className="space-y-2">
      {release?.download_url ? <Button className="h-auto min-h-10 w-full whitespace-normal py-2" asChild><a href={release.download_url} download><Download className="h-4 w-4" aria-hidden="true" /><TranslatedText text={label} /></a></Button> : <Button className="h-auto min-h-10 w-full whitespace-normal py-2" disabled aria-label={copy(label) + ": " + copy("Coming soon")}><TranslatedText text="Coming soon" /></Button>}
      {(release?.version || release?.file_size) && <p className="text-sm text-muted-foreground">{release.version && <><TranslatedText text="Version" /> {release.version}</>}{release.version && release.file_size ? ' · ' : ''}{release.file_size}</p>}
    </div>;
  };
  return <div className="grid gap-6 md:grid-cols-2">
    <Card id="android" className={cardClass('android')}>
      <CardHeader><Smartphone aria-hidden="true" /><CardTitle>Android</CardTitle>{badge('android')}</CardHeader>
      <CardContent className="space-y-4">
        {installer('android', 'Download Android APK')}
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li><TranslatedText text="Open the downloaded APK. If asked, tap Settings and allow installs from this source. Return and tap Install." /></li>
          <li><TranslatedText text="Play Protect may warn about apps outside the Play Store. For this trusted download, tap More details, then Install anyway if offered." /></li>
        </ol>
      </CardContent>
    </Card>
    <Card id="windows" className={cardClass('windows')}>
      <CardHeader><Monitor aria-hidden="true" /><CardTitle>Windows</CardTitle>{badge('windows')}</CardHeader>
      <CardContent className="space-y-4">
        {installer('windows', 'Download Windows EXE')}
        <p className="text-sm text-muted-foreground"><TranslatedText text='Open the installer. If SmartScreen says “Windows protected your PC”, tap “More info”, then “Run anyway”.' /></p>
      </CardContent>
    </Card>
    <Card id="web" className={cardClass('web') + ' md:col-span-2'}>
      <CardHeader><Globe aria-hidden="true" /><CardTitle><TranslatedText text="Web app (install from your browser)" /></CardTitle>{badge('web')}</CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground"><TranslatedText text="For iPhone, iPad, Mac and other devices. No app store needed." /></p>
        {installed ? <Badge variant="outline"><TranslatedText text="Already installed" /></Badge> : prompt && <Button onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }}><TranslatedText text="Install App" /></Button>}
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li><TranslatedText text="iPhone or iPad: open this site in Safari and tap Share." /></li>
          <li><TranslatedText text="Tap Add to Home Screen, then Add. Open TracKasuwa from its icon." /></li>
          <li><TranslatedText text="Mac: in Safari, choose File, then Add to Dock." /></li>
          <li><TranslatedText text="Chrome or Edge: choose Install app from the browser menu." /></li>
        </ol>
      </CardContent>
    </Card>
  </div>;
}
