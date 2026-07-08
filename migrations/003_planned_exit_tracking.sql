-- ============================================================
-- Migration: expiry date, planned CSP target %, planned stop/target
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Safe to re-run.
-- ============================================================

alter table public.trades add column if not exists expiry_date date;          -- option/spread contract expiry
alter table public.trades add column if not exists planned_target_pct numeric; -- e.g. 50 (close at 50% of max profit)
alter table public.trades add column if not exists planned_stop numeric;      -- price level, for directional strategies
alter table public.trades add column if not exists planned_target numeric;    -- price level, for directional strategies

-- Done.
