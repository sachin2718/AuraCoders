-- ============================================================
-- MeetMate — Supabase SQL Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── meetings ────────────────────────────────────────────────
create table if not exists meetings (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  title       text not null,
  host_id     uuid references auth.users(id) on delete set null,
  status      text not null default 'live'
                check (status in ('live','processing','ready','failed')),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);

-- ── participants ─────────────────────────────────────────────
create table if not exists participants (
  meeting_id    uuid references meetings(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade,
  display_name  text not null,
  consented_at  timestamptz,
  primary key (meeting_id, user_id)
);

-- ── transcript_segments ──────────────────────────────────────
create table if not exists transcript_segments (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid references meetings(id) on delete cascade,
  speaker_id   uuid,           -- null when browser speech doesn't have auth
  speaker_name text not null,
  text         text not null,
  t_ms         bigint not null  -- milliseconds from meeting start
);

-- ── visual_notes ─────────────────────────────────────────────
create table if not exists visual_notes (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid references meetings(id) on delete cascade,
  t_ms        bigint not null,
  description text not null
);

-- ── summaries ────────────────────────────────────────────────
create table if not exists summaries (
  meeting_id     uuid primary key references meetings(id) on delete cascade,
  tldr           text not null,
  key_points     jsonb not null default '[]',
  decisions      jsonb not null default '[]',
  open_questions jsonb not null default '[]'
);

-- ── action_items ─────────────────────────────────────────────
create table if not exists action_items (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid references meetings(id) on delete cascade,
  owner_id     uuid,           -- nullable (not every item has a known user)
  owner_name   text,
  title        text not null,
  due_date     date,
  priority     text not null default 'medium'
                 check (priority in ('low','medium','high')),
  status       text not null default 'todo'
                 check (status in ('todo','done')),
  source_quote text not null,
  t_ms         bigint
);

-- ── Row Level Security ───────────────────────────────────────
alter table meetings         enable row level security;
alter table participants     enable row level security;
alter table transcript_segments enable row level security;
alter table visual_notes     enable row level security;
alter table summaries        enable row level security;
alter table action_items     enable row level security;

-- Authenticated users can read all meetings they participated in (or hosted)
create policy "read own meetings" on meetings
  for select using (
    auth.uid() = host_id
    or exists (
      select 1 from participants p
      where p.meeting_id = meetings.id and p.user_id = auth.uid()
    )
  );

create policy "insert meeting" on meetings
  for insert with check (auth.uid() = host_id);

create policy "update meeting" on meetings
  for update using (auth.uid() = host_id);

-- Participants
create policy "read participants" on participants
  for select using (
    exists (
      select 1 from meetings m
      where m.id = meeting_id and (
        m.host_id = auth.uid()
        or exists (select 1 from participants p2 where p2.meeting_id = meeting_id and p2.user_id = auth.uid())
      )
    )
  );

create policy "insert participant" on participants
  for insert with check (auth.uid() = user_id);

-- Transcript
create policy "read transcript" on transcript_segments
  for select using (
    exists (select 1 from meetings m where m.id = meeting_id and (
      m.host_id = auth.uid()
      or exists (select 1 from participants p where p.meeting_id = meeting_id and p.user_id = auth.uid())
    ))
  );

create policy "insert transcript" on transcript_segments
  for insert with check (true); -- validated by server-side API route

-- Summaries (all meeting participants can read)
create policy "read summary" on summaries
  for select using (
    exists (select 1 from meetings m where m.id = meeting_id and (
      m.host_id = auth.uid()
      or exists (select 1 from participants p where p.meeting_id = meeting_id and p.user_id = auth.uid())
    ))
  );

create policy "insert summary" on summaries
  for insert with check (true); -- written by server

-- Action items — owner can read their own; host can read all
create policy "read own action items" on action_items
  for select using (
    owner_id = auth.uid()
    or exists (select 1 from meetings m where m.id = meeting_id and m.host_id = auth.uid())
  );

create policy "update own action items" on action_items
  for update using (owner_id = auth.uid());

create policy "insert action items" on action_items
  for insert with check (true); -- written by server

-- ── Indexes ──────────────────────────────────────────────────
create index if not exists idx_transcript_meeting on transcript_segments(meeting_id, t_ms);
create index if not exists idx_action_items_meeting on action_items(meeting_id);
create index if not exists idx_action_items_owner on action_items(owner_id);
create index if not exists idx_meetings_code on meetings(code);
