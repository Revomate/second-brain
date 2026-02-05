import { NextRequest, NextResponse } from "next/server";
import { generateDailyDigest } from "@/lib/classify";
import {
  getProjectsByStatus,
  getPeopleWithFollowUps,
  getAdminTasksDueOrOverdue,
  ClickUpTask,
} from "@/lib/clickup";
import { sendDM } from "@/lib/slack";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Gather active items from each list
    const [projects, people, admin] = await Promise.all([
      getProjectsByStatus(["active", "to do", "in progress"]),
      getPeopleWithFollowUps(),
      getAdminTasksDueOrOverdue(),
    ]);

    // Build context string, omitting empty sections
    const sections: string[] = [];

    if (projects.length > 0) {
      sections.push(
        `ACTIVE PROJECTS:\n${projects
          .map(
            (t: ClickUpTask, i: number) =>
              `${i + 1}. ${t.name}\n   Status: ${t.status?.status || "Unknown"}\n   Next Action: ${extractNextAction(t.description)}`
          )
          .join("\n\n")}`
      );
    }

    if (people.length > 0) {
      sections.push(
        `PEOPLE TO FOLLOW UP WITH:\n${people
          .map(
            (t: ClickUpTask, i: number) =>
              `${i + 1}. ${t.name}\n   Follow-up: ${extractFollowUps(t.description)}`
          )
          .join("\n\n")}`
      );
    }

    if (admin.length > 0) {
      sections.push(
        `TASKS DUE:\n${admin
          .map(
            (t: ClickUpTask, i: number) =>
              `${i + 1}. ${t.name}\n   Due: ${t.due_date ? new Date(parseInt(t.due_date)).toLocaleDateString() : "No date"}`
          )
          .join("\n\n")}`
      );
    }

    if (sections.length === 0) {
      // Nothing to report
      await sendDM(
        process.env.SLACK_USER_ID!,
        "☀️ *Daily Digest*\n\nNo active items to report today. Enjoy the clear day!"
      );
      return NextResponse.json({ ok: true, empty: true });
    }

    const context = sections.join("\n\n");
    const digest = await generateDailyDigest(context);
    await sendDM(process.env.SLACK_USER_ID!, digest);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Digest error:", error);
    return NextResponse.json(
      { error: "Failed", details: String(error) },
      { status: 500 }
    );
  }
}

function extractNextAction(description?: string): string {
  if (!description) return "None specified";
  const match = description.match(/\*\*Next Action:\*\*\s*(.+?)(?:\n|$)/i);
  return match ? match[1].trim() : "None specified";
}

function extractFollowUps(description?: string): string {
  if (!description) return "None";
  const match = description.match(/\*\*Follow-ups:\*\*\s*([\s\S]*?)(?:\n\n|$)/i);
  if (!match) return "None";
  // Clean up the follow-ups list
  return match[1]
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter((line) => line && line !== "None specified")
    .join(", ") || "None";
}
