# Titan Tectonic — Foundation & Team Tasks

Read this first. It explains **what's already built**, **how to run it**, and **who does what next**.
Vision & roadmap: [PROJECT_PLAN.md](PROJECT_PLAN.md) · Technical details: [README.md](README.md)

---

## 1. What's in the foundation commit

### ✅ Working (once keys are set)
- **Login** (Supabase Auth). Not logged in → redirected to `/login`.
- **Chat-first home**: chat with the agent + mini dashboard (balances, recent activity).
- **Agent brain**: Gemini with function calling, looping over tools until it answers.
- **Agent tools**
  | Tool | Status |
  |---|---|
  | `get_balance` | ✅ works |
  | `get_transactions` | ✅ works |
  | `get_calendar_events` | ✅ works (only if the user opted in) |
  | `transfer_money` | ✅ proposes → user confirms → money moves |
  | `move_to_savings` | ✅ proposes → user confirms → money moves |
- **Confirm cards**: "The agent proposes, the human approves." Confirming updates the dashboard.
- **Database** (Supabase): 8 tables with Row Level Security + `confirm_action()` (the only way money moves) + 3 demo personas (Emma, Lucas, Sofia).

### 🚧 Stubs (ready to be filled in)
- Voice: `/api/voice/stt`, `/api/voice/tts`, and the 🎤 button (disabled).
- `buy_stock` and `update_address` action types in `confirm_action()`.

### 🔐 Security, built in
- Users only see their own data (RLS). Clients can't change balances.
- Money moves only after confirmation, with checks for owner, expiry, the €500 limit and the balance.
- User id always comes from the verified session, never from the AI or the request.
- CSRF check, input validation and rate limiting on every API route. Security headers are set.
- No secrets in the repo. `.env*` files are git-ignored.

### 🛠 Tooling
- Next.js 16 + TypeScript + Tailwind · Supabase · Gemini
- GitHub CI on every PR: lint, typecheck, format, build, npm audit
- `Dockerfile` for Google Cloud Run

> ⚠️ **Next.js 16:** "middleware" is now called `src/proxy.ts`. Some online tutorials are outdated. `AGENTS.md` tells Cursor/Claude to check the Next 16 docs.

---

## 2. How to run it

**Requirements:** Node 22 (`nvm use`), a Supabase project, a Gemini API key.

```bash
git clone https://github.com/ISMMO0/titan-tectonic.git
cd titan-tectonic
npm install
cp .env.example .env.local     # fill in the keys (ask in the team chat)
npm run dev                    # → http://localhost:3000
```

### One-time Supabase setup (only ONE person does this, then shares the keys by DM)
1. Create a free project on [supabase.com](https://supabase.com).
2. **SQL Editor** → run `supabase/migrations/0001_init.sql`.
3. **Authentication → Users → Add user** (tick *Auto Confirm User*):
   `emma@titan.demo`, `lucas@titan.demo`, `sofia@titan.demo`, each with a password you choose.
4. **SQL Editor** → run `supabase/seed.sql` (loads accounts, transactions, contacts, calendar).
5. **Project Settings → API** → copy the URL + *publishable/anon* key into `.env.local`.

### Gemini key
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) → `GEMINI_API_KEY` in `.env.local`.

### Try it
Log in as **Emma** and ask:
- *"What's my balance?"*
- *"What did I spend on food?"*
- *"What's coming up in my calendar?"*
- *"Send €30 to Tom"* → click **Confirm** → balance drops ✅

### Useful commands
| Command | What |
|---|---|
| `npm run dev` | Dev server |
| `npm run lint` | Lint |
| `npm run typecheck` | Type check |
| `npm run format` | Auto-format |
| `npm run build` | Production build |

> 🔐 Never commit `.env.local` and never paste keys in GitHub. Share them by DM only.

---

## 3. Tasks (5 tasks, 3 people)

Pick a task, write your name next to it in the team chat, and go.

Each task gets **one branch → one PR → CI green → one teammate reviews → merge**.
Stay inside your folders to avoid merge conflicts.

| # | Task | Can start | Branch |
|---|---|---|---|
| 1 | Setup, deploy & security | Right away (blocks others) | `chore/setup-deploy` |
| 2 | Voice (ElevenLabs) | Once keys are shared | `feat/voice` |
| 3 | Money tools: budget + invest + stocks | Once keys are shared | `feat/money-tools` |
| 4 | Proactive agent (calendar + life moments) | After task 3 | `feat/proactive` |
| 5 | Demo polish: mobile UI + bank dashboard | After tasks 1–2 | `feat/demo-polish` |

