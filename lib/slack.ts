import { WebClient } from "@slack/web-api";
import crypto from "crypto";

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function postConfirmation(
  channel: string,
  threadTs: string,
  data: {
    category: string;
    name: string;
    url: string;
    confidence: number;
    isSubtask?: boolean;
    parentProjectName?: string;
  }
): Promise<void> {
  const confidenceEmoji =
    data.confidence >= 0.8 ? "✅" : data.confidence >= 0.6 ? "🟡" : "⚠️";

  const filedAs = data.isSubtask && data.parentProjectName
    ? `*${data.category}* (subtask of _${data.parentProjectName}_)`
    : `*${data.category}*`;

  const message = `${confidenceEmoji} Filed as ${filedAs}: <${data.url}|${data.name}>
Confidence: ${(data.confidence * 100).toFixed(0)}%

_Reply \`fix: [category]\` if I got it wrong._`;

  await slack.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: message,
  });
}

export async function postNeedsReview(
  channel: string,
  threadTs: string,
  originalText: string
): Promise<void> {
  const message = `⚠️ I'm not confident about how to classify this:

> ${originalText}

Reply with a hint like \`fix: people\` or \`fix: project\` to help me learn.`;

  await slack.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: message,
  });
}

export async function sendDM(userId: string, message: string): Promise<void> {
  const dm = await slack.conversations.open({ users: userId });
  if (!dm.channel?.id) {
    throw new Error("Failed to open DM channel");
  }

  await slack.chat.postMessage({
    channel: dm.channel.id,
    text: message,
  });
}

export function verifySlackRequest(
  signature: string,
  timestamp: string,
  body: string
): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  
  if (!signingSecret) {
    console.error("SLACK_SIGNING_SECRET not set");
    return false;
  }

  // Check timestamp is within 5 minutes
  const time = Math.floor(Date.now() / 1000);
  if (Math.abs(time - parseInt(timestamp)) > 60 * 5) {
    console.error("Timestamp too old");
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    "v0=" +
    crypto
      .createHmac("sha256", signingSecret)
      .update(sigBasestring, "utf8")
      .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(mySignature, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch {
    return false;
  }
}
