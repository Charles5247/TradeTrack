import type { Metadata } from "next";
import { DownloadClient } from "./download-client";

export const metadata: Metadata = {
  title: "Download",
  description:
    "Download TradeTrack for Windows or Android, or install it as an app directly from your browser. iOS and macOS support is coming soon.",
};

export const dynamic = "force-dynamic";

/**
 * Public download page — resolves to /download. Detects OS/browser
 * client-side (see download-client.tsx) to surface the right install
 * path: Android + desktop Chromium get a `beforeinstallprompt`-driven
 * PWA install button PLUS a direct APK/EXE download link (URLs sourced
 * from env vars — see render.yaml's TRADETRACK_*_DOWNLOAD_URL, never
 * committed binaries to git). iOS and macOS both show an explicit
 * "Coming soon" card — electron-builder only has a `win` target, so
 * there is no real Mac build to link to, and no misleading iOS
 * sideload instructions are given since iOS doesn't support installing
 * unsigned .ipa files without a developer account anyway.
 */
async function getVersionInfo() {
  try {
    // Server Component fetch of our own API route. Falls back to env
    // vars directly if the network round-trip fails for any reason —
    // both paths ultimately read the same TRADETRACK_* env vars.
    const apiVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";
    return {
      api_version: apiVersion,
      latest: {
        windows: {
          version: process.env.TRADETRACK_WINDOWS_LATEST_VERSION || null,
          download_url: process.env.TRADETRACK_WINDOWS_DOWNLOAD_URL || null,
        },
        android: {
          version: process.env.TRADETRACK_ANDROID_LATEST_VERSION || null,
          download_url: process.env.TRADETRACK_ANDROID_DOWNLOAD_URL || null,
          unknown_sources_help_url:
            process.env.TRADETRACK_ANDROID_UNKNOWN_SOURCES_HELP_URL || null,
        },
      },
    };
  } catch {
    return null;
  }
}

export default async function DownloadPage() {
  const versionInfo = await getVersionInfo();

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
      <div className="text-center mb-12 max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold">Download TradeTrack</h1>
        <p className="mt-3 text-muted-foreground">
          Get TradeTrack on the devices you already use — as an
          installed app on Windows and Android, or straight from your
          browser.
        </p>
      </div>

      <DownloadClient versionInfo={versionInfo} />
    </div>
  );
}
