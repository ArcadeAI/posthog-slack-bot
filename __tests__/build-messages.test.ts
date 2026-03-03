import { describe, it, expect } from "vitest";
import type { Message, Thread } from "chat";
import { buildMessages } from "../src/utils.js";

// Minimal Author stub
function makeAuthor(isBot: boolean) {
  return {
    userId: isBot ? "BOT001" : "U001",
    userName: isBot ? "posthog-bot" : "alice",
    fullName: isBot ? "PostHog Bot" : "Alice",
    isBot,
    isMe: isBot,
  };
}

// Minimal Message stub
function makeMessage(text: string, isBot: boolean): Message {
  return {
    id: `msg-${Math.random()}`,
    threadId: "slack:C123:1234.5678",
    text,
    formatted: { type: "root", children: [] } as never,
    raw: {},
    author: makeAuthor(isBot),
    metadata: { dateSent: new Date(), edited: false },
    attachments: [],
    isMention: false,
  } as unknown as Message;
}

// Build an async generator of messages
async function* makeAsyncMessages(messages: Message[]) {
  for (const msg of messages) {
    yield msg;
  }
}

// Minimal Thread stub — only needs allMessages (matches utils.ts signature)
function makeThread(messages: Message[]): Pick<Thread<Record<string, unknown>>, "allMessages"> {
  return { allMessages: makeAsyncMessages(messages) };
}

describe("buildMessages", () => {
  it("returns empty array for empty thread", async () => {
    const thread = makeThread([]);
    const result = await buildMessages(thread);
    expect(result).toEqual([]);
  });

  it("maps bot messages to assistant role", async () => {
    const thread = makeThread([
      makeMessage("What are today's events?", false),
      makeMessage("Here are the event counts: ...", true),
    ]);
    const result = await buildMessages(thread);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: "user", content: "What are today's events?" });
    expect(result[1]).toEqual({ role: "assistant", content: "Here are the event counts: ..." });
  });

  it("maps human messages to user role", async () => {
    const thread = makeThread([makeMessage("hello", false)]);
    const result = await buildMessages(thread);
    expect(result[0].role).toBe("user");
  });

  it("caps at 20 messages (takes last 20 from longer threads)", async () => {
    const messages = Array.from({ length: 25 }, (_, i) =>
      makeMessage(`message ${i}`, i % 2 === 0)
    );
    const thread = makeThread(messages);
    const result = await buildMessages(thread);
    expect(result).toHaveLength(20);
    // Should be the last 20 messages
    expect(result[0].content).toBe("message 5");
    expect(result[19].content).toBe("message 24");
  });

  it("returns exactly 20 messages when thread has exactly 20", async () => {
    const messages = Array.from({ length: 20 }, (_, i) =>
      makeMessage(`msg ${i}`, false)
    );
    const thread = makeThread(messages);
    const result = await buildMessages(thread);
    expect(result).toHaveLength(20);
  });

  it("preserves message order (oldest first)", async () => {
    const thread = makeThread([
      makeMessage("first", false),
      makeMessage("second", true),
      makeMessage("third", false),
    ]);
    const result = await buildMessages(thread);
    expect(result[0].content).toBe("first");
    expect(result[1].content).toBe("second");
    expect(result[2].content).toBe("third");
  });
});
