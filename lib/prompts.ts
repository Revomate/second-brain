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

export const DAILY_DIGEST_PROMPT = `You are creating a daily digest for a Second Brain system. Given the active items below, create a brief, actionable morning digest.

Format:
**Top 3 for today:**
1. [most important thing]
2. [second priority]
3. [third priority]

**People to reach out to:**
- [name]: [reason]

**Don't forget:**
- [any admin items due soon]

Keep it under 150 words. Be direct. No fluff.`;

export const WEEKLY_REVIEW_PROMPT = `You are creating a weekly review for a Second Brain system. Summarize the week's captures and suggest focus areas.

Format:
**This week:** [X] captures ([breakdown by category])

**Progress:**
- [completed or moved forward]

**Open loops:**
- [things that need attention]

**Patterns I notice:**
- [any themes in the captures]

**Suggested focus for next week:**
1. [priority]
2. [priority]

Keep it under 250 words. Be honest about what's stalling.`;
