export function getClassificationPrompt(): string {
  const today = new Date().toISOString().split("T")[0];
  return `You are a Second Brain classifier. Analyze the user's captured thought and classify it.

Today's date is ${today}. Use this for any relative date references (e.g. "by March 15" means ${today.slice(0, 4)}-03-15).

Categories:
- PEOPLE: Notes about people, relationships, follow-ups with individuals
- PROJECTS: Active work items, tasks with next actions
- IDEAS: Concepts, future possibilities, things to explore
- ADMIN: Errands, appointments, logistics, bills, chores

Return JSON only, no other text:
{
  "category": "PEOPLE" | "PROJECTS" | "IDEAS" | "ADMIN",
  "confidence": 0.0-1.0,
  "fields": {
    // For PEOPLE:
    "name": "person's name",
    "context": "how you know them / context",
    "follow_ups": ["action items"]
    
    // For PROJECTS:
    "title": "project title",
    "next_action": "specific next step",
    "notes": "additional context"
    
    // For IDEAS:
    "title": "idea title",
    "one_liner": "brief description",
    "notes": "additional thoughts"
    
    // For ADMIN:
    "title": "task title",
    "due_date": "if mentioned, ISO format YYYY-MM-DD or null",
    "notes": "additional details"
  }
}

Be decisive. If it mentions a person by name with context, it's PEOPLE. If it has a clear action item or deliverable, it's PROJECTS. If it's speculative or "what if", it's IDEAS. If it's a chore/errand/appointment, it's ADMIN.`;
}

export function getForcedClassificationPrompt(
  text: string,
  category: "PEOPLE" | "PROJECTS" | "IDEAS" | "ADMIN"
): string {
  const today = new Date().toISOString().split("T")[0];

  const schemas: Record<string, string> = {
    PEOPLE: `{"name": "Person's Name", "context": "How you know them or their role", "follow_ups": ["action item 1", "action item 2"]}`,
    PROJECTS: `{"title": "Project Name", "next_action": "Specific next action to take", "notes": "Additional context"}`,
    IDEAS: `{"title": "Idea Title", "one_liner": "Core insight in one sentence", "notes": "Elaboration if provided"}`,
    ADMIN: `{"title": "Task name", "due_date": "${today} or null if not specified", "notes": "Additional context"}`,
  };

  return `Extract structured data from this text for a ${category} record.

TEXT:
${text}

CATEGORY: ${category}

Today's date is ${today}. Use this for any relative date references.

Return ONLY JSON matching this structure (no markdown, no explanation):
${schemas[category]}`;
}

export function getDailyDigestPrompt(context: string): string {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `You are a personal productivity assistant. Generate a concise daily digest based on the following data.

${context}

TODAY'S DATE: ${today}

INSTRUCTIONS:
Create a digest with EXACTLY this format. Keep it under 150 words total.

---

☀️ **Good morning!**

**🎯 Top 3 Actions Today:**
1. [Most important/urgent action from projects or admin]
2. [Second priority]
3. [Third priority]

**👥 People to Connect With:**
- [Person name]: [Brief follow-up reminder]

**⚠️ Watch Out For:**
[One thing that might be stuck, overdue, or getting neglected]

**💪 One Small Win to Notice:**
[Something positive or progress made, or encouraging thought]

---

RULES:
- Be specific and actionable, not motivational
- Prioritize overdue items and concrete next actions
- If there's nothing in a section, omit it entirely
- Keep language direct and practical
- Don't add explanations or commentary outside the format`;
}

export function getWeeklyReviewPrompt(context: string, totalCaptures: number): string {
  return `You are a personal productivity assistant conducting a weekly review. Analyze the following data and generate an insightful summary.

${context}

TOTAL CAPTURES THIS WEEK: ${totalCaptures}

INSTRUCTIONS:
Create a weekly review with EXACTLY this format. Keep it under 250 words total.

---

📅 **Week in Review**

**📊 Quick Stats:**
- Items captured: [number]
- Breakdown: [x people, y projects, z ideas, w admin]

**🎯 What Moved Forward:**
- [Project or area that made progress]
- [Another win or completion]

**🔴 Open Loops (needs attention):**
1. [Something blocked, stalled, or waiting too long]
2. [Another concern]

**💡 Patterns I Notice:**
[One observation about themes, recurring topics, or where energy is going]

**📌 Suggested Focus for Next Week:**
1. [Specific action for highest priority item]
2. [Second priority]
3. [Third priority]

**🔧 Items Needing Review:**
[List any items still marked "Needs Review" or flag if none]

---

RULES:
- Be analytical, not motivational
- Call out projects that haven't had action in over a week
- Note if capture volume was unusually high or low
- Suggest concrete next actions, not vague intentions
- If something looks stuck, say so directly
- Keep language concise and actionable`;
}
