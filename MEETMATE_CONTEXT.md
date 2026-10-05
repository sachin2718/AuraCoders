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

## Required project workflow and folder map
Follow this structure and priority order as the MeetMate implementation workflow. Keep each feature in its named location and do not skip ahead unless the user changes priorities.

Priority labels are literal: preserve the supplied P1/P3/P4/P5 assignments, never renumber or infer a different phase, and leave P2 undefined unless the user assigns it.

```text
meetmate/
├── app/
│   ├── (auth)/login/                 # P1
│   ├── dashboard/                    # P1
│   ├── meeting/
│   │   └── [code]/page.tsx           # P1: lobby + room page
│   ├── summary/[id]/                 # P1
│   ├── todos/                        # P1
│   └── api/                          # P4: token, transcript, meetings, todos
├── components/
│   ├── Room.tsx                      # video room
│   ├── Lobby.tsx                     # pre-join screen
│   ├── ChatPanel.tsx                 # in-call chat
│   ├── TranscriptPanel.tsx           # live transcript sidebar
│   ├── AssistantTile.tsx             # “MeetMate is listening” tile
│   └── ConsentBanner.tsx             # recording consent notice
├── lib/
│   ├── livekit.ts                    # LiveKit connection helpers
│   ├── speech.ts                     # Web Speech API wrapper
│   ├── speech-fallback.ts            # backup when speech fails
│   ├── ai/                           # P3
│   ├── supabase.ts                   # P4
│   └── api.ts                        # P1
├── desktop/                          # stretch: Electron Windows .exe, hour 15+
│   ├── main.js
│   ├── package.json
│   └── build/icon.ico
└── samples/                          # P5
```

The starred meeting components are core realtime deliverables. `app/meeting/[code]/page.tsx` owns the lobby-to-room flow; keep the individual lobby, room, chat, transcript, assistant, and consent UI in their corresponding components. The Electron wrapper is stretch work and comes after the core web flow.

## Coding rules and delivery
- TypeScript; validate API inputs with zod; secrets only via environment variables; keep files small.
- When implementing, provide complete files and list every file created or changed.
- Include commands to run the app and instructions to test it.


## Workflow and target repository structure

Follow the user-provided repository tree and P1/P3/P4/P5 priorities recorded in `AGENTS.md`. Implement P1 pages and `lib/api.ts`, then the marked real-time meeting UI, P3 AI, P4 API/Supabase, and P5 demo samples. The Electron `desktop/` wrapper is stretch work for hour 15 or later. Do not add unrequested features or rename API/database fields. The meeting route is the lobby + room page and the real-time UI includes `Room.tsx`, `Lobby.tsx`, `ChatPanel.tsx`, `TranscriptPanel.tsx`, `AssistantTile.tsx`, and `ConsentBanner.tsx`.
