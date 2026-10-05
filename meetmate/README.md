# MeetMate — API Stub Reference

> All endpoints are stub implementations backed by in-memory fixtures. No database is required.
> Replace `lib/mock-data.ts` calls with Supabase queries in the next sprint.

## Base URL

```
http://localhost:3000
```

---

## Fixture Reference

| Fixture | Value |
|---|---|
| Demo Meeting ID | `a1b2c3d4-0000-0000-0000-000000000001` |
| Demo Meeting Code | `MEET-2025` |
| Priya's user ID | `user-priya-0001` |
| Arjun's user ID | `user-arjun-0002` |
| Meera's user ID | `user-meera-0003` |
| Sam's user ID | `user-sam-0004` |
| Unassigned action item ID | `ai-0006` |

---

## Polling Simulation

`GET /api/meetings/:id` returns **`"processing"`** for the first **3 calls**, then **`"ready"`** with full summary + action items. Reset by calling `POST /api/meetings/:id/end` again.

---

## Endpoints

### 1. `POST /api/meetings` — Create a meeting

```bash
curl -s -X POST http://localhost:3000/api/meetings \
  -H "Content-Type: application/json" \
  -d '{"title": "Q4 Planning Sprint"}' | jq
```

**Response `201`:**
```json
{ "id": "<uuid>", "code": "MEET-AB3X" }
```

---

### 2. `GET /api/meetings` — List all meetings

```bash
curl -s http://localhost:3000/api/meetings | jq
```

**Response `200`:**
```json
[
  {
    "id": "a1b2c3d4-0000-0000-0000-000000000001",
    "code": "MEET-2025",
    "title": "Q4 Product Planning — MeetMate Demo",
    "status": "ready",
    "started_at": "2025-10-05T09:00:00.000Z"
  }
]
```

---

### 3. `GET /api/meetings/:id` — Meeting detail (with polling simulation)

```bash
# First 3 calls → status "processing"
curl -s http://localhost:3000/api/meetings/a1b2c3d4-0000-0000-0000-000000000001 | jq .meeting.status

# 4th call → status "ready" (summary + action_items included)
curl -s http://localhost:3000/api/meetings/a1b2c3d4-0000-0000-0000-000000000001 | jq '{status: .meeting.status, tldr: .summary.tldr}'
```

**Response `200` (when ready):**
```json
{
  "meeting": { "id": "...", "status": "ready", "title": "...", "..." : "..." },
  "participants": [ { "display_name": "Priya", "consented_at": "..." }, "..." ],
  "summary": { "tldr": "...", "key_points": [], "decisions": [], "open_questions": [] },
  "action_items": [ { "id": "ai-0001", "owner_name": "Priya", "..." : "..." } ]
}
```

---

### 4. `POST /api/livekit-token` — Issue a LiveKit room token

```bash
curl -s -X POST http://localhost:3000/api/livekit-token \
  -H "Content-Type: application/json" \
  -d '{"code": "MEET-2025", "displayName": "Priya"}' | jq
```

**Response `200`:**
```json
{ "token": "<stub-jwt>", "url": "wss://meetmate-demo.livekit.cloud" }
```

---

### 5. `POST /api/meetings/:id/consent` — Record participant consent

```bash
curl -s -X POST \
  http://localhost:3000/api/meetings/a1b2c3d4-0000-0000-0000-000000000001/consent \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-sam-0004"}' | jq
```

**Response `200`:**
```json
{ "ok": true }
```

---

### 6. `POST /api/transcript` — Ingest a transcript sentence

```bash
curl -s -X POST http://localhost:3000/api/transcript \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "a1b2c3d4-0000-0000-0000-000000000001",
    "speakerName": "Arjun",
    "text": "I think we should ship the feature by end of week.",
    "tMs": 62000
  }' | jq
```

**Response `200`:**
```json
{ "ok": true }
```

---

### 7. `POST /api/visual` — Describe a screen-share image (stretch)

```bash
curl -s -X POST http://localhost:3000/api/visual \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "a1b2c3d4-0000-0000-0000-000000000001",
    "tMs": 120000,
    "imageBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  }' | jq
```

**Response `200`:**
```json
{ "description": "Whiteboard shows a system architecture diagram with three services..." }
```

---

### 8. `POST /api/transcribe` — Server-side STT fallback (Electron exe)

```bash
# Create a dummy audio file for testing
echo "dummy audio" > /tmp/test.wav

curl -s -X POST http://localhost:3000/api/transcribe \
  -F "meetingId=a1b2c3d4-0000-0000-0000-000000000001" \
  -F "speakerName=Sam" \
  -F "tMs=90000" \
  -F "audio=@/tmp/test.wav" | jq
```

