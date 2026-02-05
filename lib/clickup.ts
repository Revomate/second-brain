import { Classification } from "./classify";

const CLICKUP_API = "https://api.clickup.com/api/v2";

const headers = {
  Authorization: process.env.CLICKUP_API_TOKEN!,
  "Content-Type": "application/json",
};

const LIST_IDS: Record<string, string> = {
  PEOPLE: process.env.CLICKUP_LIST_PEOPLE!,
  PROJECTS: process.env.CLICKUP_LIST_PROJECTS!,
  IDEAS: process.env.CLICKUP_LIST_IDEAS!,
  ADMIN: process.env.CLICKUP_LIST_ADMIN!,
};

export interface Task {
  id: string;
  name: string;
  url: string;
}

export async function createTask(classification: Classification): Promise<Task> {
  const listId = LIST_IDS[classification.category];
  const fields = classification.fields;

  let name: string;
  let description: string;

  switch (classification.category) {
    case "PEOPLE":
      name = (fields.name as string) || "Unknown Person";
      description = `**Context:** ${fields.context || "N/A"}\n\n**Follow-ups:**\n${
        Array.isArray(fields.follow_ups)
          ? fields.follow_ups.map((f) => `- ${f}`).join("\n")
          : "- None specified"
      }`;
      break;
    case "PROJECTS":
      name = (fields.title as string) || "Untitled Project";
      description = `**Next Action:** ${fields.next_action || "Define next step"}\n\n**Notes:** ${
        fields.notes || "N/A"
      }`;
      break;
    case "IDEAS":
      name = (fields.title as string) || "Untitled Idea";
      description = `**One-liner:** ${fields.one_liner || "N/A"}\n\n**Notes:** ${
        fields.notes || "N/A"
      }`;
      break;
    case "ADMIN":
      name = (fields.title as string) || "Untitled Task";
      description = `**Notes:** ${fields.notes || "N/A"}`;
      break;
    default:
      name = "Uncategorized";
      description = JSON.stringify(fields);
  }

  const body: Record<string, unknown> = {
    name,
    description,
    markdown_description: description,
  };

  if (classification.category === "ADMIN" && fields.due_date) {
    body.due_date = new Date(fields.due_date as string).getTime();
  }

  const response = await fetch(`${CLICKUP_API}/list/${listId}/task`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ClickUp API error: ${error}`);
  }

  const task = await response.json();
  return {
    id: task.id,
    name: task.name,
    url: task.url,
  };
}

export interface InboxLogEntry {
  originalText: string;
  filedTo: string;
  destinationName: string;
  destinationUrl: string;
  confidence: number;
  slackThreadTs: string;
  clickupRecordId: string;
}

export async function logToInbox(entry: InboxLogEntry): Promise<void> {
  const listId = process.env.CLICKUP_LIST_INBOX_LOG!;

  const description = `**Original:** ${entry.originalText}

**Filed to:** ${entry.filedTo}
**Destination:** [${entry.destinationName}](${entry.destinationUrl})
**Confidence:** ${(entry.confidence * 100).toFixed(0)}%
**Slack TS:** ${entry.slackThreadTs}
**ClickUp ID:** ${entry.clickupRecordId}`;

  await fetch(`${CLICKUP_API}/list/${listId}/task`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: `Log: ${entry.originalText.slice(0, 50)}...`,
      description,
      markdown_description: description,
    }),
  });
}

export async function getTasksFromList(
  listId: string,
  statuses?: string[]
): Promise<unknown[]> {
  const params = new URLSearchParams();
  if (statuses) {
    statuses.forEach((s) => params.append("statuses[]", s));
  }

  const response = await fetch(
    `${CLICKUP_API}/list/${listId}/task?${params.toString()}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch tasks: ${await response.text()}`);
  }

  const data = await response.json();
  return data.tasks;
}

export async function updateTask(
  taskId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const response = await fetch(`${CLICKUP_API}/task/${taskId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error(`Failed to update task: ${await response.text()}`);
  }
}

export async function moveTaskToList(
  taskId: string,
  listId: string
): Promise<void> {
  const response = await fetch(`${CLICKUP_API}/task/${taskId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ list: listId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to move task: ${await response.text()}`);
  }
}
