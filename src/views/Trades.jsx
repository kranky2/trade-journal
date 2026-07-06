import { useMemo, useState, Fragment } from 'react'
import { supabase } from '../lib/supabase.js'
import { fmt, todayStr, buildChains } from '../lib/metrics.js'
import { Ticks } from './Overview.jsx'

const BLANK = {
  symbol: '', strategy_id: '', instrument: 'option', direction: 'neutral',
  status: 'open', entry_date: '', exit_date: '', entry_time: '', exit_time: '',
  quantity: '', entry_price: '', exit_price: '', delta_entry: '', delta_exit: '',
  fees: '', pnl: '', thesis: '', notes: '', parent_trade_id: null,
}

export default function Trades({ trades, strategies, rulesByStrategy, checksByTrade, strategyById, refresh }) {
  const [editing, setEditing] = useState(null) // null | 'new' | trade.id
  const [form, setForm] = useState(BLANK)
  const [checks, setChecks] = useState({}) // rule_id -> followed
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('all')
  const [chainsOpen, setChainsOpen] = useState(true)
  const [expandedChain, setExpandedChain] = useState(null)

  const chains = useMemo(() => buildChains(trades), [trades])

  const tradeById = useMemo(() => Object.fromEntries(trades.map((t) => [t.id, t])), [trades])

  const visible = trades.filter((t) =>
    filter === 'all' ? true : filter === 'open' ? t.status === 'open' : t.status === 'closed'
  )

  const startNew = (prefill = {}) => {
    setForm({ ...BLANK, entry_date: todayStr(), ...prefill })
    setChecks({})
    setEditing('new')
    setErr(null)
  }

  const startEdit = (t) => {
    setForm({
      ...t,
      quantity: t.quantity ?? '', entry_price: t.entry_price ?? '',
      exit_price: t.exit_price ?? '', fees: t.fees ?? '', pnl: t.pnl ?? '',
      exit_date: t.exit_date ?? '', thesis: t.thesis ?? '', notes: t.notes ?? '',
      strategy_id: t.strategy_id ?? '',
      entry_time: t.entry_time ?? '', exit_time: t.exit_time ?? '',
      delta_entry: t.delta_entry ?? '', delta_exit: t.delta_exit ?? '',
    })
    const existing = {}
    for (const c of checksByTrade[t.id] || []) existing[c.rule_id] = c.followed
    setChecks(existing)
    setEditing(t.id)
    setErr(null)
  }

  const roll = (t) => {
    startNew({
      symbol: t.symbol, strategy_id: t.strategy_id ?? '', instrument: t.instrument,
      direction: t.direction, parent_trade_id: t.id,
      thesis: `Rolled from ${t.symbol} (${t.entry_date} → ${t.exit_date || 'open'}).`,
    })
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const activeRules = form.strategy_id ? (rulesByStrategy[form.strategy_id] || []).filter((r) => r.active) : []

  const save = async () => {
    setBusy(true); setErr(null)
    const payload = {
      symbol: form.symbol.trim().toUpperCase(),
      strategy_id: form.strategy_id || null,
      parent_trade_id: form.parent_trade_id || null,
      instrument: form.instrument,
      direction: form.direction,
      status: form.status,
      entry_date: form.entry_date,
      exit_date: form.exit_date || null,
      entry_time: form.entry_time || null,
      exit_time: form.exit_time || null,
      quantity: numOrNull(form.quantity),
      entry_price: numOrNull(form.entry_price),
      exit_price: numOrNull(form.exit_price),
      delta_entry: numOrNull(form.delta_entry),
      delta_exit: numOrNull(form.delta_exit),
      fees: numOrNull(form.fees) ?? 0,
      pnl: numOrNull(form.pnl),
      thesis: form.thesis || null,
      notes: form.notes || null,
    }
    if (!payload.symbol) { setErr('Symbol is required.'); setBusy(false); return }
    if (!payload.entry_date) { setErr('Entry date is required.'); setBusy(false); return }
    if (payload.status === 'closed' && payload.pnl === null) {
      setErr('A closed trade needs its realized P&L.'); setBusy(false); return
    }

    let tradeId = editing === 'new' ? null : editing
    if (editing === 'new') {
      const { data, error } = await supabase.from('trades').insert(payload).select('id').single()
      if (error) { setErr(error.message); setBusy(false); return }
      tradeId = data.id
    } else {
      const { error } = await supabase.from('trades').update(payload).eq('id', tradeId)
      if (error) { setErr(error.message); setBusy(false); return }
    }

    // save checklist state for the selected strategy's rules
    if (activeRules.length) {
      const rows = activeRules.map((r) => ({
        trade_id: tradeId, rule_id: r.id, followed: !!checks[r.id],
      }))
      const { error } = await supabase
        .from('rule_checks')
        .upsert(rows, { onConflict: 'trade_id,rule_id' })
      if (error) { setErr(error.message); setBusy(false); return }
    }

    await refresh()
    setEditing(null)
    setBusy(false)
  }

  const remove = async () => {
    if (!confirm('Delete this trade? Its checklist records go with it.')) return
    setBusy(true)
    const { error } = await supabase.from('trades').delete().eq('id', editing)
    if (error) { setErr(error.message); setBusy(false); return }
    await refresh()
    setEditing(null)
    setBusy(false)
  }

  return (
    <>
      {editing === null && (
        <>
          {chains.length > 0 && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', cursor: 'pointer' }}
                onClick={() => setChainsOpen((v) => !v)}>
                <h3>Position chains <span className="muted small">({chains.length})</span></h3>
                <span className="muted small">{chainsOpen ? '▾ collapse' : '▸ expand'}</span>
              </div>
              {chainsOpen && (
                <table className="table" style={{ marginTop: 10 }}>
                  <thead>
                    <tr>
                      <th>Symbol</th><th>Legs</th><th>Span</th><th>Status</th><th>Net P&L</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {chains.map((c, idx) => (
                      <Fragment key={c.root.id}>
                        <tr className="rowlink"
                          onClick={() => setExpandedChain(expandedChain === idx ? null : idx)}>
                          <td className="num">{c.root.symbol}</td>
                          <td className="num">{c.legs.length}</td>
                          <td className="small">{c.start} → {c.end || 'open'} <span className="muted">({c.days}d)</span></td>
                          <td><span className={`badge ${c.isOpen ? 'open' : ''}`}>{c.isOpen ? 'open' : 'closed'}</span></td>
                          <td className={`num ${c.totalPnl >= 0 ? 'gain' : 'loss'}`}>{fmt(c.totalPnl)}</td>
                          <td className="muted small">{expandedChain === idx ? '▾' : '▸'}</td>
                        </tr>
                        {expandedChain === idx && c.legs.map((leg) => (
                          <tr key={leg.id} className="rowlink" onClick={() => startEdit(leg)}>
                            <td colSpan={2} className="small muted" style={{ paddingLeft: 24 }}>
                              {leg.instrument} · {leg.entry_date}{leg.exit_date ? ` → ${leg.exit_date}` : ' (open)'}
                            </td>
                            <td colSpan={2} className="small muted">{leg.direction}</td>
                            <td className={`num small ${leg.pnl == null ? 'muted' : leg.pnl >= 0 ? 'gain' : 'loss'}`}>
                              {leg.pnl == null ? '—' : fmt(Number(leg.pnl))}
                            </td>
                            <td></td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="small muted" style={{ marginTop: 8 }}>
                Groups trades linked via "Roll into new trade" or assignment — a wheel cycle from put to shares
                to calls shows as one chain. Click a row to expand its legs, click a leg to open it.
              </div>
            </div>
          )}

          <div className="btnrow" style={{ marginTop: 0, marginBottom: 14, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['all', 'open', 'closed'].map((f) => (
                <button key={f} className={`btn ghost sm ${filter === f ? '' : ''}`}
                  style={filter === f ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
                  onClick={() => setFilter(f)}>
                  {f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <button className="btn" onClick={() => startNew()}>+ New trade</button>
          </div>

          <div className="card">
            {visible.length === 0 ? (
              <div className="empty">No trades here yet. Log your first one with “New trade”.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Entry</th><th>Symbol</th><th>Strategy</th>
                    <th>Status</th><th>P&L</th><th>Discipline</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t) => (
                    <tr key={t.id} className="rowlink" onClick={() => startEdit(t)}>
                      <td className="num small">{t.entry_date}</td>
                      <td className="num">
                        {t.symbol}
                        {t.parent_trade_id && <span className="badge roll" style={{ marginLeft: 6 }}>↻ roll</span>}
                      </td>
                      <td>{strategyById[t.strategy_id]?.name || <span className="muted">—</span>}</td>
                      <td><span className={`badge ${t.status === 'open' ? 'open' : ''}`}>{t.status}</span></td>
                      <td className={`num ${t.pnl === null ? 'muted' : t.pnl >= 0 ? 'gain' : 'loss'}`}>
                        {t.pnl === null ? '—' : fmt(Number(t.pnl))}
                      </td>
                      <td><Ticks trade={t} checksByTrade={checksByTrade} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {editing !== null && (
        <div className="card">
          <h3>{editing === 'new' ? 'New trade' : 'Edit trade'}</h3>
          {form.parent_trade_id && tradeById[form.parent_trade_id] && (
            <div className="small muted" style={{ marginBottom: 10 }}>
              ↻ Rolled from {tradeById[form.parent_trade_id].symbol} · {tradeById[form.parent_trade_id].entry_date}
            </div>
          )}

          <div className="form-grid">
            <div className="field">
              <label>Symbol</label>
              <input value={form.symbol} onChange={set('symbol')} placeholder="MU" />
            </div>
            <div className="field">
              <label>Strategy</label>
              <select value={form.strategy_id} onChange={set('strategy_id')}>
                <option value="">— none —</option>
                {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Instrument</label>
              <select value={form.instrument} onChange={set('instrument')}>
                {['option', 'spread', 'stock', 'futures', 'fx'].map((i) => <option key={i}>{i}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Direction</label>
              <select value={form.direction} onChange={set('direction')}>
                {['long', 'short', 'neutral'].map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select value={form.status} onChange={set('status')}>
                <option>open</option><option>closed</option>
              </select>
            </div>
            <div className="field">
              <label>Entry date</label>
              <input type="date" value={form.entry_date} onChange={set('entry_date')} />
            </div>
            <div className="field">
              <label>Entry time {form.instrument === 'fx' && <span className="muted">(session)</span>}</label>
              <input type="time" value={form.entry_time} onChange={set('entry_time')} />
            </div>
            <div className="field">
              <label>Exit date</label>
              <input type="date" value={form.exit_date} onChange={set('exit_date')} />
            </div>
            <div className="field">
              <label>Exit time</label>
              <input type="time" value={form.exit_time} onChange={set('exit_time')} />
            </div>
            <div className="field">
              <label>Quantity</label>
              <input inputMode="decimal" value={form.quantity} onChange={set('quantity')} placeholder="1" />
            </div>
            <div className="field">
              <label>Entry price</label>
              <input inputMode="decimal" value={form.entry_price} onChange={set('entry_price')} placeholder="5.46" />
            </div>
            <div className="field">
              <label>Exit price</label>
              <input inputMode="decimal" value={form.exit_price} onChange={set('exit_price')} />
            </div>
            {(form.instrument === 'option' || form.instrument === 'spread') && (
              <>
                <div className="field">
                  <label>Delta at entry</label>
                  <input inputMode="decimal" value={form.delta_entry} onChange={set('delta_entry')} placeholder="0.16" />
                </div>
                <div className="field">
                  <label>Delta at close</label>
                  <input inputMode="decimal" value={form.delta_exit} onChange={set('delta_exit')} placeholder="0.42" />
                </div>
              </>
            )}
            <div className="field">
              <label>Fees</label>
              <input inputMode="decimal" value={form.fees} onChange={set('fees')} placeholder="0" />
            </div>
            <div className="field">
              <label>Realized P&L (net)</label>
              <input inputMode="decimal" value={form.pnl} onChange={set('pnl')} placeholder="fill when closed" />
            </div>
            <div className="field wide">
              <label>Thesis — the plan, before entry</label>
              <textarea value={form.thesis} onChange={set('thesis')}
                placeholder="Setup, entry criteria, invalidation level, target…" />
            </div>
            <div className="field wide">
              <label>Execution notes — what actually happened</label>
              <textarea value={form.notes} onChange={set('notes')}
                placeholder="Fills, deviations, emotions, what you'd repeat or avoid…" />
            </div>
          </div>

          {form.strategy_id && (
            <div style={{ marginTop: 14 }}>
              <label className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Rule checklist — tick what you actually followed
              </label>
              {activeRules.length === 0 ? (
                <div className="small muted" style={{ marginTop: 6 }}>
                  This strategy has no rules yet. Add them in the Strategies tab.
                </div>
              ) : (
                <div className="checklist">
                  {activeRules.map((r) => (
                    <label key={r.id}>
                      <input
                        type="checkbox"
                        checked={!!checks[r.id]}
                        onChange={(e) => setChecks((c) => ({ ...c, [r.id]: e.target.checked }))}
                      />
                      {r.rule_text}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}

          <div className="btnrow">
            <button className="btn" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save trade'}
            </button>
            <button className="btn ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
            {editing !== 'new' && (
              <>
                <button className="btn ghost" onClick={() => roll(tradeById[editing])} disabled={busy}>
                  ↻ Roll into new trade
                </button>
                <button className="btn danger" onClick={remove} disabled={busy}>Delete</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const numOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}
