# Titan Tectonic — Project Plan

> **Tectonic Hackathon · KBC Challenge**
> *"Every KBC customer gets their own personal banker — available 24/7, knows their life, and acts before they ask."*

---

## 1. The Challenge (KBC)

KBC wants a **vision + proof of concept** for a **scalable personalization approach**: a new way for the bank to understand, support and guide its **2,300,000+ customers** — at the right moment, across products and channels.

> ⚠️ They explicitly say: **not just another feature.**

**Guiding questions we answer:**
| KBC question | Our answer |
|---|---|
| What signals show what customers need? | Transactions, calendar, goals, behavior |
| How to recognize situation & intent? | Life-moment detection (travel, moving, salary change, low balance) |
| How do experiences adapt automatically? | The agent proactively suggests & acts for each customer |
| Seamless across products & channels? | One agent brain → payments, savings, investing, insurance, FX · web, voice, (WhatsApp) |
| Impact for millions at once? | One AI agent per customer — scales like software, not like advisors |

---

## 2. Our Idea — AI Banking Agent

A **chat-first banking web app** (phone format). When you open it, you land directly in a conversation with your personal AI agent. Everything you normally do by clicking through a bank app, you just **ask** — by text or by voice.

### Positioning
> **"Kate answers. Our agent anticipates."**
> KBC already has Kate (a reactive assistant). Our agent *understands your life* and acts **before** you ask.

### Key principle — Trust by design
> **The agent proposes, the human approves.** No money ever moves without explicit confirmation.

---

## 3. Features

### 🟢 Phase 1 — Core (MVP, build first)
- [ ] Open app → directly in chat with the agent
- [ ] Mini dashboard next to chat: balance, savings, recent transactions (updates live when the agent acts)
- [ ] **Transfer money** — *"Send €30 to Tom"* → confirmation → done
- [ ] **Budget** — *"How much did I spend on food this month?"* / *"Can I afford a new laptop?"*
- [ ] **Save** — *"Put €200 aside for my trip"*
- [ ] Login + each user only sees their own data
- [ ] Deployed on Google Cloud

### 🎙️ Phase 2 — Voice (ElevenLabs)
- [ ] **Mic button** → ElevenLabs **Speech-to-Text** (Scribe) → transcribed text appears in chat
- [ ] **Agent speaks back** → ElevenLabs **Text-to-Speech** plays the reply
- [ ] Speaker on/off toggle (text always shown)
- [ ] Voice confirmations: *"Should I send €30 to Tom?"* → *"Yes"*

### 📈 Phase 3 — Invest
- [ ] Set a goal + risk level → agent builds a **diversified portfolio** + monthly plan
- [ ] **Buy stocks on request** — *"Buy €200 of Apple"* → price + risk check → confirmation
- [ ] Warns if a trade doesn't match the risk profile
- [ ] Suggests what to do with extra money (bonus, refund)

### ✈️ Phase 4 — Proactive agent (the innovation)
- [ ] Reads (mock) **calendar** — opt-in
  - Flight to Tokyo → best exchange rate, travel insurance, card limit abroad
  - Wedding Saturday → set money aside for a gift
  - Rent due while away → check balance covers it
- [ ] Detects **life moments** from transactions: moving (→ update address), salary change, low balance before payday
- [ ] Cashback suggestions at partner shops
- [ ] Agent **messages first** when something relevant happens

### 🚀 Phase 5 — Bonus (if time allows)
- [ ] **Bank-side dashboard** (the scale story): *"This week: 8,400 customers traveling, 1,200 moving, 3,000 at overdraft risk"*
- [ ] **WhatsApp / Telegram** channel — text your bank without opening the app
- [ ] iMessage → *future work* (no public Apple API)

---

## 4. Agent Tools

| Tool | What it does | Confirmation? |
|---|---|---|
| `get_balance` | Account balances | – |
| `get_transactions` | Spending history | – |
| `get_profile` | Goals, risk level, situation | – |
| `get_budget_summary` | Spending per category | – |
| `transfer_money` | Send money to a contact | ✅ Required |
| `move_to_savings` | Put money aside | ✅ Required |
| `create_investment_plan` | Goal + risk → portfolio + monthly plan | – |
| `get_stock_price` | Current (mock) price & info | – |
| `buy_stock` | Risk check → buy | ✅ Required |
| `get_calendar_events` | Upcoming trips & events (opt-in) | – |
| `detect_life_moments` | Travel, moving, salary change… | – |
| `get_suggestions` | FX, cashback, insurance, budget tips | – |
| `update_address` | Update address across services | ✅ Required |

