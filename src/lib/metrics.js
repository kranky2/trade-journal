export const fmt = (n, opts = {}) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return sign + n.toLocaleString('en-SG', { maximumFractionDigits: 2, minimumFractionDigits: 0, ...opts })
}

export const fmtPct = (n) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : `${Math.round(n * 100)}%`

export const closedWithPnl = (trades) =>
  trades.filter((t) => t.status === 'closed' && t.pnl !== null && t.pnl !== undefined)

export function computeStats(trades) {
  const closed = closedWithPnl(trades)
  const wins = closed.filter((t) => t.pnl > 0)
  const losses = closed.filter((t) => t.pnl < 0)
  const grossWin = wins.reduce((s, t) => s + Number(t.pnl), 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.pnl), 0))
  return {
    count: closed.length,
    total: closed.reduce((s, t) => s + Number(t.pnl), 0),
    winRate: closed.length ? wins.length / closed.length : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    avgWin: wins.length ? grossWin / wins.length : null,
    avgLoss: losses.length ? -grossLoss / losses.length : null,
    expectancy: closed.length
      ? closed.reduce((s, t) => s + Number(t.pnl), 0) / closed.length
      : null,
  }
}

// adherence for one trade: checks belonging to it → followed / total
export function tradeAdherence(trade, checksByTrade) {
  const checks = checksByTrade[trade.id] || []
  if (!checks.length) return null
  return checks.filter((c) => c.followed).length / checks.length
}

export function avgAdherence(trades, checksByTrade) {
  const vals = trades.map((t) => tradeAdherence(t, checksByTrade)).filter((v) => v !== null)
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export const fmtPF = (pf) =>
  pf === null ? '—' : pf === Infinity ? '∞' : pf.toFixed(2)

export const todayStr = () => {
  // date in Asia/Singapore regardless of device timezone
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date())
  return p // en-CA gives YYYY-MM-DD
}

export function buildChains(trades) {
  const byId = Object.fromEntries(trades.map((t) => [t.id, t]))
  const rootOf = (t) => {
    let cur = t
    const seen = new Set()
    while (cur.parent_trade_id && byId[cur.parent_trade_id] && !seen.has(cur.id)) {
      seen.add(cur.id)
      cur = byId[cur.parent_trade_id]
    }
    return cur.id
  }
  const groups = {}
  for (const t of trades) {
    const root = rootOf(t)
    if (!groups[root]) groups[root] = []
    groups[root].push(t)
  }
  return Object.values(groups)
    .map((legs) => legs.slice().sort((a, b) => (a.entry_date < b.entry_date ? -1 : 1)))
    .filter((legs) => legs.length > 1) // only actual chains, single trades show in the normal list
    .map((legs) => {
      const closedLegs = legs.filter((l) => l.status === 'closed' && l.pnl !== null && l.pnl !== undefined)
      const totalPnl = closedLegs.reduce((s, l) => s + Number(l.pnl), 0)
      const isOpen = legs.some((l) => l.status === 'open')
      const start = legs[0].entry_date
      const lastLeg = legs[legs.length - 1]
      const end = lastLeg.exit_date || null
      const days = end ? daysBetween(start, end) : daysBetween(start, todayStr())
      return { legs, totalPnl, isOpen, start, end, days, root: legs[0] }
    })
    .sort((a, b) => (b.end || '9999') > (a.end || '9999') ? 1 : -1)
}

function daysBetween(a, b) {
  const d1 = new Date(a + 'T00:00:00Z')
  const d2 = new Date(b + 'T00:00:00Z')
  return Math.round((d2 - d1) / 86400000)
}

// ---- option premium capture ----
export function pctCaptured(t) {
  if (!t.entry_price || t.exit_price === null || t.exit_price === undefined) return null
  const entry = Number(t.entry_price)
  if (entry === 0) return null
  return ((entry - Number(t.exit_price)) / entry) * 100
}

export function dteAtExit(t) {
  if (!t.expiry_date || !t.exit_date) return null
  return daysBetween(t.exit_date, t.expiry_date)
}

export function dteAtEntry(t) {
  if (!t.expiry_date || !t.entry_date) return null
  return daysBetween(t.entry_date, t.expiry_date)
}

export function dteNow(t) {
  if (!t.expiry_date) return null
  return daysBetween(todayStr(), t.expiry_date)
}

// ---- price-based plan vs realized (directional strategies) ----
export function realizedR(t) {
  if (t.planned_stop === null || t.planned_stop === undefined) return null
  if (!t.entry_price || t.exit_price === null || t.exit_price === undefined) return null
  const entry = Number(t.entry_price)
  const stop = Number(t.planned_stop)
  const exit = Number(t.exit_price)
  const risk = t.direction === 'short' ? stop - entry : entry - stop
  if (risk === 0) return null
  const move = t.direction === 'short' ? entry - exit : exit - entry
  return move / risk
}

export function plannedRR(t) {
  if (t.planned_stop === null || t.planned_stop === undefined) return null
  if (t.planned_target === null || t.planned_target === undefined) return null
  const entry = Number(t.entry_price)
  const stop = Number(t.planned_stop)
  const target = Number(t.planned_target)
  const risk = t.direction === 'short' ? stop - entry : entry - stop
  if (!risk) return null
  const reward = t.direction === 'short' ? entry - target : target - entry
  return reward / risk
}

