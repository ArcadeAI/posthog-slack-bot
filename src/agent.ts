import { readFileSync } from "fs";
import { join } from "path";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

/**
 * Auto-detect LLM provider from environment.
 * Claude Sonnet if ANTHROPIC_API_KEY is set, GPT-4o otherwise.
 */
export function getModel() {
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic("claude-sonnet-4-6");
  }
  return openai("gpt-4.1");
}

/**
 * Load the system prompt from system-prompt.md in the project root.
 * Loaded once at module initialization — restart required to pick up changes.
 */
export const systemPrompt = readFileSync(
  join(process.cwd(), "system-prompt.md"),
  "utf-8"
);
