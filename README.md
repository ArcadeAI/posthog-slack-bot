# posthog-slack-bot

A Slack bot that lets your team chat with PostHog analytics data. Ask questions in natural language and get answers powered by the [Arcade MCP Gateway](https://app.arcade.dev/mcp-gateways) + PostHog toolkit, and Claude or GPT-4.

> **Branch:** `arcade-gateway` — uses Arcade as the MCP backend instead of connecting to PostHog's MCP server directly. See `main` for the direct PostHog MCP version.

## Features

- **`@mention` the bot** in any Slack thread to start a conversation
- **Follow-up messages** in subscribed threads are handled automatically (no need to re-tag)
- **`/posthog <query>`** slash command for quick one-off queries
- **Read-only** — only uses PostHog's read-only MCP tools (no writes)
- **Channel allowlist** — optionally restrict to specific channels
- **Audit logging** — structured JSON logs for every query
- **Health status page** at `/` — shows MCP connectivity and env var status

## Quick Start

### 1. Clone and install

```bash
cd posthog-slack-bot
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Where to find it |
|---|---|
| `ARCADE_GATEWAY_URL` | [app.arcade.dev/mcp-gateways](https://app.arcade.dev/mcp-gateways) — create a gateway, add the PostHog toolkit, copy the URL |
| `APP_URL` | Your deployment URL (e.g. `https://your-app.vercel.app`) — required for the OAuth callback |
| `SLACK_BOT_TOKEN` | Slack app config → OAuth & Permissions → Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | Slack app config → Basic Information → Signing Secret |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) (if not using Anthropic) |

### 3. Create your Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From manifest
2. Use the manifest below, replacing `YOUR_URL` with your deployment URL:

```yaml
display_information:
  name: PostHog Bot
features:
  bot_user:
    display_name: posthog-bot
    always_online: true
  slash_commands:
    - command: /posthog
      url: YOUR_URL/api/chat-webhook
      description: Query PostHog analytics
      usage_hint: "<your question>"
oauth_config:
  scopes:
    bot:
      - app_mentions:read
      - chat:write
      - channels:history
      - groups:history
      - im:history
      - mpim:history
      - reactions:write
      - users:read
settings:
  event_subscriptions:
    request_url: YOUR_URL/api/chat-webhook
    bot_events:
      - app_mention
      - message.channels
      - message.groups
      - message.im
      - message.mpim
  interactivity:
    is_enabled: false
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

### 4. Run locally

```bash
# Expose localhost to the internet (for Slack webhooks)
ngrok http 3000

# Update Slack app's webhook URLs to your ngrok URL, then:
npm run dev
```

### 5. Verify

Open `http://localhost:3000` to see the health status page.

## Usage

### @mention
```
@posthog-bot how many events did we get today?
```
The bot subscribes to the thread — follow-up messages don't require re-tagging:
```
break it down by event name
```

### Aside (opt-out)

Prefix any message with `aside` (case-insensitive) to have the bot silently ignore it — useful for side conversations in an active thread:
```
aside @alice can you double-check that number?
```

### Slash command
```
/posthog signups this week
```

## Configuration

### Channel allowlist

Set `ALLOWED_CHANNEL_IDS` to a comma-separated list of Slack channel IDs to restrict where the bot responds:

```
ALLOWED_CHANNEL_IDS=C01234ABCDE,C05678FGHIJ
```

If unset, the bot responds in all channels it's invited to.

### State persistence

| Variable | Dev | Prod |
|---|---|---|
| `REDIS_URL` unset | In-memory (lost on restart) | — |
| `REDIS_URL` set | Redis | Redis |

Set `REDIS_URL=redis://localhost:6379` (or your Redis provider URL) for production.

## Development

```bash
npm run dev          # Start Next.js dev server
npm run typecheck    # TypeScript type check
npm run lint         # ESLint
npm run test         # Run tests (vitest)
npm run build        # Production build
```

## Deployment

Deploy to any Node.js host (Vercel, Railway, Fly.io, etc.):

1. Set all required environment variables
2. Point your Slack app's webhook URLs to `https://your-domain.com/api/chat-webhook`
3. Point `/posthog` slash command URL to the same endpoint
4. Use the health page at `https://your-domain.com` for uptime monitoring

> **Vercel / serverless:** `REDIS_URL` is required. Serverless functions are stateless — without Redis, thread subscriptions are lost between invocations and follow-up messages won't trigger responses. [Upstash](https://upstash.com), [Railway](https://railway.app), and [Vercel KV](https://vercel.com/docs/storage/vercel-kv) all work.

## Architecture

```
app/
  page.tsx                  # Health/status page
  api/chat-webhook/
    route.ts                # Slack webhook handler (delegates to Chat SDK)
src/
  bot.ts                    # Chat SDK instance + event handlers
  agent.ts                  # Model selection + system prompt loading
  arcade-mcp.ts             # Arcade MCP Gateway client (Bearer token auth)
system-prompt.md            # Editable system prompt
```

The bot uses:
- **[Chat SDK](https://github.com/vercel/chat)** for Slack event handling and threading
- **[Vercel AI SDK](https://sdk.vercel.ai)** for LLM calls with MCP tool use
- **[Arcade MCP Gateway](https://app.arcade.dev/mcp-gateways)** + PostHog toolkit for analytics tools

## Security

- All credentials are environment variables — never committed
- PostHog MCP is read-only (write tools are not enabled)
- System prompt enforces: never expose PII, always aggregate data
- Slack webhook signatures are verified by the Chat SDK
- Audit logs (stdout JSON) capture every query for compliance
