"use client";

import { useEffect, useState } from "react";
import {
  Download as DownloadIcon,
  Smartphone,
  Monitor,
  Apple,
  Clock,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

type OS = "windows" | "android" | "ios" | "macos" | "linux" | "other";

interface VersionInfo {
  api_version: string;
  latest: {
    windows: { version: string | null; download_url: string | null };
    android: {
      version: string | null;
      download_url: string | null;
      unknown_sources_help_url: string | null;
    };
  };
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Simple UA sniff — good enough to pick the right install card. Does
 *  not gate anything security-sensitive, only which card is shown
 *  first; every card remains visible/scrollable regardless. */
function detectOS(): OS {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;

  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/Mac/i.test(ua) && "ontouchend" in document === false) return "macos";
  if (/Win/i.test(ua)) return "windows";
  if (/Linux/i.test(ua)) return "linux";
  return "other";
}

function isChromiumBased(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // Chrome, Edge, Brave, Opera, etc. all carry "Chrome"/"Chromium" in UA;
  // exclude Safari specifically (Safari's UA also lacks "Chrome").
  return /Chrome|Chromium|Edg\//i.test(ua) && !/OPR\/|Firefox/i.test(ua) === true;
}

export function DownloadClient({
  versionInfo,
}: {
  versionInfo: VersionInfo | null;
}) {
  const [os, setOs] = useState<OS>("other");
  const [chromium, setChromium] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setOs(detectOS());
    setChromium(isChromiumBased());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => setInstalled(true);
    window.addEventListener("appinstalled", installedHandler);

    // Already running as an installed PWA?
    if (window.matchMedia?.("(display-mode: standalone)").matches) {
      setInstalled(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const windowsUrl = versionInfo?.latest.windows.download_url || null;
  const androidUrl = versionInfo?.latest.android.download_url || null;
  const unknownSourcesUrl =
    versionInfo?.latest.android.unknown_sources_help_url || null;
  const canInstallPwa = !!deferredPrompt && !installed;

  return (
    <div className="space-y-8">
      {/* Recommended card, based on detected OS */}
      {os === "android" && (
        <RecommendedBanner label="We detected Android" />
      )}
      {os === "windows" && (
        <RecommendedBanner label="We detected Windows" />
      )}
      {(os === "ios" || os === "macos") && (
        <RecommendedBanner label={`We detected ${os === "ios" ? "iOS" : "macOS"}`} />
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Windows */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-primary" />
              <CardTitle>Windows Desktop</CardTitle>
              {os === "windows" && <Badge variant="info">Detected</Badge>}
            </div>
            <CardDescription>
              Native desktop app (.exe installer)
              {versionInfo?.latest.windows.version
                ? ` — v${versionInfo.latest.windows.version}`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {windowsUrl ? (
              <Button className="w-full" asChild>
                <a href={windowsUrl} download>
                  <DownloadIcon className="h-4 w-4 mr-2" />
                  Download for Windows
                </a>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Download link not configured yet. Please check back soon.
              </p>
            )}

            <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
              <li>Download and run the installer.</li>
              <li>
                Windows SmartScreen may show{" "}
                <span className="font-medium text-foreground">
                  "Windows protected your PC"
                </span>{" "}
                — this is expected for a new, unsigned app. Click{" "}
                <span className="font-medium text-foreground">
                  "More info" → "Run anyway"
                </span>{" "}
                to continue.
              </li>
              <li>Follow the setup wizard to finish installing.</li>
              <li>Launch TradeTrack from your Start Menu.</li>
            </ol>
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                This warning appears because the installer isn't yet
                signed with a commercial code-signing certificate — it
                does not mean the app is unsafe.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Android */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <CardTitle>Android</CardTitle>
              {os === "android" && <Badge variant="info">Detected</Badge>}
            </div>
            <CardDescription>
              Native Android app (.apk){" "}
              {versionInfo?.latest.android.version
                ? `— v${versionInfo.latest.android.version}`
                : ""}{" "}
              or install as a PWA in Chrome
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {os === "android" && chromium && canInstallPwa && (
              <Button className="w-full" onClick={handleInstallClick}>
                <DownloadIcon className="h-4 w-4 mr-2" />
                Install App (Chrome)
              </Button>
            )}
            {os === "android" && chromium && installed && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Already installed
              </div>
            )}

            {androidUrl ? (
              <Button className="w-full" variant="outline" asChild>
                <a href={androidUrl} download>
                  <DownloadIcon className="h-4 w-4 mr-2" />
                  Download APK
                </a>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                APK download link not configured yet. Please check back
                soon.
              </p>
            )}

            <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
              <li>Download the APK file.</li>
              <li>
                Android will warn{" "}
                <span className="font-medium text-foreground">
                  "Install blocked" / "unknown sources"
                </span>{" "}
                — this is expected since the app isn't distributed via
                the Play Store yet. Tap{" "}
                <span className="font-medium text-foreground">Settings</span>{" "}
                and allow installs from this source.
              </li>
              <li>Return to the download and tap Install.</li>
              <li>Open TradeTrack from your app drawer.</li>
            </ol>
            {unknownSourcesUrl && (
              <a
                href={unknownSourcesUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Need help enabling unknown sources?
              </a>
            )}
          </CardContent>
        </Card>

        {/* Desktop Chromium PWA (non-Windows-specific, e.g. ChromeOS/Linux) */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-primary" />
              <CardTitle>Desktop Browser (Chrome/Edge)</CardTitle>
            </div>
            <CardDescription>
              Install TradeTrack as an app directly from your browser
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {chromium && canInstallPwa ? (
              <Button className="w-full" onClick={handleInstallClick}>
                <DownloadIcon className="h-4 w-4 mr-2" />
                Install App
              </Button>
            ) : chromium && installed ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Already installed
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Open this page in Chrome or Edge, then look for the
                install icon in your browser's address bar (or this
                button will appear automatically).
              </p>
            )}
          </CardContent>
        </Card>

        {/* iOS / macOS — Coming soon, no misleading links */}
        <Card className="border-dashed border-2 bg-muted/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Apple className="h-5 w-5 text-muted-foreground" />
              <CardTitle>iOS &amp; macOS</CardTitle>
              <Badge variant="outline">
                <Clock className="h-3 w-3 mr-1" />
                Coming Soon
              </Badge>
              {(os === "ios" || os === "macos") && (
                <Badge variant="info">Detected</Badge>
              )}
            </div>
            <CardDescription>
              Native iOS and macOS apps are not available yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              We don't have an iOS or macOS build to offer right now —
              we'd rather say that plainly than give you a link that
              doesn't work. In the meantime, you can use TradeTrack
              directly in Safari at your usual web address.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RecommendedBanner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-2 w-fit mx-auto">
      <CheckCircle2 className="h-4 w-4 text-green-600" />
      {label} — showing the best option for your device below.
    </div>
  );
}
