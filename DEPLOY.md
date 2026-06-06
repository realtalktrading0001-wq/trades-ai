# Deploying TRADES AI (go live)

The app is a **single web service**: Express serves both the API and the built
client over one HTTPS origin. So you deploy one service and get one URL.

## 1. Push to GitHub

```bash
# from the project root (repo is already committed)
git remote add origin https://github.com/<you>/trades-ai.git
git push -u origin main
```

## 2. Deploy on Render (recommended, free)

1. Go to https://dashboard.render.com → **New +** → **Blueprint**.
2. Pick your `trades-ai` repo. Render reads `render.yaml` and creates the service.
3. Open the service → **Environment** → set these (the rest have defaults):
   - `BOT_TOKEN` = your @BotFather token
   - `BOT_USERNAME` = your bot's username, no `@` (e.g. `tradesai_bot`)
   - `POCKETOPTION_REF_URL` = your real affiliate link
4. Deploy. When it's live you'll get a URL like `https://trades-ai.onrender.com`.
5. Verify: open `https://<your-url>/api/health` → should return `{"ok":true}`.

> Any Docker host (Railway, Fly.io, Koyeb…) also works via the included `Dockerfile`.

## 3. Point your bot at it (BotFather)

1. Open **@BotFather** → `/mybots` → select your bot → **Bot Settings** →
   **Menu Button** → **Edit menu button URL** → paste your Render URL.
2. (Optional, for `?startapp=` referral deep-links) `/newapp` → select bot →
   give it a title/short-name → set the Web App URL to your Render URL.

## 4. Test

Open your bot in Telegram and tap the **menu button** — the Mini App loads.

> Open it **inside Telegram**, not in a plain browser. Outside Telegram there's no
> `initData`, so with `BOT_TOKEN` set the API returns 401 — that's correct behavior.

## Notes / limits of the free tier

- **Cold start:** Render free services sleep after ~15 min idle; first open then
  takes ~30–50s to wake. Fine for testing.
- **SQLite is ephemeral** on free hosting: the DB resets on each deploy/restart, so
  registered users/stats reset. Add a Render **Disk** mounted at `server/data`
  (paid) for persistence, or move to Postgres later.
- **Verification is still simulated** (`maybeVerify()` in `server/src/state.ts`):
  a submitted PocketOption ID auto-approves after `VERIFY_DELAY_SECONDS`. Replace
  that one function with your real affiliate-postback check when ready.
