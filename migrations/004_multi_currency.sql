-- ============================================================
-- Migration: multi-currency support (currency + fx_rate_to_usd)
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Safe to re-run.
-- ============================================================

alter table public.trades add column if not exists currency text not null default 'USD';
alter table public.trades add column if not exists fx_rate_to_usd numeric not null default 1;

-- fx_rate_to_usd: multiply native pnl by this to get USD pnl.
-- USD trades: always 1 (no-op).
-- CMC tickets quote e.g. "1.28604" as SGD-per-1-USD — that means the field
-- here should be 1 / 1.28604 ≈ 0.7776, not the ticket number directly.

-- Done.
