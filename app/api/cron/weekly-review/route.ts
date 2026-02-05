import { NextRequest, NextResponse } from "next/server";
import { generateWeeklyReview } from "@/lib/classify";
import { getTasksFromList } from "@/lib/clickup";
import { sendDM } from "@/lib/slack";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get this week's inbox log entries
    const inboxLog = await getTasksFromList(process.env.CLICKUP_LIST_INBOX_LOG!);
    
    // Filter to last 7 days
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thisWeek = (inboxLog as any[]).filter(
      (t) => parseInt(t.date_created) > weekAgo
    );

    // Get active items
    const [projects, people, ideas, admin] = await Promise.all([
      getTasksFromList(process.env.CLICKUP_LIST_PROJECTS!, ["open", "in progress"]),
      getTasksFromList(process.env.CLICKUP_LIST_PEOPLE!, ["open"]),
      getTasksFromList(process.env.CLICKUP_LIST_IDEAS!, ["open"]),
      getTasksFromList(process.env.CLICKUP_LIST_ADMIN!, ["open"]),
    ]);

    const context = `
THIS WEEK'S CAPTURES: ${thisWeek.length} total

BREAKDOWN:
- Projects: ${thisWeek.filter((t: any) => t.name.includes("PROJECTS")).length}
- People: ${thisWeek.filter((t: any) => t.name.includes("PEOPLE")).length}
- Ideas: ${thisWeek.filter((t: any) => t.name.includes("IDEAS")).length}
- Admin: ${thisWeek.filter((t: any) => t.name.includes("ADMIN")).length}

CURRENT OPEN ITEMS:
- ${(projects as any[]).length} active projects
- ${(people as any[]).length} people to follow up
- ${(ideas as any[]).length} ideas parked
- ${(admin as any[]).length} admin tasks

RECENT CAPTURES:
${thisWeek.slice(0, 10).map((t: any) => `- ${t.name}`).join("\n")}
    `;

    const review = await generateWeeklyReview(context);
    await sendDM(process.env.SLACK_USER_ID!, `📊 *Weekly Review*\n\n${review}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Weekly review error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
