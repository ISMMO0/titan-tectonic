# Titan — the banking agent that anticipates

> **Tectonic Hackathon · KBC challenge** — *"Kate answers. Titan anticipates."*

[![Titan demo](docs/media/titan-teaser.gif)](docs/media/titan-teaser.mp4)

*15-second teaser — click for the full-quality MP4.*

### Live demo (real app, real database)

[![Titan live demo](docs/media/titan-live-demo.gif)](docs/media/titan-live-demo.mp4)

*Screen recording at 4× speed — click for the full 77-second video.* Emma checks her balance, moves €500 to savings, asks for investment advice, buys €600 of a world ETF and sends €50 to Tom — every action confirmed by her, and the balance updates live from Supabase.

---

Titan is a chat-first banking app: every customer gets a personal AI agent they can **type or talk to**. It reads their real accounts, spots what's happening in their life, and proposes the next step — but **nothing moves until the customer taps Confirm**.

## What it does

| | Feature | Example |
|---|---|---|
| ✈️ | **Speaks first** | Detects an upcoming trip, a wedding, a low balance or a salary → *"Your Tokyo trip is in 8 days — want yen at 162.4?"* |
| 💶 | **Understands spending** | *"Where does my money go?"* → breakdown by category and merchant |
| 📈 | **Invests by risk profile** | *"€2,000 bonus, house in 3 years"* → diversified plan + projection |
| 🛒 | **Acts, with approval** | Transfers, savings, buying stocks → confirm card (with risk warning) → database updated |
| 🎙️ | **Voice** | Speech-to-text in, spoken answers out (EN / NL / FR) |

## How it works

```
Customer (text / voice) ──► Agent (Gemini + 12 tools) ──► Supabase (Postgres + RLS)
                                   │
                                   └─► proposes action ──► customer confirms ──► confirm_action() moves the money
```

- **Agent:** Gemini with function calling and 12 typed tools (balance, budget, calendar, life moments, stocks, portfolio, investment plan, FX, transfer, savings, buy stock).
- **Proactive engine:** simple, explainable rules over calendar + transactions + balances — built to run for millions of customers.
- **Human-in-the-loop:** the model can only *propose*. Money moves exclusively in one SQL function that re-checks owner, expiry, limits, balance and price.

## Security by design

Row Level Security on every table · clients can't write balances · user identity always from the verified session (never from the model) · zod validation on every input · CSRF same-origin check + rate limiting · CSP & security headers · secrets server-side only · LLM output rendered as plain text.

## Tech stack

Next.js 16 (App Router, TypeScript) · Supabase (Postgres, Auth, RLS) · Google Gemini (agent, speech-to-text, text-to-speech) · Tailwind CSS · Docker / Google Cloud Run · GitHub Actions CI.

## Run it locally

```bash
npm install
cp .env.example .env.local   # Supabase URL + publishable key, Gemini API key
npm run dev                  # http://localhost:3000
```

Database: run `supabase/migrations/*.sql` in order, create the demo users, then `supabase/seed.sql`. Full setup and team workflow: [TEAM_TASKS.md](TEAM_TASKS.md) · vision & roadmap: [PROJECT_PLAN.md](PROJECT_PLAN.md).

**Not finished yet:** ordering foreign currency, extra verification above €500, bank-side "scale" dashboard, public deployment.

## Team

Ismail El Hammoumi · Stefano Carulli · Stephane Titalem — built during the Tectonic Hackathon.
