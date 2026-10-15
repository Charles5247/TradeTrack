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

export const pilotCopy: Record<string, string> = {
  "Start 30-day free trial": "Start 30-day free trial",
  "Full business access for 30 days. No payment needed to start.": "Use everything for 30 days. No payment to start.",
  "Back to products": "Go back to products",
  "View cart and pay": "See cart and pay",
  "Free trial: {days} days remaining.": "Free trial: {days} days remain.",
  "Your free trial has ended. Your existing data remains available to view and export.": "Your free trial don end. You fit still view and export your data.",
  "Choose a plan to create new transactions.": "Choose plan to make new transactions.",
  "Complete business details and submit your registration for review to start the 30-day Business trial.": "Complete your business details and send your registration number make dem check am before your 30-day Business trial start.",
  "Business details submitted. Your trial will begin after platform verification.": "You don send your business details. Your trial go start after the platform check am.",
  "Verification was not approved. Update your business details and submit them again.": "Dem no approve the verification. Update your business details and send am again.",
  "Submit business details": "Send business details",
  "Close cart": "Close cart",
  "Pay": "Pay",
  "Pharmaceuticals": "Pharmaceuticals",
  "Warehousing merchants": "Warehouse merchants",
  "Manufacturers": "Manufacturers",
  "Built for shops, warehouses and finished goods.": "For shops, warehouses and finished goods.",
  "Track medicine stock and sales. Prescription and expiry management are not included.": "Track medicine stock and sales. Prescription and expiry tools no dey inside.",
  "Track stock across warehouses, transfers and sales.": "Track stock for warehouses, transfers and sales.",
  "Track finished-goods stock and sales. Production planning is not available.": "Track finished goods and sales. Production planning no dey available.",
  "Production planning and hospitality tools are planned; core inventory and sales tracking are available today.": "Production planning and hospitality tools dey plan; core stock and sales tracking dey available now.",
  "Your business assistant": "Your business assistant",
  "An AI assistant that works on your shop’s own data": "AI assistant wey dey use your shop own data",
  "Live AI needs an internet connection. Forecasts are estimates, and you review changes before saving.": "Live AI need internet. Forecast na estimate; check changes before you save.",
  "Bulk inventory upload": "Upload plenty stock at once",
  "Paste or upload product data. Review the draft before saving.": "Paste or upload product data. Check the draft before you save.",
  "Business insights": "Business insights",
  "Ask questions about your own sales and stock records.": "Ask questions about your own sales and stock records.",
  "Owner stays in control": "Owner still dey in control",
  "Every proposed inventory change needs your approval.": "You must approve every stock change.",
  "Stock analysis and prediction": "Stock analysis and prediction",
  "See sales pace and estimated stock coverage from recent records.": "See how fast goods sell and how long stock fit last.",
  "Follow-up business analytics": "Follow-up business analysis",
  "Ask another question to explore your business records.": "Ask another question about your business records.",
  "Staff performance": "Staff performance",
  "Compare cashier sales and transaction counts.": "Compare cashiers by sales and number of transactions.",
  "Live AI uses your business records. Review every proposed change before confirming.": "Live AI dey use your business records. Check every change before you approve.",
  "Ask about your business": "Ask about your business",
  "Ask about your sales or stock": "Ask about your sales or stock",
  "Owner reviewed": "Owner don review",
  "Prepare inventory drafts, ask business questions and review stock insights from your records.": "Draft stock, ask business questions and check insights from your records."
};