---

## 5. Architecture

```
 🎤 Voice ──► ElevenLabs STT ──┐
                               ▼
 💬 Text ────────────────► AGENT BRAIN (LLM + tools) ──► Mock bank data
                               │                        (customers, transactions,
                               ▼                         calendar, stock prices)
 🔊 Voice ◄── ElevenLabs TTS ◄─┘
                               │
             Channels: Web app · (WhatsApp/Telegram) · (future: iMessage)
```

**One brain, many mouths** — the same agent & tools behind every channel.

### Tech stack (proposal)
- **Frontend:** Next.js / React — mobile-format web app
- **Backend:** Node or Python API
- **LLM:** Gemini via Google Cloud (Vertex AI) — covered by hackathon credits
- **Voice:** ElevenLabs STT + TTS
- **Data:** mock/synthetic customers, transactions, calendar, stock prices
- **Hosting:** Google Cloud Run
- **Security audit:** Aikido

---

## 6. Security (10% of score — Aikido)

Aikido checks: **business logic flaws, IDOR, authentication, authorization.**

- [ ] Authentication — users must log in
- [ ] Authorization — agent only accesses the **logged-in user's** data (no IDOR)
- [ ] Every money / stock / address action requires **explicit confirmation**
- [ ] Limits per transfer & per trade (e.g. > €500 needs extra verification)
- [ ] Server-side validation — never trust the LLM or client for amounts/recipients
- [ ] Calendar access is **opt-in**, revocable
- [ ] Action log visible to the user
- [ ] **All API keys on backend only**, in `.env`, never committed
- [ ] Aikido **baseline scan → screenshot "before"** → fix → **screenshot "after"**

---

## 7. Hackathon Workflow

| Step | What | Time |
|---|---|---|
| 1. Plan | Lock idea, demo script, roles, claim credits (GCP only valid 1 week!) | ~10% |
| 2. Setup | Repo, `.gitignore`, README draft, connect Aikido | |
| 3. Build | Phase 1 → 2 → 3 → 4 → 5 (always keep something working) | ~55% |
| 4. Security | Aikido baseline → fix → re-scan, screenshots | ~10% |
| 5. Test | Run demo flow, try to break it, fix bugs | ~10% |
| 6. Deploy | Google Cloud Run | |
| 7. Video | < 3 min demo | ~15% |
| 8. README | What, how to run, stack, unfinished parts | |
| 9. Submit | Builderbase — ⚠️ **final means final** | |

### Team roles
- **Frontend** — chat UI, dashboard, voice button
- **Agent / AI** — LLM, tools, prompts
- **Backend + data** — API, mock data, auth, security
- **Pitch / video** — script, recording, README, submission

---

## 8. Demo Video Script (< 3 min)

1. **Problem (15s)** — 2.3M customers, advisors can't scale, apps are click-heavy and reactive
2. **Proactive (30s)** — Emma opens the app: *"I see you're flying to Tokyo next week — want yen at the best rate and travel insurance?"*
3. **Voice + invest (45s)** — *"I got a €2,000 bonus, what should I do?"* → split savings/investments by her house goal → confirms
4. **Transfer (20s)** — *"Send €30 to Tom for dinner"* → confirmation → balance updates
5. **Scale (20s)** — bank dashboard: thousands of customers personalized at once
6. **Security (20s)** — agent proposes, human approves · Aikido results
7. **Vision (10s)** — *"Kate answers. Our agent anticipates."*

---

## 9. Submission Checklist (Builderbase)

- [ ] Short description
- [ ] Demo video (< 3 minutes)
- [ ] Public GitHub repo link
- [ ] README (project, how to run, unfinished parts)
- [ ] Aikido screenshots — before & after
- [ ] All links tested in incognito
- [ ] No API keys / secrets in the repo

---

## 10. Partner Credits

| Partner | How to get | Status |
|---|---|---|
| Google Cloud | Link in Builderbase (valid 1 week) | ⬜ |
| ElevenLabs | Discord → #coupon-codes → Start Redemption | ⏳ in progress |
| Cursor | Discord → #coupon-codes → Start Redemption | ⬜ |
| Aikido | https://app.aikido.dev/ai-pentests/discounts/hackathon-tectonic-aikido → Continue with GitHub | ⬜ |

---

## 11. Team Split

See **[TEAM_TASKS.md](TEAM_TASKS.md)**: what's built, how to run it, and the 5 tasks.
