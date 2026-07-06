import { useEffect, useState, useCallback } from 'react'
import { supabase } from './lib/supabase.js'
import Overview from './views/Overview.jsx'
import Trades from './views/Trades.jsx'
import Strategies from './views/Strategies.jsx'
import Analytics from './views/Analytics.jsx'

const TABS = ['Overview', 'Trades', 'Strategies', 'Analytics']

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [tab, setTab] = useState('Overview')
  const [data, setData] = useState({ strategies: [], rules: [], trades: [], checks: [] })
  const [loadErr, setLoadErr] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    setLoadErr(null)
    const [st, ru, tr, ch] = await Promise.all([
      supabase.from('strategies').select('*').order('name'),
      supabase.from('strategy_rules').select('*').order('sort_order'),
      supabase.from('trades').select('*').order('entry_date', { ascending: false }),
      supabase.from('rule_checks').select('*'),
    ])
    const err = st.error || ru.error || tr.error || ch.error
    if (err) { setLoadErr(err.message); return }
    setData({
      strategies: st.data || [],
      rules: ru.data || [],
      trades: tr.data || [],
      checks: ch.data || [],
    })
  }, [])

  useEffect(() => { if (session) refresh() }, [session, refresh])

  if (session === undefined) return null
  if (!session) return <Login />

  // derived lookups shared by views
  const rulesByStrategy = groupBy(data.rules, 'strategy_id')
  const checksByTrade = groupBy(data.checks, 'trade_id')
  const strategyById = Object.fromEntries(data.strategies.map((s) => [s.id, s]))

  const shared = { ...data, rulesByStrategy, checksByTrade, strategyById, refresh }

  return (
    <div className="shell">
      <div className="topbar">
        <div>
          <div className="wordmark">Play<span>book</span></div>
          <div className="tagline">plan · execute · measure the gap</div>
        </div>
        <button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {loadErr && <div className="error" style={{ marginBottom: 14 }}>Couldn't load data: {loadErr}</div>}

      {tab === 'Overview' && <Overview {...shared} />}
      {tab === 'Trades' && <Trades {...shared} />}
      {tab === 'Strategies' && <Strategies {...shared} />}
      {tab === 'Analytics' && <Analytics {...shared} />}
    </div>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  const signIn = async () => {
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErr(error.message)
    setBusy(false)
  }

  return (
    <div className="login-wrap">
      <div className="login">
        <div>
          <div className="wordmark">Play<span>book</span></div>
          <div className="tagline">plan · execute · measure the gap</div>
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && signIn()}
            autoComplete="current-password"
          />
        </div>
        {err && <div className="error">{err}</div>}
        <button className="btn" onClick={signIn} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </div>
  )
}

function groupBy(arr, key) {
  const out = {}
  for (const item of arr) {
    const k = item[key]
    if (!out[k]) out[k] = []
    out[k].push(item)
  }
  return out
}
