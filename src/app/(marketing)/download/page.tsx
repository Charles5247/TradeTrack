
import { TranslatedText } from '@/i18n/text';
import type { Metadata } from "next";
import { DownloadClient } from "./download-client";
import { Reveal } from "@/components/marketing/reveal";

export const metadata: Metadata = {
  title: "Download",
  description:
    "Install TracKasuwa on Android, iPhone, iPad, Mac, or Windows with the web app or available desktop download.",
};

export const dynamic = "force-dynamic";

/**
 * Public download page — resolves to /download. Detects OS/browser
 * client-side (see download-client.tsx) to surface the right install
 * path: supported Android and desktop Chromium browsers get a
 * `beforeinstallprompt` PWA action; iPhone and iPad get Safari
 * Add-to-Home-Screen steps. Native installers are shown only when their
 * real download URL is configured.
 */
async function getVersionInfo() {
  try {
    // Server Component fetch of our own API route. Falls back to env
    // vars directly if the network round-trip fails for any reason —
    // both paths ultimately read the same TracKasuwa_* env vars.
    const apiVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";
    return {
      api_version: apiVersion,
      latest: {
        windows: {
          version: process.env.TracKasuwa_WINDOWS_LATEST_VERSION || null,
          download_url: process.env.TracKasuwa_WINDOWS_DOWNLOAD_URL || null,
        },
        android: {
          version: process.env.TracKasuwa_ANDROID_LATEST_VERSION || null,
          download_url: process.env.TracKasuwa_ANDROID_DOWNLOAD_URL || null,
          unknown_sources_help_url:
            process.env.TracKasuwa_ANDROID_UNKNOWN_SOURCES_HELP_URL || null,
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
    <div>
      <section style={{ padding: "100px 0 40px", textAlign: "center" }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Reveal>
            <div className="tt-eyebrow mb-3"><TranslatedText text={"Download"} /></div>
          </Reveal>
          <Reveal delay={100}>
            <h1
              className="tt-head"
              style={{
                fontSize: "clamp(32px, 6vw, 64px)",
                margin: "0 0 20px",
                lineHeight: 1.05,
              }}
            ><TranslatedText text={"Get TracKasuwa on every device you sell from."} /></h1>
          </Reveal>
          <Reveal delay={200}>
            <p
              style={{
                fontSize: 18,
                color: "var(--c-textMuted)",
                maxWidth: 620,
                margin: "0 auto",
              }}
            ><TranslatedText text={"Use TracKasuwa on the phone or computer you already have. Install the web app from your browser, or get the Windows app when available."} /></p>
          </Reveal>
        </div>
      </section>

      <section style={{ padding: "20px 0 100px" }}>
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <DownloadClient versionInfo={versionInfo} />
        </div>
      </section>
    </div>
  );
}
