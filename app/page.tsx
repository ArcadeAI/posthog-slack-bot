import { getArcadeGatewayUrl } from "@/src/arcade-mcp";

interface EnvStatus {
  name: string;
  set: boolean;
  required: boolean;
}

interface HealthStatus {
  status: "ok" | "degraded" | "error";
  mcpReachable: boolean | null;
  mcpUrl: string;
  env: EnvStatus[];
  checkedAt: string;
}

async function checkMCPHealth(url: string): Promise<boolean> {
  try {
    // Use the base URL (strip query params) for a HEAD check
    const baseUrl = url.split("?")[0];
    const res = await fetch(baseUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(5_000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function getHealthStatus(): Promise<HealthStatus> {
  let mcpUrl: string;
  try {
    mcpUrl = getArcadeGatewayUrl();
  } catch {
    mcpUrl = "(not configured)";
  }
  const mcpReachable = mcpUrl !== "(not configured)" ? await checkMCPHealth(mcpUrl) : false;

  const env: EnvStatus[] = [
    {
      name: "ARCADE_GATEWAY_URL",
      set: Boolean(process.env.ARCADE_GATEWAY_URL),
      required: true,
    },
    {
      name: "APP_URL",
      set: Boolean(process.env.APP_URL),
      required: false,
    },
    {
      name: "SLACK_BOT_TOKEN",
      set: Boolean(process.env.SLACK_BOT_TOKEN),
      required: true,
    },
    {
      name: "SLACK_SIGNING_SECRET",
      set: Boolean(process.env.SLACK_SIGNING_SECRET),
      required: true,
    },
    {
      name: "ANTHROPIC_API_KEY or OPENAI_API_KEY",
      set:
        Boolean(process.env.ANTHROPIC_API_KEY) ||
        Boolean(process.env.OPENAI_API_KEY),
      required: true,
    },
    {
      name: "REDIS_URL",
      set: Boolean(process.env.REDIS_URL),
      required: false,
    },
    {
      name: "ALLOWED_CHANNEL_IDS",
      set: Boolean(process.env.ALLOWED_CHANNEL_IDS),
      required: false,
    },
  ];

  const allRequiredSet = env.filter((e) => e.required).every((e) => e.set);
  const status =
    !allRequiredSet ? "error" : !mcpReachable ? "degraded" : "ok";

  return {
    status,
    mcpReachable,
    mcpUrl,
    env,
    checkedAt: new Date().toISOString(),
  };
}

export default async function HealthPage() {
  const health = await getHealthStatus();

  const statusColor = {
    ok: "#22c55e",
    degraded: "#f59e0b",
    error: "#ef4444",
  }[health.status];

  const statusLabel = {
    ok: "Healthy",
    degraded: "Degraded",
    error: "Error",
  }[health.status];

  return (
    <main
      style={{
        fontFamily: "monospace",
        padding: "2rem",
        maxWidth: "600px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span
          style={{
            display: "inline-block",
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            background: statusColor,
          }}
        />
        PostHog Slack Bot — {statusLabel}
      </h1>

      <section>
        <h2>MCP Connectivity</h2>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <tbody>
            <tr>
              <td style={{ padding: "0.25rem 0.5rem" }}>URL</td>
              <td style={{ padding: "0.25rem 0.5rem", wordBreak: "break-all" }}>
                {health.mcpUrl}
              </td>
            </tr>
            <tr>
              <td style={{ padding: "0.25rem 0.5rem" }}>Reachable</td>
              <td style={{ padding: "0.25rem 0.5rem" }}>
                {health.mcpReachable === null
                  ? "unknown"
                  : health.mcpReachable
                    ? "yes"
                    : "no"}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Environment Variables</h2>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>
                Variable
              </th>
              <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>
                Status
              </th>
              <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>
                Required
              </th>
            </tr>
          </thead>
          <tbody>
            {health.env.map((e) => (
              <tr key={e.name}>
                <td style={{ padding: "0.25rem 0.5rem" }}>{e.name}</td>
                <td
                  style={{
                    padding: "0.25rem 0.5rem",
                    color: e.set ? "#22c55e" : e.required ? "#ef4444" : "#9ca3af",
                  }}
                >
                  {e.set ? "set" : "not set"}
                </td>
                <td style={{ padding: "0.25rem 0.5rem" }}>
                  {e.required ? "yes" : "no"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
        Checked at {health.checkedAt}
      </p>
    </main>
  );
}
