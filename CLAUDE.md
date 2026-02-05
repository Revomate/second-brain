# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Second Brain is a personal knowledge management system built with Next.js 14 that captures messages from Slack, uses Claude AI to classify them into categories, and creates corresponding tasks in ClickUp. It includes automated daily digests and weekly reviews.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm start        # Start production server
```

No test or lint scripts are configured.

## Architecture

### Data Flow

1. **Message Capture** (`/api/slack/events`) - Slack messages are captured, classified by Claude AI, and routed to ClickUp lists based on category and confidence (≥0.6 threshold)
2. **User Corrections** (`/api/slack/fix`) - Users can reply with `fix: [category]` to reclassify items
3. **Daily Digest** (`/api/cron/daily-digest`) - Runs at 12:00 UTC, summarizes active items via Slack DM
4. **Weekly Review** (`/api/cron/weekly-review`) - Runs Sundays at 21:00 UTC, analyzes patterns and progress

### Classification Categories

- **PEOPLE** - Relationships and follow-ups (name, context, follow_ups)
- **PROJECTS** - Active work with next actions (title, next_action, notes)
- **IDEAS** - Concepts and future possibilities (title, one_liner, notes)
- **ADMIN** - Errands, appointments, logistics (title, due_date, notes)

### Key Files

| File | Purpose |
|------|---------|
| `lib/classify.ts` | Claude AI classification engine, digest/review generation |
| `lib/clickup.ts` | ClickUp API integration (create, move, fetch tasks) |
| `lib/slack.ts` | Slack utilities (verification, posting, DMs) |
| `lib/prompts.ts` | Claude prompt templates for classification and summaries |

### Environment Variables

See `.env.example` for required configuration:
- Slack: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_INBOX_CHANNEL_ID`, `SLACK_USER_ID`
- Anthropic: `ANTHROPIC_API_KEY`
- ClickUp: `CLICKUP_API_TOKEN`, `CLICKUP_WORKSPACE_ID`, `CLICKUP_LIST_*` (5 list IDs)
- Security: `CRON_SECRET` (Bearer token for cron endpoints)

## Implementation Notes

- Uses `@/` path alias for imports (configured in tsconfig.json)
- Slack requests validated via HMAC-SHA256 signature verification
- In-memory deduplication set prevents processing Slack retries (last 100 messages)
- Classification fallback: returns low-confidence IDEAS if JSON parsing fails
- ClickUp list mapping must stay synchronized between `clickup.ts` and `slack/fix/route.ts`
- Cron endpoints require Bearer token authentication via `CRON_SECRET`
