import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getZainpayConfig } from "./zainpay-config";

const ZAINPAY_ENV_KEYS = [
  "ZAINPAY_MODE",
  "ZAINPAY_BASE_URL",
  "ZAINPAY_TEST_BASE_URL",
  "ZAINPAY_LIVE_BASE_URL",
  ...["TEST", "LIVE"].flatMap((mode) => [
    `ZAINPAY_${mode}_PUBLIC_KEY`,
    `ZAINPAY_${mode}_PRIVATE_KEY`,
    `ZAINPAY_${mode}_DEFAULT_ZAINBOX`,
    `ZAINPAY_${mode}_WEBHOOK_SECRET`,
    `ZAINPAY_${mode}_SECRET_KEY`,
    `ZAINPAY_${mode}_ZAINBOX_CODE`,
  ]),
  "ZAINPAY_PUBLIC_KEY",
  "ZAINPAY_PRIVATE_KEY",
  "ZAINPAY_DEFAULT_ZAINBOX",
  "ZAINPAY_WEBHOOK_SECRET",
  "ZAINPAY_SECRET_KEY",
  "ZAINPAY_ZAINBOX_CODE",
];

const previousValues = new Map<string, string | undefined>();

beforeEach(() => {
  previousValues.clear();
  for (const key of ZAINPAY_ENV_KEYS) {
    previousValues.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of previousValues) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("getZainpayConfig", () => {
  it("defaults to test mode and its sandbox endpoint", () => {
    expect(getZainpayConfig()).toMatchObject({
      mode: "test",
      baseUrl: "https://sandbox.zainpay.ng",
    });
  });

  it("selects the live endpoint and only live-profile credentials", () => {
    process.env.ZAINPAY_MODE = "live";
    process.env.ZAINPAY_TEST_PUBLIC_KEY = "test-key";
    process.env.ZAINPAY_LIVE_PUBLIC_KEY = "live-key";
    process.env.ZAINPAY_LIVE_BASE_URL = "https://live.example/";

    expect(getZainpayConfig()).toMatchObject({
      mode: "live",
      baseUrl: "https://live.example",
      publicKey: "live-key",
    });
  });

  it("infers legacy mode from the configured legacy endpoint", () => {
    process.env.ZAINPAY_BASE_URL = "https://api.zainpay.ng/";
    process.env.ZAINPAY_PUBLIC_KEY = "legacy-key";

    expect(getZainpayConfig()).toMatchObject({
      mode: "live",
      baseUrl: "https://api.zainpay.ng",
      publicKey: "legacy-key",
    });
  });

  it("rejects unsupported modes", () => {
    process.env.ZAINPAY_MODE = "production";

    expect(() => getZainpayConfig()).toThrow(
      'ZAINPAY_MODE must be either "test" or "live".',
    );
  });
});
