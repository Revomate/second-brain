import { NextRequest, NextResponse } from "next/server";
import { classifyMessage } from "@/lib/classify";
import { createTask, logToInbox } from "@/lib/clickup";
import {
  postConfirmation,
  postNeedsReview,
  verifySlackRequest,
} from "@/lib/slack";

const CONFIDENCE_THRESHOLD = 0.6;

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
  challenge?: string;
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

    // Ignore messages not in the inbox channel
    if (msg.channel !== process.env.SLACK_INBOX_CHANNEL_ID) {
      return NextResponse.json({ ok: true });
    }

    // Ignore threaded replies (handled by fix route)
    if (msg.thread_ts && msg.thread_ts !== msg.ts) {
      return NextResponse.json({ ok: true });
    }

    // Process the message
    try {
      const classification = await classifyMessage(msg.text);

      if (classification.confidence < CONFIDENCE_THRESHOLD) {
        await postNeedsReview(msg.channel, msg.ts, msg.text);

        await logToInbox({
          originalText: msg.text,
          filedTo: "needs_review",
          destinationName: "Pending",
          destinationUrl: "",
          confidence: classification.confidence,
          slackThreadTs: msg.ts,
          clickupRecordId: "",
        });

        return NextResponse.json({ ok: true });
      }

      const task = await createTask(classification);

      await logToInbox({
        originalText: msg.text,
        filedTo: classification.category,
        destinationName: task.name,
        destinationUrl: task.url,
        confidence: classification.confidence,
        slackThreadTs: msg.ts,
        clickupRecordId: task.id,
      });

      await postConfirmation(msg.channel, msg.ts, {
        category: classification.category,
        name: task.name,
        url: task.url,
        confidence: classification.confidence,
      });

      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("Error processing message:", error);
      return NextResponse.json(
        { error: "Processing failed" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}
