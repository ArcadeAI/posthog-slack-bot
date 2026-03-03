import { after } from "next/server";
import { getChat } from "@/src/bot";

export async function POST(req: Request) {
  return getChat().webhooks.slack(req, {
    waitUntil: (p) => after(() => p),
  });
}
