import { toast } from "sonner";

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export function requireOnline(featureName: string): boolean {
  if (isOffline()) {
    toast.error(
      `${featureName} is unavailable while offline. Please reconnect to the internet and try again.`,
    );
    return false;
  }

  return true;
}
