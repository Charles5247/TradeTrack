import { describe, expect, it, vi } from "vitest";
import { withTimeout } from "../timeout";

describe("withTimeout", () => {
  it("resolves with the original value when the promise settles before the timeout", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 1000);
    expect(result).toBe("ok");
  });

  it("rejects with the original error when the promise rejects before the timeout", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("boom")), 1000),
    ).rejects.toThrow("boom");
  });

  it("rejects with a timeout error when the promise never settles in time", async () => {
    vi.useFakeTimers();
    try {
      const neverSettles = new Promise(() => {});
      const result = withTimeout(neverSettles, 3000, "getUser timed out");
      const assertion = expect(result).rejects.toThrow("getUser timed out");
      await vi.advanceTimersByTimeAsync(3000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fire the timeout once the promise has already resolved", async () => {
    vi.useFakeTimers();
    try {
      const result = withTimeout(Promise.resolve("fast"), 3000);
      await vi.advanceTimersByTimeAsync(0);
      await expect(result).resolves.toBe("fast");
      // Advancing well past the timeout afterwards must not throw/reject —
      // the internal timer should already have been cleared.
      await vi.advanceTimersByTimeAsync(5000);
    } finally {
      vi.useRealTimers();
    }
  });
});
