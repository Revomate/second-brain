import { NextRequest, NextResponse } from "next/server";
import { classifyMessage } from "@/lib/classify";
import { createTask, logToInbox } from "@/lib/clickup";
import {
  postConfirmation,
  postNeedsReview,
  verifySlackRequest,
} from "@/lib/slack";
import { WebClient } from "@slack/web-api";

const CONFIDENCE_THRESHOLD = 0.6;

// Simple dedup: track recently processed message timestamps
const processed = new Set<string>();

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
    subtype?: string;
  };
  challenge?: string;
}

async function processMessage(channel: string, text: string, ts: string) {
  const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

  try {
    const classification = await classifyMessage(text);

    if (classification.confidence < CONFIDENCE_THRESHOLD) {
      await postNeedsReview(channel, ts, text);

      await logToInbox({
        originalText: text,
        filedTo: "needs_review",
        destinationName: "Pending",
        destinationUrl: "",
        confidence: classification.confidence,
        slackThreadTs: ts,
        clickupRecordId: "",
      });
      return;
    }

    const task = await createTask(classification);

    await logToInbox({
      originalText: text,
      filedTo: classification.category,
      destinationName: task.name,
      destinationUrl: task.url,
      confidence: classification.confidence,
      slackThreadTs: ts,
      clickupRecordId: task.id,
    });

    await postConfirmation(channel, ts, {
      category: classification.category,
      name: task.name,
      url: task.url,
      confidence: classification.confidence,
    });
  } catch (error) {
    console.error("Error processing message:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    try {
      await slack.chat.postMessage({
        channel,
        thread_ts: ts,
        text: `❌ Error processing this:\n\`${errorMessage}\``,
      });
    } catch (slackError) {
      console.error("Failed to send error to Slack:", slackError);
    }
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text();

  let event: SlackEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Handle URL verification challenge FIRST (no signature check)
  if (event.type === "url_verification") {
    return NextResponse.json({ challenge: event.challenge });
  }

  // Now verify signature for all other requests
  const signature = request.headers.get("x-slack-signature") || "";
  const timestamp = request.headers.get("x-slack-request-timestamp") || "";

  if (!verifySlackRequest(signature, timestamp, body)) {
    console.error("Signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Handle message events
  if (event.type === "event_callback" && event.event?.type === "message") {
    const msg = event.event;

    // Ignore bot messages
    if (msg.bot_id) {
      return NextResponse.json({ ok: true });
    }

    // Ignore message subtypes (channel_join, channel_purpose, huddles, etc.)
    if (msg.subtype) {
      return NextResponse.json({ ok: true });
    }

    // Ignore messages not in the inbox channel
    if (msg.channel !== process.env.SLACK_INBOX_CHANNEL_ID) {
      return NextResponse.json({ ok: true });
    }

    // Ignore threaded replies (handled by fix route)
    if (msg.thread_ts && msg.thread_ts !== msg.ts) {
      return NextResponse.json({ ok: true });
    }

    // Ignore messages without text
    if (!msg.text || msg.text.trim() === "") {
      return NextResponse.json({ ok: true });
    }

    // Dedup: skip if we already processed this message
    if (processed.has(msg.ts)) {
      console.log("Skipping duplicate event for ts:", msg.ts);
      return NextResponse.json({ ok: true });
    }
    processed.add(msg.ts);

    // Clean up old entries (keep last 100)
    if (processed.size > 100) {
      const entries = Array.from(processed);
      entries.slice(0, entries.length - 100).forEach((ts) => processed.delete(ts));
    }

    // Process the message (awaited so Vercel doesn't kill it)
    // Dedup above handles Slack's retry attempts
    await processMessage(msg.channel, msg.text, msg.ts);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
