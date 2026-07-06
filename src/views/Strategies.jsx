import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function Strategies({ strategies, rulesByStrategy, refresh }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  const addStrategy = async () => {
    if (!name.trim()) return
    setBusy(true); setErr(null)
    const { error } = await supabase.from('strategies').insert({ name: name.trim(), description: desc || null })
    if (error) setErr(error.message)
    else { setName(''); setDesc(''); await refresh() }
    setBusy(false)
  }

  return (
    <>
      <div className="card">
        <h3>New strategy</h3>
        <div className="form-grid">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="CSP / Wheel" />
          </div>
          <div className="field wide">
            <label>Description</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder="What this strategy is, when it applies" />
          </div>
        </div>
        {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
        <div className="btnrow">
          <button className="btn" onClick={addStrategy} disabled={busy || !name.trim()}>Add strategy</button>
        </div>
      </div>

      {strategies.length === 0 && (
        <div className="card">
          <div className="empty">
            No strategies yet. Define one above, then give it rules — every trade you tag with it
            will show that rule checklist, and adherence gets measured from there.
          </div>
        </div>
      )}

      {strategies.map((s) => (
        <StrategyCard key={s.id} strategy={s} rules={rulesByStrategy[s.id] || []} refresh={refresh} />
      ))}
    </>
  )
}

function StrategyCard({ strategy, rules, refresh }) {
  const [newRule, setNewRule] = useState('')
  const [err, setErr] = useState(null)
  const active = rules.filter((r) => r.active)

  const addRule = async () => {
    if (!newRule.trim()) return
    setErr(null)
    const { error } = await supabase.from('strategy_rules').insert({
      strategy_id: strategy.id,
      rule_text: newRule.trim(),
      sort_order: rules.length,
    })
    if (error) setErr(error.message)
    else { setNewRule(''); await refresh() }
  }

  // retire instead of delete → past trades keep their history
  const retireRule = async (rule) => {
    setErr(null)
    const { error } = await supabase.from('strategy_rules').update({ active: false }).eq('id', rule.id)
    if (error) setErr(error.message)
    else await refresh()
  }

  const removeStrategy = async () => {
    if (!confirm(`Delete "${strategy.name}"? Its rules and checklist history go with it. Trades keep their P&L but lose the tag.`)) return
    const { error } = await supabase.from('strategies').delete().eq('id', strategy.id)
    if (error) setErr(error.message)
    else await refresh()
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <div>
          <h3 style={{ marginBottom: 2 }}>{strategy.name}</h3>
          {strategy.description && <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{strategy.description}</div>}
        </div>
        <button className="btn danger sm" onClick={removeStrategy}>Delete</button>
      </div>

      <div style={{ marginTop: 12 }}>
        {active.length === 0 && (
          <div className="small muted">No rules yet — add the entry criteria you want to hold yourself to.</div>
        )}
        {active.map((r, i) => (
          <div key={r.id} className="rule-item" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <span className="num small muted" style={{ width: 20 }}>{i + 1}</span>
            <span style={{ flex: 1 }}>{r.rule_text}</span>
            <button className="btn ghost sm" onClick={() => retireRule(r)} title="Retire rule (history kept)">retire</button>
          </div>
        ))}
      </div>

      <div className="rule-item" style={{ marginTop: 10 }}>
        <input
          className="num"
          style={{
            background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--text)',
            borderRadius: 8, padding: '8px 10px', fontFamily: 'var(--font-body)', fontSize: 14,
          }}
          value={newRule}
          onChange={(e) => setNewRule(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addRule()}
          placeholder="e.g. IV rank above 30 at entry"
        />
        <button className="btn ghost sm" onClick={addRule}>Add rule</button>
      </div>
      {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  )
}
