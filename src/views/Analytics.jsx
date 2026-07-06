import { useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
} from 'recharts'
import { computeStats, closedWithPnl, tradeAdherence, avgAdherence, fmt, fmtPct, fmtPF } from '../lib/metrics.js'

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
