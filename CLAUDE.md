# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**TRADES AI** — a Telegram Mini App (TMA) for AI trading signals. A two-package repo:
`client/` (React + Vite + TypeScript + Tailwind) and `server/` (Express + TypeScript +
SQLite). Signal access is gated behind a PocketOption registration + ID-verification flow.

## Commands

Run all commands from the repo root unless noted.

```bash
npm install        # installs root + client + server (via postinstall)
npm run dev        # API on :4000 AND Vite client on :5173 (concurrently) — start here
npm run build      # server tsc + client (tsc -b && vite build); use to type-check
npm start          # run the built server (after build)
```

Per-package: `npm --prefix server run dev|build`, `npm --prefix client run dev|build`.
There is **no test runner and no linter** configured — `npm run build` is the type-check/CI gate.

The Vite dev server proxies `/api/*` → `http://localhost:4000` (see `client/vite.config.ts`),
so the client always calls same-origin `/api` paths; never hardcode the API host.

## Environment / runtime constraints

- **Use the built-in `node:sqlite`, not `better-sqlite3`.** This machine has no usable
  Python and runs Node 24, so native npm modules fail to compile. `db.ts` uses
  `import { DatabaseSync } from 'node:sqlite'`. Its `.get()` returns
  `Record<string, SQLOutputValue>`, so cast results through `as unknown as MyType` or the
  `tsc` build breaks (`.all()` returns `unknown[]` and casts cleanly).
- **Dev auth is mocked.** With no `BOT_TOKEN` set, `server/src/auth.ts` accepts a mock
  Telegram user (`x-mock-user-id` header, default `dev-user-1`) so the app runs in a plain
  browser. With a token, it validates real `initData` HMAC. The client sends `initData` in
  the `x-telegram-init-data` header on every request (`client/src/api.ts`).
- Config lives in `server/.env` (copy from `.env.example`). `POCKETOPTION_REF_URL`,
  `BOT_TOKEN`, and `SUPPORT_HANDLE` are placeholders that need real values before deploy.

## Architecture (the parts that span files)

**Single source of truth for user state.** The backend builds one canonical user payload
via `server/src/state.ts → buildUserState()`. The client mirrors it in `UserState`
(`client/src/api.ts`) and holds it in `AppContext` (`client/src/state/AppContext.tsx`).
The whole UI is driven by `user.status: 'unregistered' | 'verifying' | 'verified' | 'rejected'`.

**The verification flow is the core domain logic — and it's now REAL** (no longer simulated):
1. `POST /api/registration/id` stores the PocketOption ID, sets `status='verifying'`.
2. `runVerification()` (in `state.ts`) calls the **PocketOption Partners API**
   (`server/src/pocketoption.ts`, `hash = md5(uid:partner_id:api_token)`): HTTP 200 → `verified`;
   `404 "user not found"` → after a short grace → **`rejected`**; network error → keep retrying.
   It also credits the inviter's referral (deposit ≥ `MIN_DEPOSIT_USD`). Falls back to the timed
   simulation only when `POCKETOPTION_API_TOKEN` is unset (local dev).
3. The Signals screen polls `/api/registration/status` (not `/api/me`) every ~3s while verifying;
   the `rejected` card auto-dismisses (see `POST /api/registration/reset`).

**Live in production** (on Render, Starter plan + 1 GB disk at `/var/data`): real `BOT_TOKEN`,
`POCKETOPTION_API_TOKEN`/`PARTNER_ID`, affiliate `POCKETOPTION_REF_URL`, and i18n are all wired.
SQLite persists on the disk (`db.ts` uses `/var/data` when `RENDER` is set). See the memory files
`pocketoption-verification` and `signal-ai-placeholders` for details. The AI assistant is still stubbed.

**i18n:** the whole UI is translated via `client/src/i18n.ts` + the `useT()` hook
(English/Hindi/Spanish/Portuguese/Russian/Arabic, RTL for Arabic); language + timezone come from
Profile settings (timezone affects the signal "until HH:MM" — `client/src/time.ts`).

**Signals screen state machine.** `client/src/screens/SignalsScreen.tsx` owns a local
`regStep: 'step1' | 'enterId'` (a sub-state of `unregistered`) plus the modal open flag, and
delegates rendering to `components/RegistrationCard.tsx`, which switches on `status` + `regStep`:
`step1` (STEP 1/2 card) → `enterId` (STEP 2/2 ID input) → `verifying` (spinner) → `verified`
(unlocked). `RegistrationModal.tsx` is the separate multi-page sell flow (pages 1→3 +
alt-account); its "Done, what's next?" advances `regStep` to `enterId`.

**Gating rule:** any "Register"/"Get Signal" action while `status !== 'verified'` opens
`RegistrationModal` instead of acting (see `guard()` in `SignalsScreen`).

**Navigation.** Single-page app — no router. `App.tsx` renders one of five screens based on
`tab` from `AppContext`; `BottomNav.tsx` is the persistent 5-tab bar
(Profile, Referrals, Signals [default + centered], AI Assistant, Support).

**Server shape.** All routes live in one file, `server/src/index.ts`. Everything under
`/api` except `/api/health` and `/api/config` passes through `authMiddleware`, so
`req.user` (a `UserRow`) is always available in handlers. DB schema + row types are in
`db.ts` (tables: `users`, `stats`, `referrals`, `signals`). The AI assistant
(`/api/assistant/message`) returns keyword-stubbed replies — swap that function for a real
Claude API call when needed.

## Conventions

- Styling is Tailwind only, via semantic component classes defined in `client/src/index.css`
  (`.card`, `.btn-primary`, `.btn-cyan`, `.btn-charcoal`, `.btn-ghost`, `.input-dark`,
  `.label-muted`) plus tokens in `tailwind.config.js` (`midnight`, `card`, `electric`,
  `cyan`, `amber`). Reuse these rather than ad-hoc color hexes.
- Telegram interactions (open link, share, haptics, initData) go through
  `client/src/telegram.ts`; don't touch `window.Telegram` directly elsewhere.
- Icons are inline SVG components in `client/src/components/Icons.tsx` — no icon library.
- Onboarding shows once, gated by the `signalai_onboarded` localStorage flag (`App.tsx`).
