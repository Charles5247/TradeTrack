// Nigerian Pidgin. Shared technical terms stay familiar.
import { en } from './en';
import copy from './pcm-copy.json';
const phrases: Record<string, string> = copy;
function localize(value: unknown): unknown {
  if (typeof value === 'string') return phrases[value] ?? value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, localize(child)]));
}
export const pcm = localize(en) as typeof en;

export const downloadCopy = {
  "Download app": "Download app",
  "Download for Android": "Download for Android",
  "Download for Windows": "Download for Windows",
  "Download Android APK": "Download Android APK",
  "Download Windows EXE": "Download Windows EXE",
  "Coming soon": "E dey come soon",
  "Version": "Version",
  "Recommended for your device": "Na this one fit your device",
  "Web app (install from your browser)": "Web app (install from your browser)",
  "For iPhone, iPad, Mac and other devices. No app store needed.": "For iPhone, iPad, Mac and other devices. You no need app store.",
  "iPhone or iPad: open this site in Safari and tap Share.": "iPhone or iPad: open this site for Safari, tap Share.",
  "Tap Add to Home Screen, then Add. Open TracKasuwa from its icon.": "Tap Add to Home Screen, then Add. Tap TracKasuwa icon to open am.",
  "Mac: in Safari, choose File, then Add to Dock.": "Mac: for Safari, choose File, then Add to Dock.",
  "Chrome or Edge: choose Install app from the browser menu.": "Chrome or Edge: choose Install app from browser menu.",
  "Open the downloaded APK. If asked, tap Settings and allow installs from this source. Return and tap Install.": "Open the APK wey you download. If dem ask, tap Settings and allow installs from this source. Go back, tap Install.",
  "Play Protect may warn about apps outside the Play Store. For this trusted download, tap More details, then Install anyway if offered.": "Play Protect fit warn you about apps outside Play Store. For this download wey you trust, tap More details, then Install anyway if you see am.",
  "Open the installer. If SmartScreen says “Windows protected your PC”, tap “More info”, then “Run anyway”.": "Open the installer. If SmartScreen talk “Windows protected your PC”, tap “More info”, then “Run anyway”.",
  "Download for Android or Windows, or install the web app.": "Download for Android or Windows, or install the web app."
};
