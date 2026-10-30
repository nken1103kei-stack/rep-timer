import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "../../worker/session";

describe("session tokens", () => {
  it("round-trips the user id", async () => {
    const token = await signSession("google-sub-123", "secret-a");
    expect(await verifySession(token, "secret-a")).toBe("google-sub-123");
  });

  it("rejects a token signed with another secret or tampered", async () => {
    const token = await signSession("google-sub-123", "secret-a");
    expect(await verifySession(token, "secret-b")).toBeNull();
    expect(await verifySession(token.slice(0, -2) + "xx", "secret-a")).toBeNull();
    expect(await verifySession("garbage", "secret-a")).toBeNull();
  });
});
