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
