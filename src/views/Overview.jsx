import { useMemo, useState } from 'react'
import { computeStats, avgAdherence, tradeAdherence, fmt, fmtPct, fmtPF, todayStr } from '../lib/metrics.js'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Overview({ trades, checksByTrade, strategyById }) {
  const now = todayStr() // YYYY-MM-DD in SGT
  const [ym, setYm] = useState(now.slice(0, 7)) // "YYYY-MM"
  const [selectedDay, setSelectedDay] = useState(null)

  const [year, month] = ym.split('-').map(Number)

  // realized P&L lands on the exit date
  const monthTrades = useMemo(
    () => trades.filter((t) => t.status === 'closed' && t.exit_date && t.exit_date.startsWith(ym)),
    [trades, ym]
  )

  const byDay = useMemo(() => {
    const out = {}
    for (const t of monthTrades) {
      const d = t.exit_date
      if (!out[d]) out[d] = { pnl: 0, trades: [] }
      out[d].pnl += Number(t.pnl || 0)
      out[d].trades.push(t)
    }
    return out
  }, [monthTrades])

  const maxAbs = Math.max(1, ...Object.values(byDay).map((d) => Math.abs(d.pnl)))
  const stats = computeStats(monthTrades)
  const adherence = avgAdherence(monthTrades, checksByTrade)

  // calendar layout, Monday-first
  const first = new Date(Date.UTC(year, month - 1, 1))
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const lead = (first.getUTCDay() + 6) % 7 // 0 = Monday
  const cells = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const move = (delta) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1))
    setYm(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
    setSelectedDay(null)
  }

  const monthLabel = first.toLocaleDateString('en-SG', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const dayInfo = selectedDay ? byDay[selectedDay] : null

  return (
    <>
      <div className="statrow">
        <Stat label="Month P&L" value={fmt(stats.total)} tone={stats.total} />
        <Stat label="Closed trades" value={stats.count} />
        <Stat label="Win rate" value={fmtPct(stats.winRate)} />
        <Stat label="Profit factor" value={fmtPF(stats.profitFactor)} />
        <Stat label="Avg adherence" value={fmtPct(adherence)} />
      </div>

      <div className="card">
        <div className="cal-head">
          <div className="cal-title">{monthLabel}</div>
          <div className="cal-nav">
            <button onClick={() => move(-1)} aria-label="Previous month">‹</button>
            <button onClick={() => setYm(now.slice(0, 7))}>Today</button>
            <button onClick={() => move(1)} aria-label="Next month">›</button>
          </div>
        </div>

        <div className="cal-grid">
          {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} className="cal-day empty" />
            const dstr = `${ym}-${String(day).padStart(2, '0')}`
            const info = byDay[dstr]
            const intensity = info ? Math.min(1, Math.abs(info.pnl) / maxAbs) : 0
            const bg = info
              ? info.pnl >= 0
                ? `rgba(56, 201, 142, ${0.08 + intensity * 0.3})`
                : `rgba(239, 104, 112, ${0.08 + intensity * 0.3})`
              : undefined
            return (
              <div
                key={dstr}
                className={`cal-day ${info ? 'has-trades' : ''} ${selectedDay === dstr ? 'selected' : ''}`}
                style={{ background: bg }}
                onClick={() => info && setSelectedDay(selectedDay === dstr ? null : dstr)}
              >
                <div className="d">{day}</div>
                {info && (
                  <div>
                    <div className={`p ${info.pnl >= 0 ? 'gain' : 'loss'}`}>{fmt(info.pnl)}</div>
                    <div className="c">{info.trades.length} trade{info.trades.length > 1 ? 's' : ''}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="small muted" style={{ marginTop: 10 }}>
          Realized P&L, booked on the exit date. Click a day to see its trades.
        </div>
      </div>

      {dayInfo && (
        <div className="card">
          <h3>{selectedDay} — {fmt(dayInfo.pnl)} across {dayInfo.trades.length} trade{dayInfo.trades.length > 1 ? 's' : ''}</h3>
          <table className="table">
            <thead>
              <tr><th>Symbol</th><th>Strategy</th><th>P&L</th><th>Discipline</th></tr>
            </thead>
            <tbody>
              {dayInfo.trades.map((t) => (
                <tr key={t.id}>
                  <td className="num">{t.symbol}</td>
                  <td>{strategyById[t.strategy_id]?.name || <span className="muted">—</span>}</td>
                  <td className={`num ${t.pnl >= 0 ? 'gain' : 'loss'}`}>{fmt(Number(t.pnl))}</td>
                  <td><Ticks trade={t} checksByTrade={checksByTrade} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function Stat({ label, value, tone }) {
  const cls = tone === undefined ? '' : tone >= 0 ? 'gain' : 'loss'
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className={`value ${cls}`}>{value}</div>
    </div>
  )
}

export function Ticks({ trade, checksByTrade }) {
  const checks = checksByTrade[trade.id] || []
  if (!checks.length) return <span className="muted small">no checklist</span>
  const a = tradeAdherence(trade, checksByTrade)
  return (
    <span title={`${Math.round(a * 100)}% of rules followed`}>
      <span className="ticks">
        {checks.map((c) => (
          <span key={c.id} className={`tick ${c.followed ? 'on' : 'off'}`} />
        ))}
      </span>
    </span>
  )
}
