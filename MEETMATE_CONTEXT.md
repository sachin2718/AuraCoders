# MeetMate project memory

**Memory scope:** Keep this brief as active context throughout the MeetMate project. If the project is clearly finished or the brief seems outdated, confirm with the user before relying on it.

## Project
MeetMate is a Teams-style video meeting web app with a built-in AI assistant. When a meeting ends, the assistant produces a summary, decisions, open questions, and action items. Each participant receives only their own to-do list, with the exact source quote from the transcript.

## Hackathon constraints
- 24 hours, 5 developers, $0 budget (free tiers only, no credit card), demo-first.
- Choose the simplest thing that works. Do not add unrequested features.

## Stack
- Next.js (App Router), TypeScript, Tailwind, shadcn/ui.
- LiveKit Cloud for video/audio (`livekit-client`, `@livekit/components-react`, `livekit-server-sdk`); chat via LiveKit data channel.
- Supabase (Postgres + Auth).
- Google Gemini API free tier (a Flash model) behind one wrapper function `callLLM(prompt)`.
- Browser Web Speech API for per-user live transcription.
- Vercel Hobby hosting.
- Stretch: Windows `.exe` via Electron wrapper in `desktop/`.

## Transcription design
Each participant's browser transcribes its own microphone and POSTs final sentences to `/api/transcript` with the speaker's name, so speaker attribution is automatic.

## Database tables
- `meetings(id uuid, code text unique, title, host_id, status 'live'|'processing'|'ready'|'failed', started_at, ended_at)`
- `participants(meeting_id, user_id, display_name, consented_at)`
- `transcript_segments(id, meeting_id, speaker_id, speaker_name, text, t_ms)`
- `visual_notes(id, meeting_id, t_ms, description)`
- `summaries(meeting_id, tldr, key_points jsonb, decisions jsonb, open_questions jsonb)`
- `action_items(id, meeting_id, owner_id nullable, owner_name nullable, title, due_date nullable, priority 'low'|'medium'|'high', status 'todo'|'done', source_quote, t_ms)`

## API contract (field names must not be changed)
- `POST /api/meetings {title} -> {id, code}`
- `GET /api/meetings -> [{id, code, title, status, started_at}]`
- `GET /api/meetings/:id -> {meeting, participants, summary?, action_items?}`
- `POST /api/livekit-token {code, displayName} -> {token, url}`
- `POST /api/meetings/:id/consent {userId} -> {ok:true}`
- `POST /api/transcript {meetingId, speakerName, text, tMs} -> {ok:true}`
- `POST /api/visual {meetingId, tMs, imageBase64} -> {description}` (stretch)
- `POST /api/transcribe multipart {meetingId, speakerName, tMs, audio} -> {text}` (exe fallback)
- `POST /api/meetings/:id/end -> {status:'processing'}`
- `POST /api/meetings/:id/load-sample {sampleId} -> {ok:true}` (demo mode)
- `GET /api/todos/me -> [action_item + meeting_title]`
- `PATCH /api/todos/:id {status} -> {ok:true}`

## AI output schema
```json
{
  "summary": {
    "tldr": "...",
    "key_points": [],
    "decisions": [],
    "open_questions": []
  },
  "action_items": [
    {
      "title": "...",
      "owner_name": null,
      "due_date": null,
      "priority": "low|medium|high",
      "source_quote": "...",
      "timestamp_ms": 0
    }
  ]
}
```

## Target folders
- `app/(auth)/login`
- `app/dashboard`
- `app/meeting/[code]`
- `app/summary/[id]`
- `app/todos`
- `app/api/*`
- `components/`
- `lib/ai/`
- `lib/livekit.ts`
- `lib/supabase.ts`
- `lib/speech.ts`
- `samples/`
- `desktop/`

## Coding rules and delivery
- TypeScript; validate API inputs with zod; secrets only via environment variables; keep files small.
- When implementing, provide complete files and list every file created or changed.
- Include commands to run the app and instructions to test it.

