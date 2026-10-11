/**
 * TracKasuwa — Version / Update-Check API
 * GET /api/version
 *
 * Lightweight, public, always-on endpoint for browser/PWA clients and
 * packaged shells to check the currently deployed build. The shells also
 * use the platform-specific metadata below to check for binary releases.
 *
 * NOTE: This endpoint currently only reports metadata sourced from
 * environment variables set at deploy time — it does NOT serve actual
 * installer binaries or auto-download update packages. Wiring real
 * per-platform download URLs (e.g. to a releases bucket/CDN) is deferred
 * to the Electron/React Native scaffolding work itself, which has not
 * been built in this pass.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    // The web app's own package version — Electron/RN clients should
    // compare their own bundled app version against `latest.*` below,
    // not against this field (this just reflects the backend/web build).
    api_version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
    deployment_id: process.env.NEXT_PUBLIC_DEPLOYMENT_ID ?? "local",
    latest: {
      windows: {
        version: process.env.TracKasuwa_WINDOWS_LATEST_VERSION ?? null,
        download_url: process.env.TracKasuwa_WINDOWS_DOWNLOAD_URL ?? null,
      },
      android: {
        version: process.env.TracKasuwa_ANDROID_LATEST_VERSION ?? null,
        download_url: process.env.TracKasuwa_ANDROID_DOWNLOAD_URL ?? null,
        // Android side-loaded APKs require "Install from unknown sources"
        // to be enabled — clients should surface this doc link on first
        // install / update prompt.
        unknown_sources_help_url:
          process.env.TracKasuwa_ANDROID_UNKNOWN_SOURCES_HELP_URL ?? null,
      },
    },
    checked_at: new Date().toISOString(),
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
