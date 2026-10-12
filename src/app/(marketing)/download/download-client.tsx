"use client";
import { TranslatedText, useCopy } from '@/i18n/text';


import { useEffect, useState } from "react";
import {
  Download as DownloadIcon,
  Smartphone,
  Monitor,
  Apple,
  ShieldAlert,
  CheckCircle2,
  Share,
  Plus,
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
  const isIPadOS =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/i.test(ua) || isIPadOS) return "ios";
  if (/Mac/i.test(ua)) return "macos";
  if (/Win/i.test(ua)) return "windows";
  if (/Linux/i.test(ua)) return "linux";
  return "other";
}

function isChromiumBased(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // Chrome, Edge, Brave, Opera, etc. all carry "Chrome"/"Chromium" in UA;
  // exclude Safari specifically (Safari's UA also lacks "Chrome").
  return (
    /Chrome|Chromium|Edg\//i.test(ua) && !/OPR\/|Firefox/i.test(ua) === true
  );
}

export function DownloadClient({
  versionInfo,
}: {
  versionInfo: VersionInfo | null;
}) {
  const copy = useCopy();
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
  const isAppleDevice = os === "ios" || os === "macos";
  const windowsOrder = "order-4";
  const androidOrder = os === "android" ? "order-1" : isAppleDevice ? "order-3" : "order-2";
  const pwaOrder = os === "android" || isAppleDevice ? "order-2" : "order-1";
  const appleOrder = isAppleDevice ? "order-1" : "order-3";

  return (
    <div className="space-y-8">
      {/* Recommended card, based on detected OS */}
      {os === "android" && <RecommendedBanner label={copy("We detected Android")} />}
      {os === "windows" && <RecommendedBanner label={copy("We detected Windows")} />}
      {(os === "ios" || os === "macos") && (
        <RecommendedBanner label={copy(os === "ios" ? "We detected iOS" : "We detected macOS")} />
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Windows */}
        <Card id="windows" className={`scroll-mt-24 ${windowsOrder} ${os === "windows" ? "" : "sm:opacity-90"}`}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-primary" />
              <CardTitle><TranslatedText text={"Windows Desktop"} /></CardTitle>
              {os === "windows" && <Badge variant="info"><TranslatedText text={"Detected"} /></Badge>}
            </div>
            <CardDescription><TranslatedText text={"Native desktop app (.exe installer)"} />{versionInfo?.latest.windows.version
                ? ` — v${versionInfo.latest.windows.version}`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {windowsUrl ? (
              <Button className="w-full" asChild>
                <a href={windowsUrl} download>
                  <DownloadIcon className="h-4 w-4 mr-2" /><TranslatedText text={"Download for Windows"} /></a>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground"><TranslatedText text={"Download link not configured yet. Please check back soon."} /></p>
            )}

            <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
              <li><TranslatedText text={"Download and run the installer."} /></li>
              <li><TranslatedText text={"Windows SmartScreen may show"} />{" "}
                <span className="font-medium text-foreground"><TranslatedText text={"\"Windows protected your PC\""} /></span>{" "}<TranslatedText text={"— this is expected for a new, unsigned app. Click"} />{" "}
                <span className="font-medium text-foreground"><TranslatedText text={"\"More info\" → \"Run anyway\""} /></span>{" "}<TranslatedText text={"to continue."} /></li>
              <li><TranslatedText text={"Follow the setup wizard to finish installing."} /></li>
              <li><TranslatedText text={"Launch TracKasuwa from your Start Menu."} /></li>
            </ol>
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <span><TranslatedText text={"This warning appears because the installer isn't yet signed with a commercial code-signing certificate — it does not mean the app is unsafe."} /></span>
            </div>
          </CardContent>
        </Card>

        {/* Android */}
        <Card id="android" className={`scroll-mt-24 ${androidOrder}`}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <CardTitle><TranslatedText text={"Android phone"} /></CardTitle>
              {os === "android" && <Badge variant="info"><TranslatedText text={"Detected"} /></Badge>}
            </div>
            <CardDescription><TranslatedText text={"Install the web app from Chrome on your Android phone."} /></CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {os === "android" && chromium && canInstallPwa && (
              <Button className="w-full" onClick={handleInstallClick}>
                <DownloadIcon className="h-4 w-4 mr-2" /><TranslatedText text={"Install on this phone"} /></Button>
            )}
            {os === "android" && installed && (
              <div className="flex items-center gap-2 text-sm text-[var(--c-success)]">
                <CheckCircle2 className="h-4 w-4" /><TranslatedText text={"Already installed"} /></div>
            )}
            {os === "android" && !canInstallPwa && !installed && (
              <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                <li><TranslatedText text={"Open this page in Chrome on your Android phone."} /></li>
                <li><TranslatedText text={"Tap the menu ⋮, then tap Install app or Add to Home screen."} /></li>
                <li><TranslatedText text={"Tap Install or Add, then open TracKasuwa from your Home screen."} /></li>
              </ol>
            )}

            {androidUrl ? (
              <Button className="w-full" variant="outline" asChild>
                <a href={androidUrl} download>
                  <DownloadIcon className="h-4 w-4 mr-2" /><TranslatedText text={"Download Android app"} /></a>
              </Button>
            ) : (
              <Badge variant="outline"><TranslatedText text={"Android app download coming soon"} /></Badge>
            )}

            {androidUrl && unknownSourcesUrl && (
              <a
                href={unknownSourcesUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline"
              ><TranslatedText text={"Need help enabling unknown sources?"} /></a>
            )}
          </CardContent>
        </Card>

        {/* Desktop Chromium PWA (non-Windows-specific, e.g. ChromeOS/Linux) */}
        <Card className={pwaOrder}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-primary" />
              <CardTitle><TranslatedText text={"Install from your browser"} /></CardTitle>
            </div>
            <CardDescription><TranslatedText text={"Add TracKasuwa to your device so it opens like an app."} /></CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {chromium && canInstallPwa ? (
              <Button className="w-full" onClick={handleInstallClick}>
                <DownloadIcon className="h-4 w-4 mr-2" /><TranslatedText text={"Install App"} /></Button>
            ) : chromium && installed ? (
              <div className="flex items-center gap-2 text-sm text-[var(--c-success)]">
                <CheckCircle2 className="h-4 w-4" /><TranslatedText text={"Already installed"} /></div>
            ) : (
              <p className="text-sm text-muted-foreground"><TranslatedText text={"Open this page in Chrome or Edge. Tap the install icon in the address bar, or choose Install app from the browser menu."} /></p>
            )}
          </CardContent>
        </Card>

        {/* iOS home-screen PWA — iOS does not expose beforeinstallprompt. */}
        <Card className={appleOrder}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Apple className="h-5 w-5 text-primary" />
              <CardTitle><TranslatedText text={"iPhone, iPad & Mac"} /></CardTitle>
              {os === "ios" && (
                <Badge variant="info"><TranslatedText text={"Detected"} /></Badge>
              )}
            </div>
            <CardDescription><TranslatedText text={"Use TracKasuwa as an installable web app from Safari. No App Store download is needed."} /></CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {os !== "macos" && <ol className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span>
                <span><TranslatedText text={"Open this site in Safari on your iPhone or iPad."} /></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span>
                <span className="flex flex-wrap items-center gap-1"><TranslatedText text={"Tap the Share button"} /> <Share className="h-4 w-4 text-primary" aria-label={copy("Share")} /> <TranslatedText text={"in Safari."} /></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">3</span>
                <span className="flex flex-wrap items-center gap-1"><TranslatedText text={"Scroll down and tap Add to Home Screen"} /> <Plus className="h-4 w-4 text-primary" aria-label={copy("Add")} /><TranslatedText text={"."} /></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">4</span>
                <span><TranslatedText text={"If shown, turn on Open as Web App, tap Add, then launch TracKasuwa from its new Home Screen icon."} /></span>
              </li>
            </ol>}
            {os !== "macos" && <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground"><TranslatedText text={"For the install option to appear, use Safari and make sure your iPhone or iPad is online the first time. The installed PWA opens in its own app window; sign in there to use the POS and inventory features."} /></p>}
            {os === "macos" && (
              <p className="text-xs text-muted-foreground"><TranslatedText text={"On Mac, open this site in Safari and choose File, then Add to Dock."} /></p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RecommendedBanner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-2 w-fit mx-auto">
      <CheckCircle2 className="h-4 w-4 text-[var(--c-success)]" />
      {label}{" "}<TranslatedText text={"— showing the best option for your device below."} /></div>
  );
}
