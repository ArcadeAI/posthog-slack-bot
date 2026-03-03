import type { Message, Thread } from "chat";
import type { ModelMessage } from "ai";

/**
 * Check if a channel is in the allowlist.
 * Returns true if ALLOWED_CHANNEL_IDS is unset (allow everywhere).
 */
export function isChannelAllowed(channelId: string): boolean {
  const allowlist = process.env.ALLOWED_CHANNEL_IDS?.trim();
  if (!allowlist) return true;
  const ids = allowlist
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.includes(channelId);
}

/**
 * Build ModelMessages from thread history for the LLM.
 * Maps bot messages to "assistant" role, user messages to "user" role.
 * Caps at 20 messages for context window management.
 */
export async function buildMessages<TState>(
  thread: Pick<Thread<TState>, "allMessages">
): Promise<ModelMessage[]> {
  const collected: Message[] = [];
  for await (const msg of thread.allMessages) {
    collected.push(msg);
  }

  const recent = collected.slice(-20);
  return recent.map((msg) => ({
    role: msg.author.isBot ? ("assistant" as const) : ("user" as const),
    content: msg.text,
  }));
}
