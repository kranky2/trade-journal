-- ============================================================
-- Trade Journal — Supabase schema
-- Run this once in: Supabase Dashboard → SQL Editor → New query
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE where possible.
-- ============================================================

-- ---------- Tables ----------

create table if not exists public.strategies (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table if not exists public.strategy_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  rule_text   text not null,
  sort_order  int  not null default 0,
  active      boolean not null default true
);

create table if not exists public.trades (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  strategy_id     uuid references public.strategies(id) on delete set null,
  parent_trade_id uuid references public.trades(id) on delete set null, -- roll chains
  symbol          text not null,
  instrument      text not null default 'option',   -- stock | option | spread | futures | fx
  direction       text not null default 'neutral',  -- long | short | neutral
  status          text not null default 'open',     -- open | closed
  entry_date      date not null,
  exit_date       date,
  quantity        numeric,
  entry_price     numeric,
  exit_price      numeric,
  fees            numeric default 0,
  pnl             numeric,          -- realized net P&L, entered when closing
  thesis          text,             -- planned setup, written BEFORE entry
  notes           text,             -- execution notes, written after
  created_at      timestamptz not null default now()
);

create table if not exists public.trade_legs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trade_id    uuid not null references public.trades(id) on delete cascade,
  side        text not null,   -- buy | sell
  kind        text not null,   -- call | put | stock
  strike      numeric,
  expiry      date,
  quantity    numeric not null default 1,
  open_price  numeric,
  close_price numeric
);

create table if not exists public.rule_checks (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades(id) on delete cascade,
  rule_id  uuid not null references public.strategy_rules(id) on delete cascade,
  followed boolean not null default false,
  note     text,
  unique (trade_id, rule_id)
);

-- ---------- Indexes ----------

create index if not exists idx_trades_user_exit  on public.trades (user_id, exit_date);
create index if not exists idx_trades_user_entry on public.trades (user_id, entry_date);
create index if not exists idx_trades_strategy   on public.trades (strategy_id);
create index if not exists idx_rules_strategy    on public.strategy_rules (strategy_id);
create index if not exists idx_checks_trade      on public.rule_checks (trade_id);
create index if not exists idx_legs_trade        on public.trade_legs (trade_id);

-- ---------- Row Level Security ----------
-- Every table: only the authenticated owner can touch their own rows.

alter table public.strategies     enable row level security;
alter table public.strategy_rules enable row level security;
alter table public.trades         enable row level security;
alter table public.trade_legs     enable row level security;
alter table public.rule_checks    enable row level security;

drop policy if exists "own strategies"     on public.strategies;
drop policy if exists "own strategy_rules" on public.strategy_rules;
drop policy if exists "own trades"         on public.trades;
drop policy if exists "own trade_legs"     on public.trade_legs;
drop policy if exists "own rule_checks"    on public.rule_checks;

create policy "own strategies" on public.strategies
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own strategy_rules" on public.strategy_rules
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own trades" on public.trades
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own trade_legs" on public.trade_legs
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own rule_checks" on public.rule_checks
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Grants ----------
-- Needed because "automatically expose new tables" was turned OFF
-- at project creation. We expose these tables to logged-in users only.
-- (anon gets nothing — the login screen is the only thing it can reach.)

grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.strategies, public.strategy_rules, public.trades,
     public.trade_legs, public.rule_checks
  to authenticated;

-- Done. Next: Authentication → Users → Add user (create your own login),
-- then Authentication → Sign In / Up → turn OFF "Allow new users to sign up".
