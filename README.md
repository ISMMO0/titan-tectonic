# Titan Tectonic

Hackathon project for the **Tectonic Hackathon — KBC challenge**.

> *"Every KBC customer gets their own personal banker — available 24/7, knows their life, and acts before they ask."*
> **Kate answers. Titan anticipates.**

Titan is a chat-first banking web app: you open it and talk (text or voice) to your personal AI agent, which checks balances, moves money, saves, invests and proactively suggests things based on your situation (calendar, transactions, goals).
**The agent proposes, the human approves** — no money moves without explicit confirmation.

👉 **New here? Start with [TEAM_TASKS.md](TEAM_TASKS.md)** (what's built, how to run it, who does what).
Full vision & roadmap: [PROJECT_PLAN.md](PROJECT_PLAN.md)

## Team

- ismail EL HAMMOUMI
- Stefano Carulli
- Stephane Titalem

## Tech stack

| Layer | Tech |
|---|---|
| App (frontend + API) | Next.js 16 (App Router, TypeScript), Tailwind CSS |
| Database & auth | Supabase (Postgres + Auth + Row Level Security) |
| Agent brain | Gemini (`@google/genai`) with function calling |
| Voice | ElevenLabs Speech-to-Text + Text-to-Speech *(Phase 2)* |
| Hosting | Google Cloud Run (Dockerfile included) |
| Security audit | Aikido |

## Getting started

Requires Node 22 (`nvm use`).

```bash
git clone https://github.com/ISMMO0/titan-tectonic.git
cd titan-tectonic
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

### 1. Supabase (one person does this once, then shares the keys privately)

1. Create a free project on [supabase.com](https://supabase.com).
2. **SQL Editor** → paste and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
3. **Authentication → Users → Add user** (tick *Auto Confirm User*) for the demo personas:
   `emma@titan.demo`, `lucas@titan.demo`, `sofia@titan.demo` — pick your own password.
4. **SQL Editor** → run [`supabase/seed.sql`](supabase/seed.sql) to load their accounts, transactions, contacts and calendar.
5. **Project Settings → API** → copy the URL and the *publishable/anon* key into `.env.local`.

### 2. Gemini

Get an API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (or use Vertex AI with the hackathon GCP credits) → `GEMINI_API_KEY` in `.env.local`.

### 3. Try it

Log in as Emma and ask: *"What's my balance?"*, *"What did I spend on food?"*, *"Send €30 to Tom"* → confirm the card → the balance updates.

> 🔐 Share keys via a private channel (DM), **never** in the repo, issues or PRs.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm run format` | Prettier |

CI runs lint, typecheck, format check, build and `npm audit` on every PR.

## Architecture

```
 🎤 Voice ─► /api/voice/stt ─┐
 💬 Text ────────────────────┼─► /api/chat ─► Agent loop (Gemini + tools) ─► Supabase (RLS)
 🔊 Voice ◄─ /api/voice/tts ◄┘                    │
                                                  └─► pending_actions ─► user clicks Confirm
                                                        ─► /api/actions/[id]/confirm ─► confirm_action() SQL
```

```
src/
  proxy.ts                    # session refresh + redirect to /login (Next 16 "middleware")
  app/
    login/                    # sign-in page + server actions
    (app)/page.tsx            # chat-first home + mini dashboard
    api/chat/                 # agent endpoint
    api/actions/[id]/         # confirm / cancel an agent-proposed action
    api/voice/                # ElevenLabs STT/TTS (stubs)
  lib/
    agent/run.ts              # LLM ↔ tools loop
    agent/prompt.ts           # system prompt
    agent/tools/              # one file per tool + index.ts registry
    llm/gemini.ts             # Gemini client
    supabase/                 # server client, proxy helper
    security.ts               # requireUser(): same-origin + auth + rate limit
    env.ts                    # validated server secrets
  components/chat, dashboard
supabase/
  migrations/                 # schema, RLS, confirm_action()
  seed.sql                    # demo personas
```

### Adding an agent tool

1. Create `src/lib/agent/tools/my-tool.ts` with `defineTool({ name, description, schema, run })`.
2. Add it to the list in `src/lib/agent/tools/index.ts`.
3. Read data through `ctx.supabase` (RLS-scoped). **Never** accept a user id from the model.
4. Anything that changes money/data: insert a `pending_actions` row and return it as `pendingAction` — then handle the type in `confirm_action()` via a new migration.

## Security

Aikido checks business logic, IDOR, authentication and authorization. Built in from day one:

- **Row Level Security** on every table — users only ever see their own rows.
- Clients can't update balances; money only moves through `confirm_action()`, which re-checks owner, status, expiry, limits (€500/transfer) and balance, atomically.
- **Human-in-the-loop:** agent tools can only *propose* actions.
- User id always comes from the verified session (`getClaims()`), never from the LLM or request body.
- zod validation on every API input; same-origin (CSRF) check and rate limiting on every API route.
- Security headers (CSP, frame-ancestors, nosniff, HSTS…) in `next.config.ts`.
- Secrets only server-side (`server-only`), `.env*` git-ignored, no service-role key in the app.
- LLM output rendered as plain text (no HTML injection).

## Team workflow

- `main` must always work. Branch per feature: `feat/voice-stt`, `feat/invest-tools`, `fix/…`.
- Small PRs, CI green, one teammate reviews before merging.
- DB changes = **new** migration file (`0002_….sql`); never edit an applied one. Post in the chat when a migration needs to be run.
- Stay in your area to avoid conflicts (see PROJECT_PLAN.md for the split).

## Deploy (Google Cloud Run)

```bash
gcloud run deploy titan --source . --region europe-west1 \
  --set-env-vars GEMINI_MODEL=gemini-2.5-flash \
  --set-secrets GEMINI_API_KEY=gemini-key:latest,ELEVENLABS_API_KEY=elevenlabs-key:latest
```

`NEXT_PUBLIC_*` values are needed at **build** time (see `Dockerfile` build args).

## Unfinished / TODO

- Voice (ElevenLabs STT/TTS) — routes and mic button are stubs.
- Investing & stocks (`create_investment_plan`, `buy_stock`), budget summary, life-moment detection, proactive suggestions.
- Extra verification for transfers above €500.
- Bank-side "scale" dashboard, WhatsApp/Telegram channel.
- Rate limiter is in-memory (per instance).

## Hackathon notes

- Built during the official hackathon time slot.
- Repository stays public and accessible until judging is complete.