**Response `200`:**
```json
{ "text": "This is a stub transcription from the server-side speech-to-text fallback." }
```

---

### 9. `POST /api/meetings/:id/end` — End the meeting (trigger AI pipeline)

```bash
# First, create a live meeting
MEETING=$(curl -s -X POST http://localhost:3000/api/meetings \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Meeting"}')
ID=$(echo $MEETING | jq -r .id)

# Then end it
curl -s -X POST http://localhost:3000/api/meetings/$ID/end | jq
```

**Response `200`:**
```json
{ "status": "processing" }
```

---

### 10. `POST /api/meetings/:id/load-sample` — Seed demo fixture data

```bash
curl -s -X POST \
  http://localhost:3000/api/meetings/a1b2c3d4-0000-0000-0000-000000000001/load-sample \
  -H "Content-Type: application/json" \
  -d '{"sampleId": "default"}' | jq
```

**Response `200`:**
```json
{
  "ok": true,
  "loaded": {
    "meetingId": "a1b2c3d4-0000-0000-0000-000000000001",
    "sampleId": "default",
    "summary": { "tldr": "The team aligned on shipping..." },
    "action_items_count": 6
  }
}
```

---

### 11. `GET /api/todos/me` — My action items (scoped by user)

```bash
# Priya's todos (2 items)
curl -s "http://localhost:3000/api/todos/me?userId=user-priya-0001" | jq '[.[] | {title, priority, status}]'

# All todos (no userId — admin/demo view)
curl -s http://localhost:3000/api/todos/me | jq length
```

**Response `200`:**
```json
[
  {
    "id": "ai-0001",
    "meeting_id": "...",
    "owner_name": "Priya",
    "title": "Write Supabase RLS policies...",
    "priority": "high",
    "status": "todo",
    "source_quote": "Priya: I'll handle the row-level security policies...",
    "meeting_title": "Q4 Product Planning — MeetMate Demo"
  }
]
```

---

### 12. `PATCH /api/todos/:id` — Update todo status

```bash
# Mark as done
curl -s -X PATCH http://localhost:3000/api/todos/ai-0001 \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}' | jq

# Verify the change
curl -s "http://localhost:3000/api/todos/me?userId=user-priya-0001" | jq '[.[] | {id, title, status}]'
```

**Response `200`:**
```json
{ "ok": true }
```

---

## Validation Error Shape

All endpoints return this shape on validation failure (`422`):

```json
{
  "error": "Validation failed",
  "issues": [
    { "code": "too_small", "path": ["title"], "message": "title is required" }
  ]
}
```

---

## Files Created / Changed

| File | Purpose |
|---|---|
| [`lib/mock-data.ts`](./lib/mock-data.ts) | All fixtures, in-memory stores, polling counter |
| [`app/api/meetings/route.ts`](./app/api/meetings/route.ts) | `POST` create + `GET` list |
| [`app/api/meetings/[id]/route.ts`](./app/api/meetings/%5Bid%5D/route.ts) | `GET` detail with polling simulation |
| [`app/api/meetings/[id]/end/route.ts`](./app/api/meetings/%5Bid%5D/end/route.ts) | `POST` end meeting |
| [`app/api/meetings/[id]/consent/route.ts`](./app/api/meetings/%5Bid%5D/consent/route.ts) | `POST` record consent |
| [`app/api/meetings/[id]/load-sample/route.ts`](./app/api/meetings/%5Bid%5D/load-sample/route.ts) | `POST` seed demo data |
| [`app/api/livekit-token/route.ts`](./app/api/livekit-token/route.ts) | `POST` stub LiveKit token |
| [`app/api/transcript/route.ts`](./app/api/transcript/route.ts) | `POST` ingest transcript segment |
| [`app/api/visual/route.ts`](./app/api/visual/route.ts) | `POST` describe image (stretch) |
| [`app/api/transcribe/route.ts`](./app/api/transcribe/route.ts) | `POST` server-side STT (Electron fallback) |
| [`app/api/todos/me/route.ts`](./app/api/todos/me/route.ts) | `GET` my todos |
| [`app/api/todos/[id]/route.ts`](./app/api/todos/%5Bid%5D/route.ts) | `PATCH` update todo status |
| [`README.md`](./README.md) | This file — all curl examples |

---

## Run Locally

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Environment Variables (`.env.local`)

```env
# LiveKit (replace stubs when credentials are ready)
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Gemini
GEMINI_API_KEY=your_gemini_api_key
```
