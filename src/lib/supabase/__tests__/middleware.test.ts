import { describe, expect, it } from "vitest";
import { shouldForceLogin } from "../middleware";

describe("shouldForceLogin", () => {
  it("does not force login for protected routes when an offline auth cookie is present", () => {
    expect(shouldForceLogin("/dashboard", null, true, false, true)).toBe(false);
  });

  it("does not force login when the live auth check resolves null but the offline cookie still exists", () => {
    expect(shouldForceLogin("/dashboard", null, false, false, true)).toBe(
      false,
    );
  });

  it("forces login for protected routes when there is no session and no offline cookie", () => {
    expect(shouldForceLogin("/dashboard", null, false, false, false)).toBe(
      true,
    );
  });

  it("allows auth routes to proceed for authenticated users", () => {
    expect(
      shouldForceLogin("/login", { id: "user-1" } as never, false, true, false),
    ).toBe(false);
  });
});
