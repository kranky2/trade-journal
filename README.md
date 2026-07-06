# Playbook — trade journal

Personal trading journal with a TradeZella-style monthly P&L calendar and
strategy-adherence analytics ("plan vs tape"). React + Vite frontend on
GitHub Pages, Supabase (free tier) as the database.

Already wired to your Supabase project (`icjcqtkdeadsdqdjghuw`) — the URL and
publishable key are in `src/lib/supabase.js`.

---

## Setup — about 10 minutes, in this order

### 1. Create the database tables (2 min)
1. Open your Supabase project → **SQL Editor** → **New query**
2. Paste the entire contents of `schema.sql` → **Run**
3. You should see "Success. No rows returned."

### 2. Create your login (2 min)
The app requires a login so that only you can reach your data
(the publishable key ships publicly in the frontend — RLS + auth is what protects the data).
1. Supabase → **Authentication** → **Users** → **Add user** → **Create new user**
2. Enter your email + a strong password, tick **Auto Confirm User**
3. Then: **Authentication** → **Sign In / Up** → turn **OFF** "Allow new users to sign up"
   (so nobody else can register an account against your project)

### 3. Push to GitHub (3 min)
1. Create a new GitHub repo named exactly **`trade-journal`**
   (if you pick a different name, edit `base` in `vite.config.js` to match)
2. From this folder:
   ```bash
   git init
   git add .
   git commit -m "Playbook trade journal v1"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/trade-journal.git
   git push -u origin main
   ```

### 4. Turn on GitHub Pages (1 min)
1. Repo → **Settings** → **Pages**
2. Under **Build and deployment** → Source: select **GitHub Actions**
3. The included workflow (`.github/workflows/deploy.yml`) builds and deploys
   automatically on every push. First deploy takes ~2 min; check the **Actions** tab.
4. Your app: `https://YOUR_USERNAME.github.io/trade-journal/`

### 5. First run
1. Open the app, sign in with the user from step 2
2. **Strategies** tab → create your strategies (e.g. "CSP / Wheel",
   "COT relative value", "Discretionary confluence") and add each one's rules
3. **Trades** tab → log trades; picking a strategy shows its rule checklist —
   tick what you actually followed
4. **Overview** → monthly calendar (realized P&L books on exit date)
5. **Analytics** → equity curve, per-strategy stats, discipline-vs-outcome,
   and per-rule cost-of-breaking

---

## Notes

- **Works on your phone** once deployed — it's just a website, and your data
  lives in Supabase, so any device sees the same journal.
- **Roll chains**: on any trade, "Roll into new trade" creates a linked
  follow-on trade (shows a ↻ badge). Book each leg's realized P&L on its own trade.
- **P&L convention**: enter net realized P&L manually when closing a trade
  (options multipliers and multi-leg fills make auto-calc unreliable — the
  entered number is the source of truth).
- **Retiring rules**: rules are retired, not deleted, so past adherence
  history stays intact.
- Free tier limits (500 MB database, 50k monthly active users) are far beyond
  what a personal journal will ever touch.

## Troubleshooting

- **"permission denied" / empty data after login** → re-run the Grants section
  at the bottom of `schema.sql`; also check Settings → Data API → Exposed
  schemas includes `public`.
- **404 on the deployed site** → repo name and `base` in `vite.config.js`
  don't match.
- **Login fails** → confirm the user exists and was auto-confirmed
  (Authentication → Users).

## Local development

```bash
npm install
npm run dev
```
