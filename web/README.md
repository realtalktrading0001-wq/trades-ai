# TRADES AI — Website build (pocketaitrades.com)

This is the **website** version of the TRADES AI mini app — the exact same product
(signals, PocketOption registration + real ID verification, referrals, leaderboard,
AI assistant, i18n) but for a normal browser instead of Telegram.

It is a **self-contained copy** of `../client` + `../server`. The Telegram mini app
in the repo root is **never touched** by this folder — separate code, separate
database, separate deployment.

## What's different from the mini app

| | Mini app | Website (this folder) |
|---|---|---|
| Sign-in | Telegram `initData` (automatic) | **Email + 6-digit login code** |
| Session | Per-request initData | **Bearer session token** (localStorage) |
| Invite link | `t.me/<bot>?startapp=ref_xxx` | `https://pocketaitrades.com/?ref=xxx` |
| Email | — | Sent via **Resend** (dev: printed to console) |

Everything else — verification, signals, referrals, stats — is identical.

## Run locally

```bash
cd web
npm install          # installs root + server + client
npm run dev          # API on :4001, Vite client on :5174 (open http://localhost:5174)
```

No email account needed in dev: the login code is **printed to the server console**
and also shown on the login screen (the amber "Dev mode" banner).

```bash
npm run build        # type-check + build (CI gate)
npm start            # run the built single-origin server (serves API + client on :4001)
```

## Go live

This deploys as **one web service** (Express serves the API and the built client on one
HTTPS origin), with its **own database** — completely separate from the mini app.

### 1. Email (Resend)
1. Create an account at https://resend.com and **verify the domain** `pocketaitrades.com`.
2. Create an API key → that's `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to a sender on the verified domain, e.g. `TRADES AI <login@pocketaitrades.com>`.

### 2. Deploy (Render)
- Render Dashboard → **New +** → **Web Service** → pick this repo, set **Root Directory = `web`**.
  (A `render.yaml` is included; if you prefer Blueprint, note the repo root already has the
  mini app's blueprint, so the manual Web Service + Root Directory route is cleanest.)
- Build: `npm install && npm run build` · Start: `npm start` · Health check: `/api/health`.
- Add a **persistent disk** mounted at `/var/data` (1 GB) so the SQLite DB survives deploys.
- Set environment variables (see `server/.env.example`):
  - `DATA_DIR=/var/data`, `WEB_URL=https://pocketaitrades.com`
  - `RESEND_API_KEY` (secret), `EMAIL_FROM`, `APP_NAME`
  - `POCKETOPTION_REF_URL`, `POCKETOPTION_API_TOKEN` (secret), `POCKETOPTION_PARTNER_ID`,
    `POCKETOPTION_API_BASE`, `MIN_DEPOSIT_USD`
- Any Docker host (Railway, Fly.io, Koyeb…) works too via the included `Dockerfile`.

### 3. Point the domain (Namecheap → Render)
1. In Render, open the service → **Settings** → **Custom Domains** → add `pocketaitrades.com`
   (and `www.pocketaitrades.com`). Render shows the DNS records to create.
2. In Namecheap → **Domain List** → **Manage** → **Advanced DNS**, add the records Render gives
   you (an `ALIAS`/`A` for the apex + a `CNAME` for `www`). Save.
3. Wait for DNS to propagate; Render issues the TLS cert automatically. Verify
   `https://pocketaitrades.com/api/health` returns `{"ok":true}`.
