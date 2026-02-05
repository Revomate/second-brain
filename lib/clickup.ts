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

/**
 * Find and update an inbox log entry by Slack thread TS
 */
export async function updateInboxLogEntry(
  slackThreadTs: string,
  updates: {
    filedTo: string;
    destinationName: string;
    destinationUrl: string;
    status: string;
  }
): Promise<void> {
  const listId = process.env.CLICKUP_LIST_INBOX_LOG!;

  // Fetch all inbox log entries
  const response = await fetch(`${CLICKUP_API}/list/${listId}/task`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch inbox log: ${await response.text()}`);
  }

  const data = await response.json();

  // Find the entry with matching Slack TS in the description
  const entry = (data.tasks as ClickUpTask[]).find((task) => {
    return task.description?.includes(`**Slack TS:** ${slackThreadTs}`);
  });

  if (!entry) {
    console.log(`No inbox log entry found for Slack TS: ${slackThreadTs}`);
    return; // Silently skip if not found - the original message may have been low confidence
  }

  // Update the description with new values
  let newDescription = entry.description || "";
  newDescription = newDescription.replace(
    /\*\*Filed to:\*\* .+/,
    `**Filed to:** ${updates.filedTo}`
  );
  newDescription = newDescription.replace(
    /\*\*Destination:\*\* \[.+?\]\(.+?\)/,
    `**Destination:** [${updates.destinationName}](${updates.destinationUrl})`
  );

  // Add status if not present, or update it
  if (newDescription.includes("**Status:**")) {
    newDescription = newDescription.replace(
      /\*\*Status:\*\* .+/,
      `**Status:** ${updates.status}`
    );
  } else {
    newDescription += `\n**Status:** ${updates.status}`;
  }

  await updateTask(entry.id, {
    description: newDescription,
    markdown_description: newDescription,
  });
}

export interface ClickUpTask {
  id: string;
  name: string;
  description?: string;
  status: { status: string };
  due_date?: string;
  date_created: string;
  url: string;
}

/**
 * Get admin tasks that are due today or overdue
 */
export async function getAdminTasksDueOrOverdue(): Promise<ClickUpTask[]> {
  const listId = process.env.CLICKUP_LIST_ADMIN!;

  // Get end of today in milliseconds
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const endOfToday = today.getTime();

  const params = new URLSearchParams();
  params.append("due_date_lt", endOfToday.toString());
  params.append("statuses[]", "to do");

  const response = await fetch(
    `${CLICKUP_API}/list/${listId}/task?${params.toString()}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch admin tasks: ${await response.text()}`);
  }

  const data = await response.json();
  return data.tasks;
}

/**
 * Get people tasks that have follow-ups in their description
 */
export async function getPeopleWithFollowUps(): Promise<ClickUpTask[]> {
  const listId = process.env.CLICKUP_LIST_PEOPLE!;

  const response = await fetch(`${CLICKUP_API}/list/${listId}/task`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch people tasks: ${await response.text()}`);
  }

  const data = await response.json();

  // Filter to only those with follow-ups content in description
  return (data.tasks as ClickUpTask[]).filter((task) => {
    if (!task.description) return false;
    // Check if description has follow-ups that aren't empty/placeholder
    const desc = task.description.toLowerCase();
    return (
      desc.includes("follow-up") &&
      !desc.includes("none specified") &&
      !desc.includes("- none")
    );
  });
}

/**
 * Get inbox log entries from the last N days
 */
export async function getInboxLogEntriesSince(
  daysAgo: number
): Promise<ClickUpTask[]> {
  const listId = process.env.CLICKUP_LIST_INBOX_LOG!;
  const cutoff = Date.now() - daysAgo * 24 * 60 * 60 * 1000;

  const response = await fetch(`${CLICKUP_API}/list/${listId}/task`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch inbox log: ${await response.text()}`);
  }

  const data = await response.json();

  // Filter to entries created since cutoff
  return (data.tasks as ClickUpTask[]).filter(
    (task) => parseInt(task.date_created) > cutoff
  );
}

/**
 * Get projects by status
 */
export async function getProjectsByStatus(
  statuses: string[]
): Promise<ClickUpTask[]> {
  const listId = process.env.CLICKUP_LIST_PROJECTS!;

  const params = new URLSearchParams();
  statuses.forEach((s) => params.append("statuses[]", s));

  const response = await fetch(
    `${CLICKUP_API}/list/${listId}/task?${params.toString()}`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${await response.text()}`);
  }

  const data = await response.json();
  return data.tasks;
}
