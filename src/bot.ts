import { Chat, ConsoleLogger, type Thread } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createRedisState } from "@chat-adapter/state-redis";
import { generateText, streamText, stepCountIs } from "ai";
import { getModel, systemPrompt } from "./agent";
import {
  getArcadeMCPClient,
  initiateOAuth,
  getPendingAuthUrl,
  clearPendingAuthUrl,
} from "./arcade-mcp";
import { isChannelAllowed, buildMessages } from "./utils";

// Per-thread state: active PostHog project/org context
interface ThreadState {
  activeProjectId?: string;
  activeOrgId?: string;
}

type BotChat = Chat<{ slack: ReturnType<typeof createSlackAdapter> }, ThreadState>;

let _chat: BotChat | null = null;

/**
 * Get (or lazily create) the Chat instance.
 * Lazy init ensures the module can be imported during Next.js build
 * without requiring SLACK_SIGNING_SECRET at import time.
 */
export function getChat(): BotChat {
  if (_chat) return _chat;

  const logger = new ConsoleLogger("info");

  const state = process.env.REDIS_URL
    ? createRedisState({ url: process.env.REDIS_URL, logger })
    : createMemoryState();

  _chat = new Chat<{ slack: ReturnType<typeof createSlackAdapter> }, ThreadState>({
    userName: "posthog-bot",
    adapters: {
      slack: createSlackAdapter({
        botToken: process.env.SLACK_BOT_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET ?? "",
        logger,
      }),
    },
    state,
  });

  _chat.registerSingleton();
  registerHandlers(_chat);
  return _chat;
}

// Structured audit log — route to a log aggregator in production
function auditLog(entry: {
  userId: string;
  channelId: string;
  query: string;
  toolsCalled: string[];
  durationMs: number;
}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...entry }));
}

/**
 * Ensure Arcade OAuth is complete before handling a message.
 * Returns the auth URL if the user needs to authorize, null if already good.
 */
async function ensureArcadeAuth(): Promise<string | null> {
  const result = await initiateOAuth();
  if (result === "REDIRECT") {
    const url = getPendingAuthUrl();
    clearPendingAuthUrl();
    return url;
  }
  return null;
}

/**
 * Run the PostHog agent with streaming (for @mentions) or non-streaming (for follow-ups).
 */
async function runAgent(
  thread: Thread<ThreadState>,
  userId: string,
  query: string,
  streaming: boolean
): Promise<void> {
  const start = Date.now();
  const toolsCalled: string[] = [];
  let mcpClient: Awaited<ReturnType<typeof getArcadeMCPClient>> | undefined;

  const authUrl = await ensureArcadeAuth();
  if (authUrl) {
    await thread.post(
      `I need to connect to Arcade first. Please authorize here:\n${authUrl}\n\nThen @mention me again.`
    );
    return;
  }

  await thread.startTyping("Querying PostHog via Arcade...");
  const messages = await buildMessages(thread);

  try {
    // Retry once on MCP connection failure
    mcpClient = await getArcadeMCPClient().catch(async (err) => {
      await new Promise((r) => setTimeout(r, 2_000));
      return getArcadeMCPClient().catch(() => {
        throw err;
      });
    });

    const tools = await mcpClient.tools();

    if (streaming) {
      const result = streamText({
        model: getModel(),
        system: systemPrompt,
        messages,
        tools,
        stopWhen: stepCountIs(10),
        onStepFinish: (step) => {
          for (const toolCall of step.toolCalls ?? []) {
            toolsCalled.push(toolCall.toolName);
          }
        },
        onFinish: async () => {
          await mcpClient?.close();
          auditLog({
            userId,
            channelId: thread.channelId,
            query,
            toolsCalled,
            durationMs: Date.now() - start,
          });
        },
      });
      await thread.post(result.textStream);
    } else {
      const result = await generateText({
        model: getModel(),
        system: systemPrompt,
        messages,
        tools,
        stopWhen: stepCountIs(10),
      });
      await mcpClient.close();
      for (const step of result.steps) {
        for (const toolCall of step.toolCalls ?? []) {
          toolsCalled.push(toolCall.toolName);
        }
      }
      auditLog({
        userId,
        channelId: thread.channelId,
        query,
        toolsCalled,
        durationMs: Date.now() - start,
      });
      await thread.post(result.text);
    }
  } catch (err) {
    await mcpClient?.close();
    auditLog({
      userId,
      channelId: thread.channelId,
      query,
      toolsCalled,
      durationMs: Date.now() - start,
    });
    throw err;
  }
}

function getFriendlyError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("arcade_gateway_url")) {
      return "Arcade is not configured. Please check the ARCADE_GATEWAY_URL environment variable.";
    }
    if (msg.includes("timed out") || msg.includes("timeout")) {
      return "The Arcade gateway is temporarily unavailable. Try again in a few minutes.";
    }
    if (msg.includes("rate") || msg.includes("429")) {
      return "I\u2019m getting rate-limited. Please wait a moment before trying again.";
    }
    if (msg.includes("mcp") || msg.includes("connection")) {
      return "The Arcade gateway is temporarily unavailable. Try again in a few minutes.";
    }
    if (msg.includes("unauthorized") || msg.includes("403")) {
      return "Authentication error. Arcade authorization may have expired — @mention me to re-authorize.";
    }
  }
  return "I\u2019m having trouble processing that right now. Please try again.";
}

function registerHandlers(chat: BotChat) {
  // ── onNewMention ────────────────────────────────────────────────────────────

  chat.onNewMention(async (thread, message) => {
    if (!isChannelAllowed(thread.channelId)) {
      await thread
        .postEphemeral(message.author, "This bot isn\u2019t enabled in this channel.", {
          fallbackToDM: false,
        })
        .catch(() => undefined);
      return;
    }

    await thread.subscribe();

    // React with :eyes: as immediate ack
    await thread.adapter
      .addReaction(thread.id, message.id, "eyes")
      .catch(() => undefined);

    try {
      await runAgent(thread, message.author.userId, message.text, true);
      // Swap to checkmark after success
      await Promise.all([
        thread.adapter.removeReaction(thread.id, message.id, "eyes").catch(() => undefined),
        thread.adapter.addReaction(thread.id, message.id, "check").catch(() => undefined),
      ]);
    } catch (err) {
      await thread.adapter
        .removeReaction(thread.id, message.id, "eyes")
        .catch(() => undefined);
      await thread
        .postEphemeral(message.author, getFriendlyError(err), { fallbackToDM: false })
        .catch(() => undefined);
    }
  });

  // ── onSubscribedMessage ──────────────────────────────────────────────────────

  chat.onSubscribedMessage(async (thread, message) => {
    if (!isChannelAllowed(thread.channelId)) return;
    if (message.text.trimStart().toLowerCase().startsWith("aside")) return;

    await thread.adapter
      .addReaction(thread.id, message.id, "eyes")
      .catch(() => undefined);

    try {
      await runAgent(thread, message.author.userId, message.text, false);
      await Promise.all([
        thread.adapter.removeReaction(thread.id, message.id, "eyes").catch(() => undefined),
        thread.adapter.addReaction(thread.id, message.id, "check").catch(() => undefined),
      ]);
    } catch (err) {
      await thread.adapter
        .removeReaction(thread.id, message.id, "eyes")
        .catch(() => undefined);
      await thread
        .postEphemeral(message.author, getFriendlyError(err), { fallbackToDM: false })
        .catch(() => undefined);
    }
  });

}
