🤖 MeetMate
Video meetings where the AI assistant takes the notes — and gives every person their own to-do list.
> 🏆 Built in 24 hours for **[Hackathon Name]** by **Team [Team Name]**
> *(“MeetMate” is a placeholder — rename freely.)*
🔗 Live demo: `https://your-app.vercel.app`
🎥 Demo video: `https://youtu.be/...`
📊 Pitch deck: `link`
---
💡 The Problem
Meetings end, notes are never written, and two days later nobody remembers who agreed to do what.
✅ Our Solution
MeetMate is a Teams/Meet-style meeting app with a built-in AI Meeting Assistant. It:
Listens — live transcription with correct speaker names
Sees — reads shared slides and screens (stretch goal)
Summarises — TL;DR, key points, decisions, open questions
Assigns — extracts action items with owner, due date and priority
Delivers — each person gets only their own to-do list, with the exact quote that created each task
---
🎬 Demo Flow
Sign in → create a meeting → share the code
Join with 2+ people (a 🤖 assistant tile + consent banner appear)
Talk: “Arjun, can you fix the critical bugs by Friday?”
Host clicks End meeting
Everyone gets the summary page
Open My To-Dos → only your tasks appear, each linked to its source quote
> No time for a live call? Click **“Load sample meeting”** on the dashboard to run the full AI pipeline on a scripted meeting.
---
✨ Features
Feature	Status
Auth (Supabase)	✅
Create / join meeting by code	✅
HD video, audio, mute/camera	✅ (LiveKit)
In-meeting chat	✅
Assistant badge + consent banner	✅
Live transcript with speaker names	✅
AI summary, decisions, open questions	✅
Action items with owner / due / priority	✅
Per-person “My To-Dos”	✅
Source quote for every task (anti-hallucination)	✅
Sample-meeting demo mode	✅
Screen-share understanding	🟡 stretch
Windows desktop app (`.exe`)	🟡 stretch
“Ask Assistant” in-meeting	🟡 stretch
---
🏗 Architecture
```
Browser(s) ── WebRTC ──► LiveKit Cloud (video / audio / chat)
    │
    │ per-user speech recognition → POST /api/transcript
    ▼
Next.js API ──► Supabase Postgres
    │
    │ End meeting
    ▼
AI Pipeline ──► Gemini API (free tier) ──► summary + action items (validated JSON)
    │
    ▼
Summary page · My To-Dos
```
Hackathon design choice: each participant’s browser transcribes their own microphone, so speaker attribution is automatic and accurate. In production the assistant would join as a server-side participant (e.g., LiveKit Agents) with streaming STT, diarization-free per-track audio, and vision on screen shares.
---
🧰 Tech Stack
Frontend: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui
Video / chat: LiveKit Cloud + `@livekit/components-react`
Backend: Next.js API routes
DB & Auth: Supabase (Postgres)
Speech-to-text: Browser Web Speech API (Chrome/Edge)
AI: Google Gemini API, free tier (summary, extraction, vision)
Hosting: Vercel (Hobby plan)
Desktop: Electron + electron-builder (Windows `.exe`, stretch goal)
Cost: $0 — every service runs on a free tier, no credit card
---
💸 Zero-Cost Build
This project was built without spending anything:
Need	Free service
Video / audio / chat	LiveKit Cloud (Build plan)
Hosting	Vercel (Hobby)
Database & auth	Supabase (Free)
Speech-to-text	Browser Web Speech API
LLM	Google Gemini API (free tier)
See `FREE_STACK.md` for limits and tips (e.g., Supabase free projects pause when idle; LiveKit's free minutes are limited, so use the sample-meeting demo mode while developing).
---
🚀 Run Locally
Prerequisites
Node.js 20+
Free accounts (no card needed): LiveKit Cloud (Build plan), Supabase (Free plan), and a Google AI Studio API key (Gemini free tier)
Chrome or Edge (for speech recognition)
1. Clone & install
```bash
git clone https://github.com/<your-team>/meetmate.git
cd meetmate
npm install
```
2. Environment variables
```bash
cp .env.example .env.local
```
```env
# LiveKit
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key   # server only, never expose

# AI (Gemini free tier via Google AI Studio)
LLM_PROVIDER=gemini
LLM_API_KEY=your_key
LLM_MODEL=a-flash-model-name-from-ai-studio
```
3. Create the database
Run the SQL in `WORKFLOW.md` → Database Schema in the Supabase SQL editor.
4. Start
```bash
npm run dev
```
Open `http://localhost:3000`, sign in, and click New meeting.
> Test with two browser windows (or your phone) to simulate multiple participants.
---
💻 Desktop App (Windows) — stretch
MeetMate also ships as a Windows `.exe`: a small Electron shell that opens the deployed web app in its own window. It needs an internet connection.
Download: see the latest build under Releases — `MeetMate Setup x.y.z.exe` (installer) or `MeetMate x.y.z.exe` (portable).
> Windows may show **"Windows protected your PC"** because the hackathon build is unsigned (code-signing certificates cost money). Click **More info → Run anyway**.
Build it yourself (on Windows):
```bash
cd desktop
npm install
APP_URL=https://your-app.vercel.app npm start   # run in dev  (PowerShell: $env:APP_URL="https://..."; npm start)
npm run dist                                     # builds installer + portable .exe into desktop/dist
```
Known limitation: the browser speech API may not work inside Electron. In that case live transcription falls back to chunked audio transcription, or use Chrome/Edge (web or installed web app) for live speech. Details in `EXE_GUIDE.md`.
---
📁 Project Structure
```
meetmate/
├── app/
│   ├── (auth)/login/
│   ├── dashboard/
│   ├── meeting/[code]/        # lobby + room
│   ├── summary/[id]/          # AI notes page
│   ├── todos/                 # My To-Dos
│   └── api/
│       ├── meetings/
│       ├── livekit-token/
│       ├── transcript/
│       ├── visual/            # stretch
│       └── todos/
├── components/                # Room, Chat, TranscriptPanel, AssistantTile, ConsentBanner…
├── lib/
│   ├── ai/                    # prompts, schema (zod), pipeline, owner mapping, verification
│   ├── livekit.ts
│   ├── supabase.ts
│   └── speech.ts              # Web Speech API wrapper
├── samples/                   # scripted demo meetings (JSON)
├── desktop/                   # Electron wrapper → Windows .exe (stretch)
├── members/                   # per-member task sheets + vibe-coding prompts
├── PLAN.md
├── WORKFLOW.md
├── FREE_STACK.md
├── EXE_GUIDE.md
└── README.md
```
---
🧠 How the AI Works
Summary call → `tldr`, `key_points`, `decisions`, `open_questions`
Action-item call → `title`, `owner_name`, `due_date`, `priority`, `source_quote`, `timestamp`
Owner mapping (code) → match names to real users; unclear owners → Unassigned
Verification (code) → drop any item whose `source_quote` isn’t in the transcript
Design principles: JSON-schema output, low temperature, never invent owners/dates, always cite the transcript.
---
🔒 Responsible AI & Privacy
Consent first: banner + visible “Assistant is active” indicator; consent is logged
Transparency: every task links to the exact quote that produced it; summaries are labelled AI-generated — please verify
No biometric analysis: no face recognition, emotion detection or voice-printing
Least access: each user sees only their own to-dos
Free-tier data note: the Gemini free tier may use submitted content to improve Google's products, so this demo uses only sample meetings and consenting teammates — don't enter confidential data
Roadmap: configurable retention, audio discard-after-transcription, encryption, row-level security, compliance review (GDPR, India’s DPDP Act, etc.)
> ⚠️ Hackathon shortcuts: Row Level Security is relaxed and transcripts are stored unencrypted. **Not production-ready.**
---
🗺 Roadmap (after the hackathon)
Server-side assistant bot joining as a real participant (LiveKit Agents)
Streaming STT with multi-language support
Screen-share understanding for slides and documents
Email delivery of personal to-dos; calendar auto-join; Jira / Asana / Trello sync
Channels, DMs, file sharing, mobile apps
Code-signed Windows installer with auto-update; macOS/Linux desktop builds
Org admin: retention policies, SSO, audit logs
Meeting memory: “What did we decide about pricing last month?”
---
👥 Team
Name	Role
Member 1	Frontend Lead
Member 2	Realtime / Meeting Engineer (+ Windows `.exe`)
Member 3	AI Engineer
Member 4	Backend / DevOps
Member 5	Product, Design & Pitch
---
🙏 Acknowledgements
LiveKit, Supabase, Vercel, Google AI Studio (Gemini), and the hackathon organisers.
📄 License
MIT (or update as appropriate)
