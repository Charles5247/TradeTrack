import type { SiteImage } from "./images";

export interface SocialProofEntry {
  name: string;
  quote?: string;
  business?: string;
  logo?: SiteImage;
  permissionGranted: boolean;
}

export const showSocialProof = false;
export const socialProofEntries: SocialProofEntry[] = [];
