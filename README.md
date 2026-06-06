# TRADES AI — Telegram Mini App

A premium dark-mode Telegram Mini App for AI trading signals. Signal access is gated
behind a PocketOption registration + ID-verification flow, with onboarding, a 5-tab
persistent nav, a referral/leaderboard system, an AI assistant, and support.

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS (`client/`)
- **Backend:** Node + Express + TypeScript + SQLite (better-sqlite3) (`server/`)

## Quick start

```bash
# from the project root
npm install        # installs root + client + server deps (postinstall)
npm run dev        # runs the API (:4000) and the Vite dev server (:5173) together
```

Open http://localhost:5173. The Vite dev server proxies `/api/*` to the backend.

> **Dev mode:** with no `BOT_TOKEN` set, the backend accepts a mock Telegram user so the
> whole app runs locally in a normal browser. Inside Telegram, real `initData` is validated.

## Configuration

Copy `server/.env.example` to `server/.env` and fill in:

| Var | Purpose |
| --- | --- |
| `PORT` | API port (default 4000) |
| `BOT_TOKEN` | Telegram bot token. Leave blank in dev to use a mock user. |
| `BOT_USERNAME` | Used to build invite links `https://t.me/<BOT_USERNAME>?start=ref_xxxx` |
| `POCKETOPTION_REF_URL` | **Your personal PocketOption affiliate link** (opened by the Register buttons) |
| `VERIFY_DELAY_SECONDS` | Seconds before a submitted ID is auto-approved (simulated verification) |
| `SUPPORT_HANDLE` | Telegram support handle (without `@`) |
| `WEEKLY_PRIZE_POOL` | USD value shown on the Referrals screen |

## How verification works (and how to make it real)

Submitting a PocketOption ID sets the user to `verifying` and stamps the time. The
`GET /api/registration/status` endpoint promotes the user to `verified` once
`VERIFY_DELAY_SECONDS` have elapsed — this is the **single seam** to replace with a real
PocketOption affiliate postback / API check. See `server/src/state.ts → maybeVerify()`.

## Structure

```
client/src/
  state/AppContext.tsx     global store (user, config, active tab)
  api.ts, telegram.ts      API wrapper + Telegram WebApp bridge
  components/              Modal, Dropdown, Accordion, WinrateRing, Countdown,
                          BottomNav, OnboardingCarousel, RegistrationModal, RegistrationCard, Icons
  screens/                Signals, Profile, Referrals, Assistant, Support
server/src/
  index.ts                Express app + all routes
  db.ts                   SQLite schema (users, stats, referrals, signals)
  auth.ts                 Telegram initData validation (+ dev mock)
  state.ts                user-state builder + simulated verify
```

## Deploying as a real Mini App

1. Create a bot with [@BotFather](https://t.me/BotFather), set `BOT_TOKEN` and `BOT_USERNAME`.
2. Host the built client (`npm run build` in `client/`) over HTTPS and the API publicly.
3. In BotFather, set the Mini App URL to your hosted client.
4. Replace `POCKETOPTION_REF_URL` with your real affiliate link and wire `maybeVerify()`
   to your affiliate verification source.
```
