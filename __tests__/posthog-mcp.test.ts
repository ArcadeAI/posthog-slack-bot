import { describe, it, expect, vi, afterEach } from "vitest";

// Mock @ai-sdk/mcp before importing posthog-mcp
const mockClient = {
  tools: vi.fn().mockResolvedValue({}),
  close: vi.fn().mockResolvedValue(undefined),
};
const createMCPClientMock = vi.fn().mockReturnValue(mockClient);

vi.mock("@ai-sdk/mcp", () => ({
  createMCPClient: createMCPClientMock,
}));

// Import after mock is set up
const { getPostHogMCPClient, getPostHogMCPUrl } = await import(
  "../src/posthog-mcp.js"
);

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.POSTHOG_API_KEY;
  delete process.env.POSTHOG_MCP_URL;
});

describe("getPostHogMCPUrl", () => {
  it("returns the default PostHog MCP URL when env var is not set", () => {
    delete process.env.POSTHOG_MCP_URL;
    const url = getPostHogMCPUrl();
    expect(url).toContain("mcp.posthog.com");
    expect(url).toContain("features=insights");
  });

  it("returns POSTHOG_MCP_URL when set", () => {
    process.env.POSTHOG_MCP_URL = "https://custom.posthog.example/sse";
    const url = getPostHogMCPUrl();
    expect(url).toBe("https://custom.posthog.example/sse");
  });

  it("trims whitespace from POSTHOG_MCP_URL", () => {
    process.env.POSTHOG_MCP_URL = "  https://custom.example/sse  ";
    const url = getPostHogMCPUrl();
    expect(url).toBe("https://custom.example/sse");
  });
});

describe("getPostHogMCPClient", () => {
  it("throws when POSTHOG_API_KEY is missing", async () => {
    delete process.env.POSTHOG_API_KEY;
    await expect(getPostHogMCPClient()).rejects.toThrow("POSTHOG_API_KEY");
  });

  it("creates MCP client with Bearer token header", async () => {
    process.env.POSTHOG_API_KEY = "phx_test_key_123";
    await getPostHogMCPClient();
    expect(createMCPClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer phx_test_key_123",
          }),
        }),
      })
    );
  });

  it("uses SSE transport type", async () => {
    process.env.POSTHOG_API_KEY = "phx_test_key";
    await getPostHogMCPClient();
    expect(createMCPClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.objectContaining({ type: "sse" }),
      })
    );
  });

  it("uses default URL when POSTHOG_MCP_URL is not set", async () => {
    process.env.POSTHOG_API_KEY = "phx_test_key";
    delete process.env.POSTHOG_MCP_URL;
    await getPostHogMCPClient();
    expect(createMCPClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.objectContaining({
          url: expect.stringContaining("mcp.posthog.com"),
        }),
      })
    );
  });

  it("uses custom URL when POSTHOG_MCP_URL is set", async () => {
    process.env.POSTHOG_API_KEY = "phx_test_key";
    process.env.POSTHOG_MCP_URL = "https://custom.example/sse";
    await getPostHogMCPClient();
    expect(createMCPClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.objectContaining({
          url: "https://custom.example/sse",
        }),
      })
    );
  });

  it("returns client with tools and close methods", async () => {
    process.env.POSTHOG_API_KEY = "phx_test_key";
    const client = await getPostHogMCPClient();
    expect(typeof client.tools).toBe("function");
    expect(typeof client.close).toBe("function");
  });
});
