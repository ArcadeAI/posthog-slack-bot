import { createMCPClient } from "@ai-sdk/mcp";

const MCP_CONNECT_TIMEOUT_MS = 5_000;

export function getArcadeGatewayUrl(): string {
  const value = process.env.ARCADE_GATEWAY_URL?.trim();
  if (!value) {
    throw new Error(
      "ARCADE_GATEWAY_URL is missing. Create a gateway at https://app.arcade.dev/mcp-gateways and add your PostHog toolkit."
    );
  }
  return value;
}

/**
 * Create an MCP client pointed at the Arcade gateway.
 * Authenticates with ARCADE_API_KEY as a Bearer token.
 * Connection times out after 5 seconds.
 */
export async function getArcadeMCPClient() {
  const apiKey = process.env.ARCADE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "ARCADE_API_KEY is missing. Get your key at https://app.arcade.dev/settings/api-keys."
    );
  }

  const url = getArcadeGatewayUrl();
  const transportType = url.endsWith("/sse") ? "sse" : "http";

  const connectPromise = createMCPClient({
    transport: {
      type: transportType,
      url,
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(
            "Arcade MCP Gateway connection timed out. Check your ARCADE_GATEWAY_URL and ARCADE_API_KEY."
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
