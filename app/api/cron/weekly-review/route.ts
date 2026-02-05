import { NextRequest, NextResponse } from "next/server";
import { generateWeeklyReview } from "@/lib/classify";
import {
  getInboxLogEntriesSince,
  getProjectsByStatus,
  ClickUpTask,
} from "@/lib/clickup";
import { sendDM } from "@/lib/slack";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get this week's inbox log entries and active projects
    const [inboxLog, projects] = await Promise.all([
      getInboxLogEntriesSince(7),
      getProjectsByStatus(["active", "waiting", "blocked", "to do", "in progress"]),
    ]);

    // Count captures by category from inbox log descriptions
    const categoryCounts: Record<string, number> = {
      People: 0,
      Projects: 0,
      Ideas: 0,
      Admin: 0,
      "Needs Review": 0,
    };

    inboxLog.forEach((entry: ClickUpTask) => {
      const desc = entry.description || "";
      const filedToMatch = desc.match(/\*\*Filed to:\*\*\s*(\w+)/i);
      if (filedToMatch) {
        const category = filedToMatch[1];
        if (category in categoryCounts) {
          categoryCounts[category]++;
        }
      }
    });

    // Build context string
    const sections: string[] = [];

    // Items captured this week
    sections.push("=== ITEMS CAPTURED THIS WEEK ===\n");
    if (inboxLog.length > 0) {
      inboxLog.forEach((item: ClickUpTask, i: number) => {
        const desc = item.description || "";
        const filedToMatch = desc.match(/\*\*Filed to:\*\*\s*(\w+)/i);
        const filedTo = filedToMatch ? filedToMatch[1] : "Unknown";
        const destMatch = desc.match(
          /\*\*Destination:\*\*\s*\[([^\]]+)\]/i
        );
        const destName = destMatch ? destMatch[1] : item.name.replace("Log: ", "");

        sections.push(`${i + 1}. [${filedTo}] ${destName}`);

        if (filedTo === "Needs Review") {
          sections.push("   ⚠️ NEEDS REVIEW");
        }
      });
    } else {
      sections.push("No captures this week.");
    }

    // Active projects status
    sections.push("\n\n=== ACTIVE PROJECTS STATUS ===\n");
    if (projects.length > 0) {
      projects.forEach((p: ClickUpTask, i: number) => {
        const nextAction = extractNextAction(p.description);
        sections.push(`${i + 1}. ${p.name}`);
        sections.push(`   Status: ${p.status?.status || "Unknown"}`);
        sections.push(`   Next: ${nextAction}\n`);
      });
    } else {
      sections.push("No active projects.");
    }

    // Capture summary
    sections.push("\n=== CAPTURE SUMMARY ===");
    for (const [cat, count] of Object.entries(categoryCounts)) {
      if (count > 0) {
        sections.push(`${cat}: ${count}`);
      }
    }

    const context = sections.join("\n");
    const review = await generateWeeklyReview(context, inboxLog.length);
    await sendDM(process.env.SLACK_USER_ID!, review);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Weekly review error:", error);
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
