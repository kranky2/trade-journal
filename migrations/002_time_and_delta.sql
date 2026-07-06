-- ============================================================
-- Migration: entry/exit time + option delta tracking
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Safe to re-run.
-- ============================================================

alter table public.trades add column if not exists entry_time time;
alter table public.trades add column if not exists exit_time  time;
alter table public.trades add column if not exists delta_entry numeric; -- e.g. 0.16, 0.30 (or -0.16 for puts if you sign it)
alter table public.trades add column if not exists delta_exit  numeric;

-- Done.
