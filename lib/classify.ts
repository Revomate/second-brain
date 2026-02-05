import Anthropic from "@anthropic-ai/sdk";
import {
  CLASSIFICATION_PROMPT,
  DAILY_DIGEST_PROMPT,
  WEEKLY_REVIEW_PROMPT,
} from "./prompts";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface Classification {
  category: "PEOPLE" | "PROJECTS" | "IDEAS" | "ADMIN";
  confidence: number;
  fields: Record<string, unknown>;
}

export async function classifyMessage(text: string): Promise<Classification> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `${CLASSIFICATION_PROMPT}\n\nClassify this:\n"${text}"`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type");
  }

  try {
    return JSON.parse(content.text) as Classification;
  } catch {
    // If parsing fails, return low confidence
    return {
      category: "IDEAS",
      confidence: 0.3,
      fields: { title: text.slice(0, 50), one_liner: text, notes: "" },
    };
  }
}

export async function generateDailyDigest(context: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `${DAILY_DIGEST_PROMPT}\n\nActive items:\n${context}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type");
  }

  return content.text;
}

export async function generateWeeklyReview(context: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `${WEEKLY_REVIEW_PROMPT}\n\nThis week's data:\n${context}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type");
  }

  return content.text;
}
