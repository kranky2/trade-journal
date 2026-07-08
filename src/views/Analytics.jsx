import { useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
  ScatterChart, Scatter, ZAxis, Cell,
} from 'recharts'
import {
  computeStats, closedWithPnl, tradeAdherence, avgAdherence, fmt, fmtPct, fmtPF,
  pctCaptured, dteAtExit, realizedR, plannedRR,
} from '../lib/metrics.js'

export default function Analytics({ trades, strategies, rules, checksByTrade }) {
  const closed = useMemo(
    () => closedWithPnl(trades).slice().sort((a, b) => (a.exit_date < b.exit_date ? -1 : 1)),
    [trades]
  )

  // ----- equity curve -----
  const curve = useMemo(() => {
    let cum = 0
    return closed.map((t) => {
      cum += Number(t.pnl)
      return { date: t.exit_date, equity: Math.round(cum * 100) / 100 }
    })
  }, [closed])

  // ----- per-strategy -----
  const perStrategy = strategies.map((s) => {
    const st = closed.filter((t) => t.strategy_id === s.id)
    return {
      strategy: s,
      stats: computeStats(st),
      adherence: avgAdherence(st, checksByTrade),
    }
  }).filter((row) => row.stats.count > 0)

  const untagged = closed.filter((t) => !t.strategy_id)

  // ----- adherence vs outcome -----
  const withAdh = closed
    .map((t) => ({ t, a: tradeAdherence(t, checksByTrade) }))
    .filter((x) => x.a !== null)
  const disciplined = withAdh.filter((x) => x.a >= 0.8).map((x) => x.t)
  const sloppy = withAdh.filter((x) => x.a < 0.8).map((x) => x.t)
  const dStats = computeStats(disciplined)
  const sStats = computeStats(sloppy)

  // ----- per-rule impact -----
  const ruleById = Object.fromEntries(rules.map((r) => [r.id, r]))
  const closedById = Object.fromEntries(closed.map((t) => [t.id, t]))
  const perRule = useMemo(() => {
    const acc = {}
    for (const [tradeId, checks] of Object.entries(groupChecks(checksByTrade))) {
      const t = closedById[tradeId]
      if (!t) continue
      for (const c of checks) {
        if (!acc[c.rule_id]) acc[c.rule_id] = { followed: [], broken: [] }
        acc[c.rule_id][c.followed ? 'followed' : 'broken'].push(Number(t.pnl))
      }
    }
    return Object.entries(acc)
      .map(([ruleId, { followed, broken }]) => ({
        rule: ruleById[ruleId],
        brokenCount: broken.length,
        followedCount: followed.length,
        avgWhenFollowed: followed.length ? sum(followed) / followed.length : null,
        avgWhenBroken: broken.length ? sum(broken) / broken.length : null,
        costOfBreaking: broken.length && followed.length
          ? sum(broken) / broken.length - sum(followed) / followed.length
          : null,
      }))
      .filter((r) => r.rule)
      .sort((a, b) => b.brokenCount - a.brokenCount)
  }, [checksByTrade, closedById, ruleById])

  // ----- session window performance (uses entry_time, any instrument) -----
  const withTime = closed.filter((t) => t.entry_time)
  const sessionStats = useMemo(() => {
    const buckets = {
      'Tokyo (00:00–08:00 UTC)': [],
      'London (07:00–16:00 UTC)': [],
      'New York (12:00–21:00 UTC)': [],
      'Off-hours': [],
    }
    for (const t of withTime) {
      const hour = Number(t.entry_time.split(':')[0])
      // SGT is UTC+8 — convert stored local (SGT) time to UTC hour for session buckets
      const utcHour = (hour - 8 + 24) % 24
      if (utcHour >= 0 && utcHour < 8) buckets['Tokyo (00:00–08:00 UTC)'].push(t)
      else if (utcHour >= 7 && utcHour < 12) buckets['London (07:00–16:00 UTC)'].push(t)
      else if (utcHour >= 12 && utcHour < 16) { buckets['London (07:00–16:00 UTC)'].push(t); buckets['New York (12:00–21:00 UTC)'].push(t) }
      else if (utcHour >= 16 && utcHour < 21) buckets['New York (12:00–21:00 UTC)'].push(t)
      else buckets['Off-hours'].push(t)
    }
    return Object.entries(buckets).map(([label, trades]) => ({ label, stats: computeStats(trades) }))
      .filter((r) => r.stats.count > 0)
  }, [withTime])

  // ----- delta bucket performance (options only) -----
  const withDelta = closed.filter((t) => t.delta_entry !== null && t.delta_entry !== undefined && (t.instrument === 'option' || t.instrument === 'spread'))
  const deltaBuckets = useMemo(() => {
    const ranges = [
      { label: '< 0.16Δ', test: (d) => d < 0.16 },
      { label: '0.16–0.25Δ', test: (d) => d >= 0.16 && d < 0.25 },
      { label: '0.25–0.35Δ', test: (d) => d >= 0.25 && d < 0.35 },
      { label: '0.35–0.50Δ', test: (d) => d >= 0.35 && d < 0.50 },
      { label: '≥ 0.50Δ', test: (d) => d >= 0.50 },
    ]
    return ranges.map((r) => ({
      label: r.label,
      stats: computeStats(withDelta.filter((t) => r.test(Math.abs(Number(t.delta_entry))))),
    })).filter((r) => r.stats.count > 0)
  }, [withDelta])

  // ----- CSP/option premium: % captured vs DTE remaining at exit -----
  const captureRows = useMemo(() => {
    return closed
      .filter((t) => (t.instrument === 'option' || t.instrument === 'spread') && t.expiry_date)
      .map((t) => ({
        symbol: t.symbol,
        pct: pctCaptured(t),
        dte: dteAtExit(t),
        plannedPct: t.planned_target_pct !== null && t.planned_target_pct !== undefined ? Number(t.planned_target_pct) : null,
        heldToExpiry: dteAtExit(t) === 0,
      }))
      .filter((r) => r.pct !== null && r.dte !== null)
  }, [closed])

  // ----- directional: planned R:R vs realized R -----
  const rRows = useMemo(() => {
    return closed
      .filter((t) => t.planned_stop !== null && t.planned_stop !== undefined)
      .map((t) => ({
        trade: t,
        planned: plannedRR(t),
        realized: realizedR(t),
      }))
      .filter((r) => r.realized !== null)
  }, [closed])
  const avgRealizedR = rRows.length ? rRows.reduce((s, r) => s + r.realized, 0) / rRows.length : null
  const avgPlannedR = rRows.filter((r) => r.planned !== null).length
    ? rRows.filter((r) => r.planned !== null).reduce((s, r) => s + r.planned, 0) / rRows.filter((r) => r.planned !== null).length
    : null

  if (closed.length === 0) {
    return (
      <div className="card">
        <div className="empty">
          Analytics unlock once you have closed trades with P&L recorded.
          Log trades in the Trades tab — everything here computes itself.
        </div>
      </div>
    )
  }

  const all = computeStats(closed)

  return (
    <>
      <div className="statrow">
        <Stat label="Total realized" value={fmt(all.total)} tone={all.total} />
        <Stat label="Trades" value={all.count} />
        <Stat label="Win rate" value={fmtPct(all.winRate)} />
        <Stat label="Profit factor" value={fmtPF(all.profitFactor)} />
        <Stat label="Expectancy / trade" value={fmt(all.expectancy)} tone={all.expectancy} />
      </div>

      <div className="card">
        <h3>Equity curve — cumulative realized P&L</h3>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <LineChart data={curve} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
              <XAxis dataKey="date" tick={{ fill: '#8b96ab', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                axisLine={{ stroke: '#233048' }} tickLine={false} minTickGap={40} />
              <YAxis tick={{ fill: '#8b96ab', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                axisLine={false} tickLine={false} width={64} />
              <Tooltip
                contentStyle={{ background: '#182234', border: '1px solid #233048', borderRadius: 8, fontFamily: 'IBM Plex Mono', fontSize: 12 }}
                labelStyle={{ color: '#8b96ab' }} itemStyle={{ color: '#e7ecf5' }}
              />
              <ReferenceLine y={0} stroke="#233048" />
              <Line type="stepAfter" dataKey="equity" stroke="#96a8f8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {captureRows.length > 0 && (
        <div className="card">
          <h3>Premium capture vs. time remaining</h3>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                <XAxis
                  type="number" dataKey="dte" name="DTE at exit" reversed
                  domain={[-1, 'dataMax + 2']}
                  tick={{ fill: '#8b96ab', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  axisLine={{ stroke: '#233048' }} tickLine={false}
                  label={{ value: 'Days to expiry remaining at exit', position: 'insideBottom', offset: -4, fill: '#8b96ab', fontSize: 11 }}
                />
                <YAxis
                  type="number" dataKey="pct" name="% captured" domain={[0, 110]}
                  tick={{ fill: '#8b96ab', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  axisLine={false} tickLine={false} width={60}
                  label={{ value: '% of premium captured', angle: -90, position: 'insideLeft', fill: '#8b96ab', fontSize: 11 }}
                />
                <ZAxis range={[80, 80]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ background: '#182234', border: '1px solid #233048', borderRadius: 8, fontFamily: 'IBM Plex Mono', fontSize: 12 }}
                  labelStyle={{ color: '#8b96ab' }} itemStyle={{ color: '#e7ecf5' }}
                  formatter={(value, name) => [Math.round(value * 10) / 10, name]}
                  labelFormatter={() => ''}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const p = payload[0].payload
                    return (
                      <div style={{ background: '#182234', border: '1px solid #233048', borderRadius: 8, padding: 8, fontFamily: 'IBM Plex Mono', fontSize: 12 }}>
                        <div style={{ color: '#e7ecf5' }}>{p.symbol}</div>
                        <div style={{ color: '#8b96ab' }}>{Math.round(p.pct)}% captured, {p.dte}d left</div>
                      </div>
                    )
                  }}
                />
                <Scatter data={captureRows.filter((r) => !r.heldToExpiry)} fill="#38c98e" name="Closed early" />
                <Scatter data={captureRows.filter((r) => r.heldToExpiry)} fill="#e9a53c" shape="triangle" name="Held to expiry" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>
            <span style={{ color: '#38c98e' }}>●</span> closed early &nbsp;
            <span style={{ color: '#e9a53c' }}>▲</span> held to expiry / assigned. Your decision zone is
            the top-right corner — high % captured, little time left.
          </div>
        </div>
      )}

      {rRows.length > 0 && (
        <div className="card">
          <h3>Plan vs realized — directional trades</h3>
          <div className="statrow" style={{ marginBottom: 12 }}>
            <Stat label="Avg planned R:R" value={avgPlannedR === null ? '—' : avgPlannedR.toFixed(2)} />
            <Stat label="Avg realized R" value={avgRealizedR === null ? '—' : avgRealizedR.toFixed(2)} tone={avgRealizedR} />
          </div>
          <table className="table">
            <thead>
              <tr><th>Symbol</th><th>Date</th><th>Planned R:R</th><th>Realized R</th></tr>
            </thead>
            <tbody>
              {rRows.map(({ trade, planned, realized }) => (
                <tr key={trade.id}>
                  <td className="num">{trade.symbol}</td>
                  <td className="num small">{trade.exit_date}</td>
                  <td className="num">{planned === null ? '—' : planned.toFixed(2)}</td>
                  <td className={`num ${realized >= 0 ? 'gain' : 'loss'}`}>{realized.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="small muted" style={{ marginTop: 8 }}>
            Realized R below planned R:R usually means late entries, early exits, or slippage eating into
            the setup's edge — worth a look if this trends negative over time.
          </div>
        </div>
      )}

      <div className="card">
        <h3>Plan vs tape — does discipline pay?</h3>
        {withAdh.length === 0 ? (
          <div className="small muted">
            No checklist data yet. Tag trades with a strategy and tick the rule checklist when logging —
            this section then compares outcomes when you follow your plan vs when you don't.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Cohort</th><th>Trades</th><th>Win rate</th><th>Profit factor</th><th>Avg P&L</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Followed the plan <span className="muted small">(≥80% of rules)</span></td>
                <td className="num">{dStats.count}</td>
                <td className="num">{fmtPct(dStats.winRate)}</td>
                <td className="num">{fmtPF(dStats.profitFactor)}</td>
                <td className={`num ${toneCls(dStats.expectancy)}`}>{fmt(dStats.expectancy)}</td>
              </tr>
              <tr>
                <td>Deviated <span className="muted small">(&lt;80%)</span></td>
                <td className="num">{sStats.count}</td>
                <td className="num">{fmtPct(sStats.winRate)}</td>
                <td className="num">{fmtPF(sStats.profitFactor)}</td>
                <td className={`num ${toneCls(sStats.expectancy)}`}>{fmt(sStats.expectancy)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {perRule.length > 0 && (
        <div className="card">
          <h3>Which rules cost you when broken</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Rule</th><th>Broken</th><th>Avg P&L when followed</th>
                <th>Avg P&L when broken</th><th>Cost of breaking</th>
              </tr>
            </thead>
            <tbody>
              {perRule.map((r) => (
                <tr key={r.rule.id}>
                  <td>{r.rule.rule_text}</td>
                  <td className="num">{r.brokenCount}×</td>
                  <td className={`num ${toneCls(r.avgWhenFollowed)}`}>{fmt(r.avgWhenFollowed)}</td>
                  <td className={`num ${toneCls(r.avgWhenBroken)}`}>{fmt(r.avgWhenBroken)}</td>
                  <td className={`num ${toneCls(r.costOfBreaking)}`}>{fmt(r.costOfBreaking)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="small muted" style={{ marginTop: 8 }}>
            Small sample sizes lie. Treat anything under ~10 broken instances as a hint, not a verdict.
          </div>
        </div>
      )}

      {sessionStats.length > 0 && (
        <div className="card">
          <h3>Performance by session window</h3>
          <table className="table">
            <thead>
              <tr><th>Session</th><th>Trades</th><th>Win rate</th><th>Profit factor</th><th>Avg P&L</th></tr>
            </thead>
            <tbody>
              {sessionStats.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td className="num">{r.stats.count}</td>
                  <td className="num">{fmtPct(r.stats.winRate)}</td>
                  <td className="num">{fmtPF(r.stats.profitFactor)}</td>
                  <td className={`num ${toneCls(r.stats.expectancy)}`}>{fmt(r.stats.expectancy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="small muted" style={{ marginTop: 8 }}>
            Bucketed from entry time (Tokyo/London/NY overlap hours in UTC). Sessions overlap by design —
            a trade entered during the London/NY overlap counts toward both.
          </div>
        </div>
      )}

      {deltaBuckets.length > 0 && (
        <div className="card">
          <h3>Performance by entry delta</h3>
          <table className="table">
            <thead>
              <tr><th>Delta band</th><th>Trades</th><th>Win rate</th><th>Profit factor</th><th>Avg P&L</th></tr>
            </thead>
            <tbody>
              {deltaBuckets.map((r) => (
                <tr key={r.label}>
                  <td className="num">{r.label}</td>
                  <td className="num">{r.stats.count}</td>
                  <td className="num">{fmtPct(r.stats.winRate)}</td>
                  <td className="num">{fmtPF(r.stats.profitFactor)}</td>
                  <td className={`num ${toneCls(r.stats.expectancy)}`}>{fmt(r.stats.expectancy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3>By strategy</h3>
        {perStrategy.length === 0 ? (
          <div className="small muted">No closed trades tagged with a strategy yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Strategy</th><th>Trades</th><th>Win rate</th>
                <th>Profit factor</th><th>Total P&L</th><th>Adherence</th>
              </tr>
            </thead>
            <tbody>
              {perStrategy.map(({ strategy, stats, adherence }) => (
                <tr key={strategy.id}>
                  <td>{strategy.name}</td>
                  <td className="num">{stats.count}</td>
                  <td className="num">{fmtPct(stats.winRate)}</td>
                  <td className="num">{fmtPF(stats.profitFactor)}</td>
                  <td className={`num ${toneCls(stats.total)}`}>{fmt(stats.total)}</td>
                  <td className="num">{fmtPct(adherence)}</td>
                </tr>
              ))}
              {untagged.length > 0 && (
                <tr>
                  <td className="muted">Untagged</td>
                  <td className="num">{untagged.length}</td>
                  <td className="num">{fmtPct(computeStats(untagged).winRate)}</td>
                  <td className="num">{fmtPF(computeStats(untagged).profitFactor)}</td>
                  <td className={`num ${toneCls(computeStats(untagged).total)}`}>{fmt(computeStats(untagged).total)}</td>
                  <td className="num muted">—</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

function Stat({ label, value, tone }) {
  const cls = tone === undefined || tone === null ? '' : tone >= 0 ? 'gain' : 'loss'
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className={`value ${cls}`}>{value}</div>
    </div>
  )
}

const toneCls = (n) => (n === null || n === undefined ? 'muted' : n >= 0 ? 'gain' : 'loss')
const sum = (arr) => arr.reduce((a, b) => a + b, 0)
const groupChecks = (checksByTrade) => checksByTrade
