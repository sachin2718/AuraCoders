<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## MeetMate workflow (follow for all project work)

Use the user-provided MeetMate folder tree and priority labels as the source of truth. Do not add unrequested features or folders. Work in the specified order: P1 app pages and `lib/api.ts`; the marked real-time meeting UI; P3 AI; P4 API routes and Supabase; P5 demo samples. Preserve the API contract and database field names from `MEETMATE_CONTEXT.md`. The desktop wrapper is a stretch task only, planned for hour 15 or later.

Target structure:

```text
app/
  (auth)/login/       # P1
  dashboard/          # P1
  meeting/[code]/
    page.tsx          # lobby + room page
  summary/[id]/       # P1
  todos/              # P1
  api/                # P4: token, transcript, meetings, todos
components/
  Room.tsx            # real-time video room
  Lobby.tsx           # pre-join screen
  ChatPanel.tsx       # in-call chat
  TranscriptPanel.tsx # live transcript sidebar
  AssistantTile.tsx   # “MeetMate is listening” tile
  ConsentBanner.tsx   # recording consent notice
lib/
  livekit.ts           # LiveKit connection helpers
  speech.ts            # Web Speech API wrapper
  speech-fallback.ts   # speech fallback
  ai/                  # P3
  supabase.ts          # P4
  api.ts               # P1
 desktop/              # stretch: Electron wrapper for Windows exe
  main.js
  package.json
  build/icon.ico
samples/                # P5
```

Keep the meeting path and components focused on the requested real-time meeting flow: pre-join lobby, LiveKit room, chat, transcript, assistant listening tile, and consent notice. Keep speech transcription on each participant's own browser microphone as specified in `MEETMATE_CONTEXT.md`.
