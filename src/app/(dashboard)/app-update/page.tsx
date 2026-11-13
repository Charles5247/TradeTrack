'use client';

import { useState } from 'react';
import { useAndroidUpdate } from '@/lib/downloads/use-android-update';

export default function AppUpdatePage() {
  const { installed, release, checking, available } = useAndroidUpdate();
  const [copied, setCopied] = useState(false);

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">App update</h1>
      {!installed ? (
        <p className="text-muted-foreground">Your browser version updates automatically when you reopen Trackasuwa online. Android APK updates appear here in the installed Android app.</p>
      ) : (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <p>Installed Android app: {installed === '0.0.0' ? 'older version' : `v${installed}`}</p>
          {checking && !release && <p>Checking for updates…</p>}
          {!checking && !release?.download_url && <p>No Android update is available to download right now. Check again when you are online.</p>}
          {release?.download_url && !available && <p>You have the latest published Android app.</p>}
          {available && (
            <>
              <p className="font-medium">Version {release?.version} is ready.</p>
              <p>Before updating, connect to the internet and let queued sales and photos finish syncing. Install the new APK over your existing Trackasuwa app. Do not uninstall the app; uninstalling can remove unsynced data.</p>
              <a href={release?.download_url ?? '#'} className="inline-flex rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground">Download update</a>
              {installed === '0.0.0' && (
                <div className="space-y-2">
                  <p className="text-sm">If the download button does nothing in your older app, copy the link and paste it into Chrome once. Future app updates will open the browser directly.</p>
                  <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm" onClick={async () => {
                    if (!release?.download_url) return;
                    try { await navigator.clipboard.writeText(release.download_url); setCopied(true); }
                    catch { setCopied(false); }
                  }}>{copied ? 'Link copied' : 'Copy download link'}</button>
                  <p className="break-all select-text text-xs text-muted-foreground">{release?.download_url}</p>
                </div>
              )}
              <p className="text-sm text-muted-foreground">Android may open your browser to download the APK and ask you to allow installation from that source. Confirm the installation on your device.</p>
            </>
          )}
        </div>
      )}
    </main>
  );
}