---

### Task 1 — Setup, deploy & security 🔧
**Do this first. Everyone else needs the keys.**
- [ ] Create the Supabase project, run the migration + seed, create the 3 demo users
- [ ] Share `.env.local` values with the team **by DM**
- [ ] Claim credits: Google Cloud (Builderbase link, **valid 1 week only**), ElevenLabs, Cursor
- [ ] Connect the repo to **Aikido** → run the baseline scan → 📸 **"before" screenshot**
- [ ] First deploy on **Google Cloud Run** (secrets in Secret Manager, not in the image)
- [ ] Later: fix Aikido findings → re-scan → 📸 **"after" screenshot**

**Files:** `supabase/`, `Dockerfile`, `.github/`, `src/proxy.ts`
**Done when:** the team can log in locally, and there's a public URL for the app.

---

### Task 2 — Voice (ElevenLabs) 🎙️
- [ ] `MicButton`: record audio in the browser (`MediaRecorder`), hold-to-talk
- [ ] `/api/voice/stt`: send the audio to **ElevenLabs Speech-to-Text** and return the text (check audio size and type)
- [ ] `/api/voice/tts`: send the reply text to **ElevenLabs Text-to-Speech** and stream back the audio
- [ ] Auto-play the agent's reply + a 🔊 on/off toggle
- [ ] The API key stays **server-side only** (`serverEnv()`)

**Files:** `src/components/chat/`, `src/app/api/voice/`
**Done when:** you say *"What's my balance?"*, it shows up as text, and the agent answers out loud.

---

### Task 3 — Money tools 💰
- [ ] `get_budget_summary`: spending per category this month (*"Where does my money go?"*)
- [ ] `create_investment_plan`: goal + risk level → diversified portfolio + monthly amount
- [ ] `get_stock_price`: mock prices (AAPL, KBC, IWDA…)
- [ ] `buy_stock`: risk check against the profile → **pending action** → confirm
- [ ] New migration `0002_buy_stock.sql`: handle `buy_stock` in `confirm_action()` (debit the investment account, update `holdings`)
- [ ] Improve the system prompt (tone, KBC style)

**Files:** `src/lib/agent/`, `supabase/migrations/0002_*.sql`
**Done when:** *"I got a €2,000 bonus, what should I do?"* → plan → *"Buy €200 of Apple"* → confirm → holding updated.

---

### Task 4 — Proactive agent ✈️ (the innovation)
- [ ] `detect_life_moments`: from transactions + calendar, detect travel, a wedding/gift, low balance before payday, a salary change
- [ ] `get_suggestions`: turn moments into concrete offers (best FX rate, travel insurance, save for a gift, cashback)
- [ ] **The agent speaks first**: when the app opens, it greets with a proactive suggestion (*"You're flying to Tokyo in 8 days, want yen at the best rate?"*)

**Files:** `src/lib/agent/`, a small hook in `src/components/chat/ChatWindow.tsx` (coordinate with whoever owns task 2)
**Done when:** Emma logs in and the agent proactively brings up her Tokyo trip.

---

### Task 5 — Demo polish 🎬
- [ ] Mobile-first layout (it should look like a phone app in the video)
- [ ] Nicer chat: typing indicator, quick-reply chips (*"Check balance"*, *"Save money"*)
- [ ] **Bank-side dashboard** `/bank`: *"This week: X customers travelling, Y at overdraft risk"* (the **scale** story for 2.3M customers)
- [ ] Record the **< 3 min demo video** (script in PROJECT_PLAN.md §8)
- [ ] Final README "Unfinished" section + Builderbase submission

**Done when:** the video is recorded and everything is submitted. ⚠️ Final means final.

---

## 4. Rules for working together
- `main` must **always work**. Never push directly to it; open a PR.
- **DB changes = a new migration file** (`0002_…`, `0003_…`). Never edit an old one, and tell the team when one needs to be run.
- **New agent tool** = a new file in `src/lib/agent/tools/` + add it to `index.ts` (see README).
- Anything that moves money or changes data → **pending action + confirmation**. No exceptions (Aikido checks this).
- Run `npm run lint && npm run typecheck` before opening a PR.
