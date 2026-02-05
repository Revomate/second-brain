import Anthropic from "@anthropic-ai/sdk";
import {
  getClassificationPrompt,
  getClassificationPromptWithProjects,
  getForcedClassificationPrompt,
  getDailyDigestPrompt,
  getWeeklyReviewPrompt,
} from "./prompts";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ExistingProject {
  id: string;
  name: string;
}

export interface Classification {
  category: "PEOPLE" | "PROJECTS" | "IDEAS" | "ADMIN";
  confidence: number;
  fields: Record<string, unknown>;
  existingProjectId?: string; // If this relates to an existing project
}

export async function classifyMessage(
  text: string,
  existingProjects?: ExistingProject[]
): Promise<Classification> {
  const prompt =
    existingProjects && existingProjects.length > 0
      ? getClassificationPromptWithProjects(existingProjects)
      : getClassificationPrompt();

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `${prompt}\n\nClassify this:\n"${text}"`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type");
  }

  console.log("Claude raw response:", content.text);

  try {
    // Strip markdown code fences if present
    let jsonText = content.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = JSON.parse(jsonText);
    return {
      category: parsed.category,
      confidence: parsed.confidence,
      fields: parsed.fields,
      existingProjectId: parsed.existing_project_id || undefined,
    };
  } catch (parseError) {
    console.error("JSON parse failed. Raw text:", content.text, "Error:", parseError);
    return {
      category: "IDEAS",
      confidence: 0.3,
      fields: { title: text.slice(0, 50), one_liner: text, notes: "" },
    };
  }
}

export async function classifyWithForcedCategory(
  text: string,
  category: "PEOPLE" | "PROJECTS" | "IDEAS" | "ADMIN"
): Promise<Classification> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: getForcedClassificationPrompt(text, category),
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type");
  }

  console.log("Claude forced classification response:", content.text);

  try {
    let jsonText = content.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "");
    }
    const parsed = JSON.parse(jsonText);
    return {
      category,
      confidence: 1.0, // Forced classification = full confidence
      fields: parsed,
    };
  } catch (parseError) {
    console.error(
      "JSON parse failed for forced classification:",
      content.text,
      parseError
    );
    // Return minimal fields based on category
    return {
      category,
      confidence: 1.0,
      fields: getDefaultFields(category, text),
    };
  }
}

function getDefaultFields(
  category: string,
  text: string
): Record<string, unknown> {
  switch (category) {
    case "PEOPLE":
      return { name: text.slice(0, 50), context: text, follow_ups: [] };
    case "PROJECTS":
      return { title: text.slice(0, 50), next_action: "Define next step", notes: text };
    case "IDEAS":
      return { title: text.slice(0, 50), one_liner: text, notes: "" };
    case "ADMIN":
      return { title: text.slice(0, 50), due_date: null, notes: text };
    default:
      return { title: text.slice(0, 50), notes: text };
  }
}

export async function generateDailyDigest(context: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: getDailyDigestPrompt(context),
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type");
  }

  return content.text;
}

export async function generateWeeklyReview(
  context: string,
  totalCaptures: number
): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: getWeeklyReviewPrompt(context, totalCaptures),
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type");
  }

  return content.text;
}
