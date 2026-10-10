export type ZainpayMode = "test" | "live";

export interface ZainpayConfig {
  mode: ZainpayMode;
  baseUrl: string;
  publicKey: string;
  privateKey: string;
  defaultZainbox: string;
  webhookSecret: string;
  secretKey: string;
  zainboxCode: string;
}

const MODE_BASE_URLS: Record<ZainpayMode, string> = {
  test: "https://sandbox.zainpay.ng",
  live: "https://api.zainpay.ng",
};

const MODE_CREDENTIAL_SUFFIXES = [
  "PUBLIC_KEY",
  "PRIVATE_KEY",
  "DEFAULT_ZAINBOX",
  "WEBHOOK_SECRET",
  "SECRET_KEY",
  "ZAINBOX_CODE",
] as const;

function getMode(): { mode: ZainpayMode; explicitlySet: boolean } {
  const configuredMode = process.env.ZAINPAY_MODE?.trim().toLowerCase();

  if (configuredMode === "test" || configuredMode === "live") {
    return { mode: configuredMode, explicitlySet: true };
  }
  if (configuredMode) {
    throw new Error('ZAINPAY_MODE must be either "test" or "live".');
  }

  const legacyBaseUrl = process.env.ZAINPAY_BASE_URL?.trim();
  const mode = legacyBaseUrl && !legacyBaseUrl.toLowerCase().includes("sandbox")
    ? "live"
    : "test";
  return { mode, explicitlySet: false };
}

export function getZainpayConfig(): ZainpayConfig {
  const { mode, explicitlySet } = getMode();
  const prefix = mode === "test" ? "ZAINPAY_TEST" : "ZAINPAY_LIVE";
  const otherPrefix = mode === "test" ? "ZAINPAY_LIVE" : "ZAINPAY_TEST";
  const hasModeCredentials = MODE_CREDENTIAL_SUFFIXES.some(
    (suffix) =>
      Boolean(
        process.env[`${prefix}_${suffix}`] ||
          process.env[`${otherPrefix}_${suffix}`],
      ),
  );

  const credential = (suffix: (typeof MODE_CREDENTIAL_SUFFIXES)[number], legacyName: string) => {
    if (hasModeCredentials) {
      return process.env[`${prefix}_${suffix}`]?.trim() ?? "";
    }
    return process.env[legacyName]?.trim() ?? "";
  };

  const configuredBaseUrl = explicitlySet
    ? process.env[`${prefix}_BASE_URL`]
    : process.env.ZAINPAY_BASE_URL;

  return {
    mode,
    baseUrl: (configuredBaseUrl?.trim() || MODE_BASE_URLS[mode]).replace(/\/+$/, ""),
    publicKey: credential("PUBLIC_KEY", "ZAINPAY_PUBLIC_KEY"),
    privateKey: credential("PRIVATE_KEY", "ZAINPAY_PRIVATE_KEY"),
    defaultZainbox: credential("DEFAULT_ZAINBOX", "ZAINPAY_DEFAULT_ZAINBOX"),
    webhookSecret: credential("WEBHOOK_SECRET", "ZAINPAY_WEBHOOK_SECRET"),
    secretKey: credential("SECRET_KEY", "ZAINPAY_SECRET_KEY"),
    zainboxCode: credential("ZAINBOX_CODE", "ZAINPAY_ZAINBOX_CODE"),
  };
}
