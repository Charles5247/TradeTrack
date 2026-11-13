'use client';

import { useState } from 'react';
import { useAndroidUpdate } from '@/lib/downloads/use-android-update';
import { isNewerVersion } from '@/lib/downloads/android-update';

export default function AppUpdatePage() {
  const { installed, release, checking, available } = useAndroidUpdate();
  const [copied, setCopied] = useState(false);
  const needsPhotoFix = installed !== null && isNewerVersion('1.0.2', installed);
  const photoFixPublished = Boolean(release?.download_url && release.version && !isNewerVersion('1.0.2', release.version));
  const canInstall = available && (!needsPhotoFix || photoFixPublished);

  const copyLink = async () => {
    if (!release?.download_url) return;
    try { await navigator.clipboard.writeText(release.download_url); setCopied(true); }
    catch { setCopied(false); }
  };

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">App update</h1>
      {!installed ? (
        <p className="text-muted-foreground">Your browser version updates automatically when you reopen Trackasuwa online. Android APK updates appear here in the installed Android app.</p>
      ) : (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <p>Installed Android app: {installed === '0.0.0' ? 'older version' : `v${installed}`}</p>
          {needsPhotoFix && !photoFixPublished && (
            <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">This installed app does not include the Android camera and gallery fix. It requires version 1.0.2 or newer. That APK has not been made available through Trackasuwa’s update service yet; reinstalling version 1.0.1 will not repair photos.</p>
          )}
          {checking && !release && <p>Checking for updates…</p>}
          {!checking && !release?.download_url && <p>No Android APK is available to download through the app right now. Check again when you are online.</p>}
          {release?.download_url && !canInstall && <p>{needsPhotoFix ? 'The listed APK is still too old for the camera fix.' : 'You have the latest published Android app.'}</p>}
          {canInstall && (
            <>
              <p className="font-medium">Version {release?.version} is ready.</p>
              <p>Before updating, connect to the internet and let queued sales and photos finish syncing. Install the new APK over your existing Trackasuwa app. Do not uninstall the app; uninstalling can remove unsynced data.</p>
              {needsPhotoFix ? (
                <div className="space-y-2">
                  <p className="text-sm">Your installed app may not open APK links. Copy the link and paste it into Chrome for this update. Later app versions open the browser directly.</p>
                  <button type="button" className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground" onClick={() => void copyLink()}>{copied ? 'Link copied' : 'Copy update link'}</button>
                  <p className="break-all select-text text-xs text-muted-foreground">{release?.download_url}</p>
                </div>
              ) : (
                <a href={release?.download_url ?? '#'} className="inline-flex rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground">Download update</a>
              )}
              <p className="text-sm text-muted-foreground">Android may open your browser to download the APK and ask you to allow installation from that source. Confirm the installation on your device.</p>
            </>
          )}
        </div>
      )}
    </main>
  );
}
