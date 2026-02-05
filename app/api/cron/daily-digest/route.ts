import { NextRequest, NextResponse } from "next/server";
import { generateDailyDigest } from "@/lib/classify";
import { getTasksFromList } from "@/lib/clickup";
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
      getTasksFromList(process.env.CLICKUP_LIST_PROJECTS!, ["open", "in progress"]),
      getTasksFromList(process.env.CLICKUP_LIST_PEOPLE!, ["open"]),
      getTasksFromList(process.env.CLICKUP_LIST_ADMIN!, ["open"]),
    ]);

    const context = `
ACTIVE PROJECTS:
${projects.map((t: any) => `- ${t.name}`).join("\n") || "None"}

PEOPLE TO FOLLOW UP:
${people.map((t: any) => `- ${t.name}`).join("\n") || "None"}

ADMIN/TASKS:
${admin.map((t: any) => `- ${t.name}${t.due_date ? ` (due: ${new Date(parseInt(t.due_date)).toLocaleDateString()})` : ""}`).join("\n") || "None"}
    `;

    const digest = await generateDailyDigest(context);
    await sendDM(process.env.SLACK_USER_ID!, `☀️ *Daily Digest*\n\n${digest}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Digest error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
