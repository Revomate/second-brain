import { NextRequest, NextResponse } from "next/server";
import { moveTaskToList } from "@/lib/clickup";
import { verifySlackRequest } from "@/lib/slack";
import { WebClient } from "@slack/web-api";

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

const LIST_IDS: Record<string, string> = {
  people: process.env.CLICKUP_LIST_PEOPLE!,
  projects: process.env.CLICKUP_LIST_PROJECTS!,
  ideas: process.env.CLICKUP_LIST_IDEAS!,
  admin: process.env.CLICKUP_LIST_ADMIN!,
};

interface SlackEvent {
  type: string;
  event?: {
    type: string;
    channel: string;
    text: string;
    ts: string;
    thread_ts?: string;
    user: string;
    bot_id?: string;
  };
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-slack-signature") || "";
  const timestamp = request.headers.get("x-slack-request-timestamp") || "";

  if (!verifySlackRequest(signature, timestamp, body)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event: SlackEvent = JSON.parse(body);

  if (event.type !== "event_callback" || event.event?.type !== "message") {
    return NextResponse.json({ ok: true });
  }

  const msg = event.event;

  // Only handle threaded replies
  if (!msg.thread_ts || msg.thread_ts === msg.ts) {
    return NextResponse.json({ ok: true });
  }

  // Check if it's a fix command
  const fixMatch = msg.text.match(/^fix:\s*(\w+)/i);
  if (!fixMatch) {
    return NextResponse.json({ ok: true });
  }

  const newCategory = fixMatch[1].toLowerCase();
  const newListId = LIST_IDS[newCategory];

  if (!newListId) {
    await slack.chat.postMessage({
      channel: msg.channel,
      thread_ts: msg.thread_ts,
      text: `Unknown category: ${newCategory}. Use: people, projects, ideas, or admin.`,
    });
    return NextResponse.json({ ok: true });
  }

  try {
    // Get the bot's previous message to extract task ID
    const replies = await slack.conversations.replies({
      channel: msg.channel,
      ts: msg.thread_ts,
    });

    const botMessage = replies.messages?.find(
      (m) => m.bot_id && m.text?.includes("Filed as")
    );

    if (!botMessage?.text) {
      await slack.chat.postMessage({
        channel: msg.channel,
        thread_ts: msg.thread_ts,
        text: "Couldn't find the original task to move.",
      });
      return NextResponse.json({ ok: true });
    }

    // Extract ClickUp task ID from URL in bot message
    const taskIdMatch = botMessage.text.match(/clickup\.com\/t\/(\w+)/);
    if (!taskIdMatch) {
      await slack.chat.postMessage({
        channel: msg.channel,
        thread_ts: msg.thread_ts,
        text: "Couldn't find task ID in the original message.",
      });
      return NextResponse.json({ ok: true });
    }

    const taskId = taskIdMatch[1];
    await moveTaskToList(taskId, newListId);

    await slack.chat.postMessage({
      channel: msg.channel,
      thread_ts: msg.thread_ts,
      text: `✅ Moved to ${newCategory.toUpperCase()}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error processing fix:", error);
    return NextResponse.json({ error: "Fix failed" }, { status: 500 });
  }
}
