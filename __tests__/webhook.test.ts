import { describe, it, expect, afterEach } from "vitest";
import { isChannelAllowed } from "../src/utils.js";

// Note: Full Slack webhook signature verification is handled by the Chat SDK's
// SlackAdapter internally (using SLACK_SIGNING_SECRET). This test file verifies
// the channel allowlist logic that wraps around the SDK.

afterEach(() => {
  delete process.env.ALLOWED_CHANNEL_IDS;
});

describe("isChannelAllowed — channel allowlist", () => {
  it("allows all channels when ALLOWED_CHANNEL_IDS is not set", () => {
    delete process.env.ALLOWED_CHANNEL_IDS;
    expect(isChannelAllowed("C12345")).toBe(true);
    expect(isChannelAllowed("CXYZ999")).toBe(true);
  });

  it("allows all channels when ALLOWED_CHANNEL_IDS is empty string", () => {
    process.env.ALLOWED_CHANNEL_IDS = "";
    expect(isChannelAllowed("C12345")).toBe(true);
  });

  it("allows a channel that is in the allowlist", () => {
    process.env.ALLOWED_CHANNEL_IDS = "C12345,C67890";
    expect(isChannelAllowed("C12345")).toBe(true);
    expect(isChannelAllowed("C67890")).toBe(true);
  });

  it("blocks a channel that is not in the allowlist", () => {
    process.env.ALLOWED_CHANNEL_IDS = "C12345,C67890";
    expect(isChannelAllowed("COTHER")).toBe(false);
  });

  it("handles whitespace around channel IDs", () => {
    process.env.ALLOWED_CHANNEL_IDS = "  C12345 , C67890  ";
    expect(isChannelAllowed("C12345")).toBe(true);
    expect(isChannelAllowed("C67890")).toBe(true);
    expect(isChannelAllowed("COTHER")).toBe(false);
  });

  it("handles single channel in allowlist", () => {
    process.env.ALLOWED_CHANNEL_IDS = "C12345";
    expect(isChannelAllowed("C12345")).toBe(true);
    expect(isChannelAllowed("C99999")).toBe(false);
  });

  it("is case-sensitive (Slack channel IDs are uppercase)", () => {
    process.env.ALLOWED_CHANNEL_IDS = "C12345";
    expect(isChannelAllowed("c12345")).toBe(false);
    expect(isChannelAllowed("C12345")).toBe(true);
  });
});
