-- ============================================================
--  PACE — Supabase Schema
--  Run this in the Supabase SQL Editor to create all tables
-- ============================================================

-- SHOES table (must be created before runs, since runs references it)
create table if not exists shoes (
  id              text primary key,            -- client-generated e.g. "shoe-1710000000"
  model           text not null,
  size            text,
  mileage         numeric(7,1) default 0,      -- starting km before tracking in PACE
  status          text default 'active',       -- 'active' | 'retired'
  notes           text,
  created_at      timestamptz default now()
);

-- RUNS table
create table if not exists runs (
  id          text primary key,                -- client-generated e.g. "2025-01-15-Easy-abc123"
  date        date not null,
  type        text not null,                   -- 'Easy','Long Run','Interval','Tempo','Recovery','Race'
  distance    numeric(6,2),                    -- km
  duration    numeric(6,1),                    -- minutes
  hr          integer,                         -- avg bpm
  cadence     integer,                         -- avg spm
  shoe_id     text references shoes(id) on delete set null,
  notes       text,
  from_strava boolean default false,
  strava_id   bigint,
  created_at  timestamptz default now()
);

-- SEGMENTS table (interval reps linked to a run)
create table if not exists segments (
  id          serial primary key,
  run_id      text not null references runs(id) on delete cascade,
  seg_index   integer not null,               -- order within the run (0-based)
  seg_type    text not null,                  -- 'Warmup' | 'Interval' | 'Cooldown'
  distance    numeric(5,2),
  pace        text,                           -- stored as "M:SS" string
  hr          integer,
  created_at  timestamptz default now()
);

-- Indexes for common queries
create index if not exists runs_date_idx      on runs(date desc);
create index if not exists runs_type_idx      on runs(type);
create index if not exists runs_shoe_idx      on runs(shoe_id);
create index if not exists segments_run_idx   on segments(run_id);

-- Note: Row Level Security is intentionally left OFF for single-user personal use.
-- If you add auth later, enable RLS and add policies per user.
