-- =============================================================================
-- MeetMate Supabase Postgres Schema
-- Execute this script in your Supabase Project -> SQL Editor
-- =============================================================================

-- 1. Meetings Table
CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(16) UNIQUE NOT NULL,
  title TEXT NOT NULL,
  host_id TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'processing', 'ready', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

-- 2. Participants Table
CREATE TABLE IF NOT EXISTS public.participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  consented_at TIMESTAMPTZ,
  CONSTRAINT unique_meeting_user UNIQUE (meeting_id, user_id)
);

-- 3. Transcript Segments Table
CREATE TABLE IF NOT EXISTS public.transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  speaker_id TEXT NOT NULL,
  speaker_name TEXT NOT NULL,
  text TEXT NOT NULL,
  t_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Visual Notes Table (Whiteboard / Screen-share descriptions)
CREATE TABLE IF NOT EXISTS public.visual_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  t_ms INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Summaries Table
CREATE TABLE IF NOT EXISTS public.summaries (
  meeting_id UUID PRIMARY KEY REFERENCES public.meetings(id) ON DELETE CASCADE,
  tldr TEXT NOT NULL,
  key_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  open_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Action Items Table
CREATE TABLE IF NOT EXISTS public.action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  owner_id TEXT,
  owner_name TEXT,
  title TEXT NOT NULL,
  due_date TIMESTAMPTZ,
  priority VARCHAR(16) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status VARCHAR(16) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'done')),
  source_quote TEXT NOT NULL DEFAULT '',
  t_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_meetings_code ON public.meetings(code);
CREATE INDEX IF NOT EXISTS idx_meetings_host_id ON public.meetings(host_id);
CREATE INDEX IF NOT EXISTS idx_participants_meeting_id ON public.participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON public.participants(user_id);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_meeting_id ON public.transcript_segments(meeting_id, t_ms);
CREATE INDEX IF NOT EXISTS idx_action_items_meeting_id ON public.action_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_action_items_owner_id ON public.action_items(owner_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visual_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

-- Service Role Key (used by server client) automatically bypasses RLS.
-- Public read policies for authenticated users or public demo access:
CREATE POLICY "Public read meetings" ON public.meetings FOR SELECT USING (true);
CREATE POLICY "Public read participants" ON public.participants FOR SELECT USING (true);
CREATE POLICY "Public read transcripts" ON public.transcript_segments FOR SELECT USING (true);
CREATE POLICY "Public read summaries" ON public.summaries FOR SELECT USING (true);
CREATE POLICY "Public read action_items" ON public.action_items FOR SELECT USING (true);
