import { createMCPClient } from "@ai-sdk/mcp";

const DEFAULT_MCP_URL =
  "https://mcp.posthog.com/sse?features=insights,dashboards,workspace,error-tracking,flags,docs";

const MCP_CONNECT_TIMEOUT_MS = 5_000;

export function getPostHogMCPUrl(): string {
  return process.env.POSTHOG_MCP_URL?.trim() || DEFAULT_MCP_URL;
}

/**
 * Create an MCP client for PostHog's read-only MCP server.
 * Authenticates with a Bearer token from POSTHOG_API_KEY.
 * Connection times out after 5 seconds.
 */
export async function getPostHogMCPClient() {
  const apiKey = process.env.POSTHOG_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "POSTHOG_API_KEY is missing. Set it in your .env file (PostHog Settings → API keys → Personal API keys)."
    );
  }

  const url = getPostHogMCPUrl();

  // createMCPClient is async — wrap with a connection timeout
  const connectPromise = createMCPClient({
    transport: {
      type: "sse",
      url,
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(
            "PostHog MCP connection timed out. Check your POSTHOG_API_KEY and network."
          )
        ),
      MCP_CONNECT_TIMEOUT_MS
    )
  );

  const client = await Promise.race([connectPromise, timeoutPromise]);

  return {
    tools: () => client.tools(),
    close: () => client.close(),
  };
}
