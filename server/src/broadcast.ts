// Admin broadcast tool, operated entirely from inside Telegram.
//
// Flow (a stateful "compose" conversation over the bot webhook):
//   1. Admin DMs:  /broadcast <passphrase>
//      → authorised only if from.id ∈ ADMIN_CHAT_IDS AND passphrase === BROADCAST_PASSPHRASE.
//   2. Admin sends the content: plain text, or a photo / video / GIF / document with a caption.
//   3. Bot asks for optional link buttons (one per line, `Label | https://url`), or /preview
//      for the default Open-App button, or /nobutton for none.
//   4. Bot echoes a live preview (exactly as recipients will see it) + recipient count +
//      [✅ Send] / [✖ Cancel] inline buttons (a short draft token rides on the buttons).
//   5. Tap ✅ → bot blasts every welcomed=1 user (throttled), then reports sent/failed/blocked.
//
// Two-factor auth (id allow-list AND passphrase) keeps a stray /broadcast from random users
// inert. No-ops gracefully if BOT_TOKEN / env is unset (local dev).

import crypto from 'node:crypto';
import { db } from './db.js';
import {
  BOT_CONFIGURED,
  callBotApi,
  openAppKeyboard,
  sendBotMessage,
  editBotMessageText,
  answerCallbackQuery,
  setBotWebhook,
} from './telegram-bot.js';

export const BOT_WEBHOOK_SECRET = process.env.BOT_WEBHOOK_SECRET ?? '';
const BROADCAST_PASSPHRASE = process.env.BROADCAST_PASSPHRASE ?? '';
const ADMIN_CHAT_IDS = (process.env.ADMIN_CHAT_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const isAdmin = (id: string | number) => ADMIN_CHAT_IDS.includes(String(id));

// Scheduling timezone (fixed offset; IST has no DST). 330 = UTC+5:30.
const OFFSET_MIN = Number(process.env.SCHEDULE_OFFSET_MIN) || 330;
const TZ_LABEL = process.env.SCHEDULE_TZ_LABEL ?? 'IST';

// What a composed post is for: send now, schedule, or save to an onboarding stage.
type Intent = 'broadcast' | 'schedule' | 'welcome' | 'post2' | 'post3';
type Stage = 'welcome' | 'post2' | 'post3';
const INTENT_LABEL: Record<Intent, string> = {
  broadcast: 'send to all users now',
  schedule: 'schedule to send later',
  welcome: 'the instant welcome DM',
  post2: 'follow-up post 2 (15s after welcome)',
  post3: 'follow-up post 3 (2 min after welcome)',
};

// Throttle: Telegram tolerates ~30 messages/sec to distinct users for bulk sends.
// 40ms between sends keeps us comfortably under that.
const SEND_DELAY_MS = 40;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Media kinds we forward, mapped to the Bot API send method + body field.
type MediaKind = 'photo' | 'video' | 'animation' | 'document';
const MEDIA: Record<MediaKind, { method: string; field: string }> = {
  photo: { method: 'sendPhoto', field: 'photo' },
  video: { method: 'sendVideo', field: 'video' },
  animation: { method: 'sendAnimation', field: 'animation' }, // GIFs
  document: { method: 'sendDocument', field: 'document' },
};

interface DraftButton {
  text: string;
  url: string;
}

// ---- In-memory conversation state (single Render instance; fine to lose on redeploy) ----

interface Content {
  kind: 'text' | MediaKind;
  text: string; // message body, or media caption ('' if none)
  fileId?: string; // set for media kinds
}
/**
 * Admins past auth. phase: 'content' = awaiting the message, 'buttons' = awaiting
 * button lines, 'sched_datetime'/'sched_time' = awaiting a typed schedule time.
 */
interface Compose {
  phase: 'content' | 'buttons' | 'sched_datetime' | 'sched_time';
  intent: Intent;
  content?: Content;
  token?: string; // draft token (schedule typed-time phases)
  date?: DateParts; // chosen date awaiting a typed time
  createdAt: number;
}
const compose = new Map<string, Compose>();

interface Draft extends Content {
  adminId: string;
  intent: Intent;
  replyMarkup?: unknown; // computed inline keyboard (buttons / default / none)
  buttonCount: number;
  date?: DateParts; // schedule: chosen date awaiting a time
  createdAt: number;
}
const drafts = new Map<string, Draft>();
const TTL_MS = 60 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [k, d] of drafts) if (now - d.createdAt > TTL_MS) drafts.delete(k);
  for (const [k, c] of compose) if (now - c.createdAt > TTL_MS) compose.delete(k);
}

// ---- Minimal Telegram update shapes (only the fields we read) ----

interface TgUser {
  id: number;
}
interface TgChat {
  id: number;
  type?: string;
}
interface TgFile {
  file_id: string;
}
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  caption?: string;
  photo?: TgFile[];
  video?: TgFile;
  animation?: TgFile;
  document?: TgFile;
}
interface TgCallbackQuery {
  id: string;
  from: TgUser;
  data?: string;
  message?: TgMessage;
}
export interface TgUpdate {
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

// ---- Public entry points ----

/** Handle one Telegram webhook update. Never throws (logs and swallows). */
export async function handleBotUpdate(update: TgUpdate): Promise<void> {
  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message) {
      await handleMessage(update.message);
    }
  } catch (e) {
    console.warn('[broadcast] update error:', e instanceof Error ? e.message : e);
  }
}

/** Register the webhook with Telegram on boot. */
export async function registerBotWebhook(): Promise<void> {
  const base = (process.env.WEBHOOK_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(
    /\/$/,
    ''
  );
  if (!BOT_CONFIGURED || !base || !BOT_WEBHOOK_SECRET) {
    console.log(
      '[broadcast] webhook not registered (need BOT_TOKEN + WEBHOOK_BASE_URL/RENDER_EXTERNAL_URL + BOT_WEBHOOK_SECRET).'
    );
    return;
  }
  const url = `${base}/telegram/webhook/${BOT_WEBHOOK_SECRET}`;
  const ok = await setBotWebhook(url, BOT_WEBHOOK_SECRET);
  console.log(`[broadcast] setWebhook ${ok ? 'ok' : 'failed'} → ${url}`);
  if (ADMIN_CHAT_IDS.length === 0) console.warn('[broadcast] ADMIN_CHAT_IDS is empty — no one can broadcast.');
  if (!BROADCAST_PASSPHRASE) console.warn('[broadcast] BROADCAST_PASSPHRASE is empty — broadcasts disabled.');
}

// ---- Message handling ----

async function handleMessage(msg: TgMessage): Promise<void> {
  if (!msg.from || msg.chat.type !== 'private') return; // ignore groups/channels
  const fromId = String(msg.from.id);
  const chatId = msg.chat.id;
  const text = (msg.text ?? '').trim();

  // /cancel — abort an in-progress compose at any step.
  if (text === '/cancel' || text.startsWith('/cancel ')) {
    compose.delete(fromId);
    await sendBotMessage(chatId, '❌ Cancelled.');
    return;
  }

  // A typed schedule time captured mid-flow (after "⌨️ Type" on the pickers).
  const sched = compose.get(fromId);
  if (sched && (sched.phase === 'sched_datetime' || sched.phase === 'sched_time')) {
    await handleTypedSchedule(fromId, chatId, text, sched);
    return;
  }

  // ----- Admin commands (all require the id allow-list AND the passphrase) -----
  const cmdMatch = /^\/([a-z0-9_]+)(?:@\w+)?/i.exec(text);
  const cmd = cmdMatch ? '/' + cmdMatch[1].toLowerCase() : '';
  const rest = cmd ? text.slice(cmdMatch![0].length).trim() : '';

  // Commands that start the compose flow, mapped to their intent.
  const starters: Record<string, Intent> = {
    '/broadcast': 'broadcast',
    '/schedule': 'schedule',
    '/setwelcome': 'welcome',
    '/setpost2': 'post2',
    '/setpost3': 'post3',
  };
  if (cmd in starters) {
    if (!(await requireAuth(fromId, chatId, rest, cmd))) return;
    prune();
    const intent = starters[cmd];
    compose.set(fromId, { phase: 'content', intent, createdAt: Date.now() });
    await sendBotMessage(
      chatId,
      `✅ <b>Authorised.</b>\n\nNow send the post for <b>${INTENT_LABEL[intent]}</b> — plain <b>text</b>, or a <b>photo / video / GIF / document</b> (caption optional).\n\nSend /cancel anytime to abort.`
    );
    return;
  }

  if (cmd === '/scheduled') {
    if (await requireAuth(fromId, chatId, rest, cmd)) await listScheduled(chatId);
    return;
  }
  if (cmd === '/onboarding') {
    if (await requireAuth(fromId, chatId, rest, cmd)) await listOnboarding(chatId);
    return;
  }
  if (cmd === '/testdrip') {
    if (await requireAuth(fromId, chatId, rest, cmd)) await runTestDrip(chatId);
    return;
  }
  if (cmd === '/clearwelcome' || cmd === '/clearpost2' || cmd === '/clearpost3') {
    if (!(await requireAuth(fromId, chatId, rest, cmd))) return;
    const stage = cmd.slice('/clear'.length) as Stage;
    clearStage(stage);
    await sendBotMessage(chatId, `🗑️ Cleared ${INTENT_LABEL[stage]}.`);
    return;
  }
  if (cmd === '/stats') {
    if (await requireAuth(fromId, chatId, rest, cmd))
      await sendBotMessage(chatId, `👥 Reachable users (welcomed): <b>${recipientCount()}</b>`);
    return;
  }

  // Otherwise: mid-compose content / button input.
  const state = compose.get(fromId);
  if (!state) return; // not mid-compose → stay silent to everyone else
  if (state.phase === 'content') await handleContent(fromId, chatId, msg);
  else if (state.phase === 'buttons') await handleButtons(fromId, chatId, text);
}

/** Auth gate shared by every admin command: id allow-list AND passphrase. */
async function requireAuth(fromId: string, chatId: number, passphrase: string, cmd: string): Promise<boolean> {
  if (!isAdmin(fromId)) {
    await sendBotMessage(
      chatId,
      `🚫 You're not authorised.\n\nYour Telegram ID is <code>${fromId}</code>.`
    );
    return false;
  }
  if (!BROADCAST_PASSPHRASE || passphrase !== BROADCAST_PASSPHRASE) {
    await sendBotMessage(
      chatId,
      `🔒 Wrong (or missing) passphrase. Usage:\n<code>${cmd} &lt;passphrase&gt;</code>`
    );
    return false;
  }
  return true;
}

/** Step 2 → 3: capture the content, then ask about buttons. */
async function handleContent(fromId: string, chatId: number, msg: TgMessage): Promise<void> {
  const intent = compose.get(fromId)?.intent ?? 'broadcast';
  const content = extractContent(msg);
  if (!content) {
    await sendBotMessage(
      chatId,
      '⚠️ Unsupported message. Send plain text, or a single photo / video / GIF / document (caption optional). /cancel to abort.'
    );
    return; // stay in 'content' phase to retry
  }
  compose.set(fromId, { phase: 'buttons', intent, content, createdAt: Date.now() });
  await sendBotMessage(
    chatId,
    '👍 Got it. <b>Add link buttons?</b> (optional, boosts clicks)\n\n' +
      'Send one button per line as:\n<code>Label | https://your-link.com</code>\n\n' +
      'Example:\n<code>🚀 Trade Now | https://pocketoption.com\n📈 Open App | https://t.me/tradesaipocketbot?startapp=open</code>\n\n' +
      'Or:\n• /preview — keep just the default 🚀 Open App button\n• /nobutton — no buttons at all',
    { replyMarkup: undefined }
  );
}

/** Step 3 → 4: parse button lines (or /preview, /nobutton), then show the preview. */
async function handleButtons(fromId: string, chatId: number, text: string): Promise<void> {
  const state = compose.get(fromId);
  if (!state?.content) {
    compose.delete(fromId);
    return;
  }

  let replyMarkup: unknown;
  let buttonCount = 0;

  if (text === '/preview') {
    replyMarkup = openAppKeyboard();
    buttonCount = 1;
  } else if (text === '/nobutton') {
    replyMarkup = undefined;
    buttonCount = 0;
  } else {
    const buttons = parseButtons(text);
    if (buttons.length === 0) {
      await sendBotMessage(
        chatId,
        "⚠️ Couldn't read any buttons. Use <code>Label | https://link</code> per line — or /preview (default button) or /nobutton."
      );
      return; // stay in 'buttons' phase
    }
    replyMarkup = { inline_keyboard: buttons.map((b) => [{ text: b.text, url: b.url }]) };
    buttonCount = buttons.length;
  }

  const intent = state.intent;
  compose.delete(fromId); // compose complete
  const token = crypto.randomBytes(8).toString('hex');
  const draft: Draft = { adminId: fromId, intent, ...state.content, replyMarkup, buttonCount, createdAt: Date.now() };
  drafts.set(token, draft);

  // Preview: send the content exactly as recipients will see it.
  const preview = await sendDraftTo(chatId, draft);
  if (!preview.ok) {
    drafts.delete(token);
    await sendBotMessage(
      chatId,
      `⚠️ Couldn't render that preview${preview.description ? ` (${preview.description})` : ''}. Check any HTML formatting / button URLs and start over.`
    );
    return;
  }

  const btnNote = buttonCount ? ` · ${buttonCount} button(s)` : ' · no buttons';
  if (intent === 'broadcast') {
    const count = recipientCount();
    await sendBotMessage(chatId, `👆 <b>Preview.</b> Send this to <b>${count}</b> user(s)?${btnNote}`, {
      replyMarkup: {
        inline_keyboard: [[
          { text: `✅ Send to ${count}`, callback_data: `bc:send:${token}` },
          { text: '✖ Cancel', callback_data: `bc:cancel:${token}` },
        ]],
      },
    });
  } else if (intent === 'schedule') {
    await sendBotMessage(chatId, `👆 <b>Preview.</b> When should I send this?${btnNote}\n🕒 Times are ${TZ_LABEL}.`, {
      replyMarkup: dateKeyboard(token),
    });
  } else {
    // welcome / post2 / post3 → save to the onboarding stage
    await sendBotMessage(chatId, `👆 <b>Preview.</b> Save as <b>${INTENT_LABEL[intent]}</b>?${btnNote}`, {
      replyMarkup: {
        inline_keyboard: [[
          { text: '✅ Save', callback_data: `onb:save:${token}` },
          { text: '✖ Cancel', callback_data: `bc:cancel:${token}` },
        ]],
      },
    });
  }
}

function extractContent(msg: TgMessage): Content | null {
  const caption = (msg.caption ?? '').trim();
  // Order matters: a GIF arrives as `animation` (and sometimes also `document`).
  if (msg.photo && msg.photo.length > 0)
    return { kind: 'photo', fileId: msg.photo[msg.photo.length - 1].file_id, text: caption };
  if (msg.animation) return { kind: 'animation', fileId: msg.animation.file_id, text: caption };
  if (msg.video) return { kind: 'video', fileId: msg.video.file_id, text: caption };
  if (msg.document) return { kind: 'document', fileId: msg.document.file_id, text: caption };
  if (msg.text && msg.text.trim()) return { kind: 'text', text: msg.text.trim() };
  return null;
}

/** Parse `Label | https://url` lines into buttons (one button per row). */
function parseButtons(text: string): DraftButton[] {
  const out: DraftButton[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const idx = t.indexOf('|');
    if (idx === -1) continue;
    const label = t.slice(0, idx).trim();
    let url = t.slice(idx + 1).trim();
    if (!label || !url) continue;
    if (/^t\.me\//i.test(url)) url = 'https://' + url; // be forgiving about t.me links
    if (!/^https?:\/\//i.test(url)) continue; // Telegram requires a valid http(s) URL
    out.push({ text: label, url });
  }
  return out;
}

// ---- Callback (button) handling ----

async function handleCallback(cq: TgCallbackQuery): Promise<void> {
  const data = cq.data ?? '';
  if (!cq.message) return;
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  const fromId = String(cq.from.id);

  if (!isAdmin(fromId)) {
    await answerCallbackQuery(cq.id, 'Not authorised.');
    return;
  }

  // ----- Broadcast now: bc:send / bc:cancel -----
  let m = /^bc:(send|cancel):([0-9a-f]+)$/.exec(data);
  if (m) {
    const [, action, token] = m;
    const draft = drafts.get(token);
    if (!draft) {
      await answerCallbackQuery(cq.id, 'This draft expired.');
      await editBotMessageText(chatId, messageId, '⌛ This draft expired — start over.');
      return;
    }
    if (action === 'cancel') {
      drafts.delete(token);
      await answerCallbackQuery(cq.id, 'Cancelled');
      await editBotMessageText(chatId, messageId, '✖ Cancelled.');
      return;
    }
    drafts.delete(token); // consume so a double-tap can't fire twice
    await answerCallbackQuery(cq.id, 'Sending…');
    await deliver(draft, chatId, messageId);
    return;
  }

  // ----- Save an onboarding post: onb:save:<token> -----
  m = /^onb:save:([0-9a-f]+)$/.exec(data);
  if (m) {
    const draft = drafts.get(m[1]);
    if (!draft) {
      await answerCallbackQuery(cq.id, 'Expired.');
      await editBotMessageText(chatId, messageId, '⌛ Expired — start over.');
      return;
    }
    drafts.delete(m[1]);
    const stage = draft.intent as Stage;
    addOnboardingPost(stage, draft);
    await answerCallbackQuery(cq.id, 'Saved');
    await editBotMessageText(
      chatId,
      messageId,
      `✅ Saved. <b>${INTENT_LABEL[stage]}</b> now has <b>${countOnboarding(stage)}</b> post(s).`
    );
    return;
  }

  // ----- Remove an onboarding post: onb:del:<stage>:<id> -----
  m = /^onb:del:(welcome|post2|post3):([0-9a-f]+)$/.exec(data);
  if (m) {
    removeOnboardingPost(m[1] as Stage, m[2]);
    await answerCallbackQuery(cq.id, 'Removed');
    await editBotMessageText(chatId, messageId, '🗑 Removed.');
    return;
  }

  // ----- Schedule: pick a date (sch:date:<token>:<0-3|type>) -----
  m = /^sch:date:([0-9a-f]+):(\d|type)$/.exec(data);
  if (m) {
    const token = m[1];
    const draft = drafts.get(token);
    if (!draft) {
      await answerCallbackQuery(cq.id, 'Expired.');
      await editBotMessageText(chatId, messageId, '⌛ Expired — start over with /schedule.');
      return;
    }
    if (m[2] === 'type') {
      compose.set(fromId, { phase: 'sched_datetime', intent: 'schedule', token, createdAt: Date.now() });
      await answerCallbackQuery(cq.id);
      await editBotMessageText(
        chatId,
        messageId,
        '⌨️ Send the date &amp; time as <code>YYYY-MM-DD HH:MM</code> (24h), e.g. <code>2026-06-25 18:30</code> — or <code>in 2h</code> / <code>in 30m</code>.'
      );
      return;
    }
    draft.date = istParts(Number(m[2]));
    await answerCallbackQuery(cq.id);
    await editBotMessageText(
      chatId,
      messageId,
      `🕒 Pick a time on ${draft.date.Y}-${pad2(draft.date.Mo)}-${pad2(draft.date.D)} (${TZ_LABEL}):`,
      timeKeyboard(token)
    );
    return;
  }

  // ----- Schedule: pick a time (sch:time:<token>:<HHMM|type>) -----
  m = /^sch:time:([0-9a-f]+):(\d{4}|type)$/.exec(data);
  if (m) {
    const token = m[1];
    const draft = drafts.get(token);
    if (!draft) {
      await answerCallbackQuery(cq.id, 'Expired.');
      await editBotMessageText(chatId, messageId, '⌛ Expired — start over with /schedule.');
      return;
    }
    if (!draft.date) {
      await answerCallbackQuery(cq.id, 'Pick a date first.');
      return;
    }
    if (m[2] === 'type') {
      compose.set(fromId, { phase: 'sched_time', intent: 'schedule', token, date: draft.date, createdAt: Date.now() });
      await answerCallbackQuery(cq.id);
      await editBotMessageText(chatId, messageId, '⌨️ Send the time as <code>HH:MM</code> (24h), e.g. <code>18:30</code>.');
      return;
    }
    await answerCallbackQuery(cq.id);
    await finalizeSchedule(chatId, token, toEpoch(draft.date, Number(m[2].slice(0, 2)), Number(m[2].slice(2))), messageId);
    return;
  }

  // ----- Schedule: cancel a pending job (sch:cancel:<id>) -----
  m = /^sch:cancel:([0-9a-f]+)$/.exec(data);
  if (m) {
    const ok = cancelScheduled(m[1]);
    await answerCallbackQuery(cq.id, ok ? 'Cancelled' : 'Already gone');
    if (ok) await editBotMessageText(chatId, messageId, '🗑 Scheduled post cancelled.');
    return;
  }

  await answerCallbackQuery(cq.id);
}

// ---- Delivery ----

function recipientList(): string[] {
  const rows = db.prepare('SELECT tg_id FROM users WHERE welcomed = 1').all() as { tg_id: string }[];
  return rows.map((r) => r.tg_id);
}
function recipientCount(): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users WHERE welcomed = 1').get() as { n: number };
  return row?.n ?? 0;
}

/** Send a draft to one chat. Used for both the preview and the bulk send. */
async function sendDraftTo(chatId: string | number, draft: Draft) {
  const body: Record<string, unknown> = { chat_id: chatId };
  if (draft.replyMarkup) body.reply_markup = draft.replyMarkup;

  if (draft.kind === 'text') {
    body.text = draft.text;
    body.parse_mode = 'HTML';
    body.disable_web_page_preview = true;
    return callBotApi('sendMessage', body);
  }
  const media = MEDIA[draft.kind];
  body[media.field] = draft.fileId;
  if (draft.text) {
    body.caption = draft.text;
    body.parse_mode = 'HTML';
  }
  return callBotApi(media.method, body);
}

type SendResult = 'ok' | 'blocked' | 'failed';

async function sendOne(chatId: string, draft: Draft): Promise<SendResult> {
  let res = await sendDraftTo(chatId, draft);
  if (!res.ok && res.status === 429 && res.retryAfter) {
    await sleep((res.retryAfter + 1) * 1000); // honour Telegram's back-off, then retry once
    res = await sendDraftTo(chatId, draft);
  }
  if (res.ok) return 'ok';
  // 403 = user blocked the bot / deactivated / chat not found → prune from the list.
  if (res.status === 403) return 'blocked';
  return 'failed';
}

async function deliver(draft: Draft, chatId: number, messageId: number): Promise<void> {
  const recipients = recipientList();
  await editBotMessageText(chatId, messageId, `📤 Sending to <b>${recipients.length}</b> user(s)…`);

  let sent = 0,
    failed = 0,
    blocked = 0;

  for (let i = 0; i < recipients.length; i++) {
    const result = await sendOne(recipients[i], draft);
    if (result === 'ok') sent++;
    else if (result === 'blocked') {
      blocked++;
      db.prepare('UPDATE users SET welcomed = 0 WHERE tg_id = ?').run(recipients[i]); // self-clean
    } else failed++;

    // Progress update every 50 sends (avoids hammering editMessageText).
    if ((i + 1) % 50 === 0) {
      await editBotMessageText(
        chatId,
        messageId,
        `📤 Sending… ${i + 1}/${recipients.length}\n✅ ${sent} · ⚠️ ${failed} · 🚫 ${blocked}`
      );
    }
    await sleep(SEND_DELAY_MS);
  }

  db.prepare(
    `INSERT INTO broadcasts (sent_by, kind, text, photo_file_id, recipients, sent, failed, blocked, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    draft.adminId,
    draft.kind,
    draft.text || null,
    draft.fileId ?? null,
    recipients.length,
    sent,
    failed,
    blocked,
    Date.now()
  );

  await editBotMessageText(
    chatId,
    messageId,
    `✅ <b>Broadcast complete.</b>\n\n📨 Delivered: <b>${sent}</b>\n⚠️ Failed: <b>${failed}</b>\n🚫 Blocked (removed): <b>${blocked}</b>\n👥 Total: <b>${recipients.length}</b>`
  );
}

// ===========================================================================
// Scheduling + onboarding drip (extends the broadcast tool above)
// ===========================================================================

interface DateParts {
  Y: number;
  Mo: number;
  D: number;
}
const pad2 = (n: number) => String(n).padStart(2, '0');

function istParts(daysAhead = 0): DateParts {
  const d = new Date(Date.now() + OFFSET_MIN * 60000 + daysAhead * 86400000);
  return { Y: d.getUTCFullYear(), Mo: d.getUTCMonth() + 1, D: d.getUTCDate() };
}
function toEpoch(p: DateParts, H: number, Mi: number): number {
  return Date.UTC(p.Y, p.Mo - 1, p.D, H, Mi) - OFFSET_MIN * 60000;
}
function parseWhen(text: string): number | null {
  const t = (text || '').trim().toLowerCase();
  let m = t.match(/^in\s+(\d+)\s*(m|min|mins|h|hr|hrs|d|day|days)$/);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2][0];
    const mult = unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
    return Date.now() + n * mult;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ t](\d{1,2}):(\d{2})$/);
  if (m) {
    const Y = +m[1], Mo = +m[2], D = +m[3], H = +m[4], Mi = +m[5];
    if (H > 23 || Mi > 59) return null;
    return toEpoch({ Y, Mo, D }, H, Mi);
  }
  return null;
}
function parseTimeOnly(text: string): { H: number; Mi: number } | null {
  const m = (text || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const H = +m[1], Mi = +m[2];
  if (H > 23 || Mi > 59) return null;
  return { H, Mi };
}
function fmtWhen(ms: number): string {
  const d = new Date(ms + OFFSET_MIN * 60000);
  return (
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ` +
    `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} ${TZ_LABEL}`
  );
}
function humanizeDelta(ms: number): string {
  let s = Math.max(0, Math.round((ms - Date.now()) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const mi = Math.floor(s / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (mi || (!d && !h)) parts.push(`${mi}m`);
  return 'in ' + parts.join(' ');
}

function dateKeyboard(token: string) {
  return {
    inline_keyboard: [
      [
        { text: 'Today', callback_data: `sch:date:${token}:0` },
        { text: 'Tomorrow', callback_data: `sch:date:${token}:1` },
      ],
      [
        { text: 'In 2 days', callback_data: `sch:date:${token}:2` },
        { text: 'In 3 days', callback_data: `sch:date:${token}:3` },
      ],
      [{ text: '⌨️ Type date & time', callback_data: `sch:date:${token}:type` }],
    ],
  };
}
function timeKeyboard(token: string) {
  const times = ['09:00', '12:00', '15:00', '18:00', '20:00', '21:00'];
  const btn = (t: string) => ({ text: t, callback_data: `sch:time:${token}:${t.replace(':', '')}` });
  return {
    inline_keyboard: [
      times.slice(0, 3).map(btn),
      times.slice(3).map(btn),
      [{ text: '⌨️ Type time', callback_data: `sch:time:${token}:type` }],
    ],
  };
}

// ---- Stored-post DB access ----
interface OnbRow { stage: string; id: string; kind: string; text: string | null; file_id: string | null; reply_markup: string | null; pos: number }
interface SchedRow { id: string; kind: string; text: string | null; file_id: string | null; reply_markup: string | null; run_at: number; created_by: string | null; notify_chat_id: string | null; status: string; sent: number | null; failed: number | null; blocked: number | null; created_at: number }

/** Build a sendable Draft from stored content fields. */
function draftFromStored(kind: string, text: string | null, fileId: string | null, rmJson: string | null): Draft {
  return {
    adminId: '',
    intent: 'broadcast',
    kind: kind as Content['kind'],
    text: text ?? '',
    fileId: fileId ?? undefined,
    replyMarkup: rmJson ? JSON.parse(rmJson) : undefined,
    buttonCount: 0,
    createdAt: 0,
  };
}

function addOnboardingPost(stage: Stage, draft: Draft): void {
  const max = (db.prepare('SELECT MAX(pos) AS m FROM onboarding_posts WHERE stage = ?').get(stage) as { m: number | null } | undefined)?.m ?? -1;
  db.prepare(
    'INSERT INTO onboarding_posts (stage, id, kind, text, file_id, reply_markup, pos) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    stage,
    crypto.randomBytes(4).toString('hex'),
    draft.kind,
    draft.text || null,
    draft.fileId ?? null,
    draft.replyMarkup ? JSON.stringify(draft.replyMarkup) : null,
    max + 1
  );
}
function onboardingRows(stage: Stage): OnbRow[] {
  return db.prepare('SELECT * FROM onboarding_posts WHERE stage = ? ORDER BY pos ASC').all(stage) as unknown as OnbRow[];
}
function countOnboarding(stage: Stage): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM onboarding_posts WHERE stage = ?').get(stage) as { n: number }).n;
}
function removeOnboardingPost(stage: Stage, id: string): void {
  db.prepare('DELETE FROM onboarding_posts WHERE stage = ? AND id = ?').run(stage, id);
}
function clearStage(stage: Stage): void {
  db.prepare('DELETE FROM onboarding_posts WHERE stage = ?').run(stage);
}

function addScheduled(draft: Draft, runAt: number, adminId: string): void {
  db.prepare(
    `INSERT INTO scheduled_posts (id, kind, text, file_id, reply_markup, run_at, created_by, notify_chat_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).run(
    crypto.randomBytes(6).toString('hex'),
    draft.kind,
    draft.text || null,
    draft.fileId ?? null,
    draft.replyMarkup ? JSON.stringify(draft.replyMarkup) : null,
    runAt,
    adminId,
    adminId,
    Date.now()
  );
}
function pendingScheduledRows(): SchedRow[] {
  return db.prepare("SELECT * FROM scheduled_posts WHERE status = 'pending' ORDER BY run_at ASC").all() as unknown as SchedRow[];
}
function cancelScheduled(id: string): boolean {
  const r = db.prepare("UPDATE scheduled_posts SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(id) as unknown as { changes: number };
  return r.changes > 0;
}

// ---- Finalising a schedule ----
async function finalizeSchedule(chatId: number, token: string, runAt: number, messageId?: number): Promise<void> {
  const draft = drafts.get(token);
  const say = async (t: string) => {
    if (messageId) await editBotMessageText(chatId, messageId, t);
    else await sendBotMessage(chatId, t);
  };
  if (!draft) { await say('⌛ This draft expired — start over with /schedule.'); return; }
  if (!Number.isFinite(runAt)) { await say('⚠️ Couldn’t read that time. Try <code>2026-06-25 18:30</code> or <code>in 2h</code>.'); return; }
  if (runAt <= Date.now()) { await say('⚠️ That time is in the past. Pick a future time.'); return; }
  addScheduled(draft, runAt, String(chatId));
  drafts.delete(token);
  await say(`✅ <b>Scheduled</b> for ${fmtWhen(runAt)} (${humanizeDelta(runAt)}).\nWill go to ~${recipientCount()} user(s). Manage with /scheduled.`);
}

async function handleTypedSchedule(fromId: string, chatId: number, text: string, state: Compose): Promise<void> {
  const token = state.token ?? '';
  if (state.phase === 'sched_datetime') {
    const runAt = parseWhen(text);
    if (runAt == null) {
      await sendBotMessage(chatId, '⚠️ Use <code>YYYY-MM-DD HH:MM</code> (e.g. <code>2026-06-25 18:30</code>) or <code>in 2h</code> / <code>in 30m</code>.');
      return;
    }
    compose.delete(fromId);
    await finalizeSchedule(chatId, token, runAt);
    return;
  }
  // sched_time
  const t = parseTimeOnly(text);
  if (!t || !state.date) {
    await sendBotMessage(chatId, '⚠️ Use <code>HH:MM</code> (24h), e.g. <code>18:30</code>.');
    return;
  }
  compose.delete(fromId);
  await finalizeSchedule(chatId, token, toEpoch(state.date, t.H, t.Mi));
}

// ---- Listing / management ----
async function listScheduled(chatId: number): Promise<void> {
  const rows = pendingScheduledRows();
  if (!rows.length) { await sendBotMessage(chatId, '📭 No scheduled posts. Create one: /schedule &lt;passphrase&gt;.'); return; }
  await sendBotMessage(chatId, `🗓 <b>${rows.length}</b> scheduled post(s):`);
  for (const r of rows) {
    await sendDraftTo(chatId, draftFromStored(r.kind, r.text, r.file_id, r.reply_markup));
    await sendBotMessage(chatId, `🕒 ${fmtWhen(r.run_at)} (${humanizeDelta(r.run_at)}) • ~${recipientCount()} users`, {
      replyMarkup: { inline_keyboard: [[{ text: '🗑 Cancel', callback_data: `sch:cancel:${r.id}` }]] },
    });
  }
}
async function listOnboarding(chatId: number): Promise<void> {
  const stages: [Stage, string][] = [
    ['welcome', 'Welcome (instant DM)'],
    ['post2', 'Post 2 (15s after welcome)'],
    ['post3', 'Post 3 (2 min after welcome)'],
  ];
  for (const [stage, label] of stages) {
    const rows = onboardingRows(stage);
    await sendBotMessage(chatId, `— <b>${label}</b>: ${rows.length} post(s) —`);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      await sendDraftTo(chatId, draftFromStored(r.kind, r.text, r.file_id, r.reply_markup));
      await sendBotMessage(chatId, `#${i + 1}`, {
        replyMarkup: { inline_keyboard: [[{ text: '🗑 Remove this post', callback_data: `onb:del:${stage}:${r.id}` }]] },
      });
    }
  }
  await sendBotMessage(
    chatId,
    '➕ Add: send a post, then /setwelcome, /setpost2 or /setpost3.\n🧹 Reset a stage: /clearwelcome, /clearpost2, /clearpost3.\n👀 Preview the sequence on yourself: /testdrip.'
  );
}
async function runTestDrip(chatId: number): Promise<void> {
  let any = false;
  for (const stage of ['welcome', 'post2', 'post3'] as Stage[]) {
    const rows = onboardingRows(stage);
    for (const r of rows) {
      any = true;
      await sendDraftTo(chatId, draftFromStored(r.kind, r.text, r.file_id, r.reply_markup));
      await sleep(600);
    }
  }
  await sendBotMessage(chatId, any ? '✅ That’s the full drip (welcome → post2 → post3).' : '(nothing configured yet — set posts with /setwelcome, /setpost2, /setpost3)');
}

// ---- Sending stored posts to a real user (welcome + drip) ----
async function sendStageTo(tgId: string, stage: Stage): Promise<boolean> {
  let sentAny = false;
  for (const r of onboardingRows(stage)) {
    const res = await sendOne(tgId, draftFromStored(r.kind, r.text, r.file_id, r.reply_markup));
    if (res === 'ok') sentAny = true;
    else if (res === 'blocked') { db.prepare('UPDATE users SET welcomed = 0 WHERE tg_id = ?').run(tgId); return sentAny; }
    await sleep(SEND_DELAY_MS);
  }
  return sentAny;
}

/** Does an admin-configured welcome exist? (If so it replaces the static WELCOME_MESSAGE.) */
export function hasConfiguredWelcome(): boolean {
  return countOnboarding('welcome') > 0;
}
/** Send the admin-configured welcome post(s) to a user. Returns true if any sent. */
export async function sendConfiguredWelcome(tgId: string): Promise<boolean> {
  return sendStageTo(tgId, 'welcome');
}

/** Fire the post2 (15s) and post3 (2min) follow-ups, skipping users who already verified. */
export function scheduleDripFor(tgId: string): void {
  const plan: [Stage, number][] = [['post2', 15000], ['post3', 120000]];
  for (const [stage, delay] of plan) {
    if (countOnboarding(stage) === 0) continue;
    const t = setTimeout(() => {
      const u = db.prepare('SELECT status FROM users WHERE tg_id = ?').get(tgId) as { status: string } | undefined;
      if (u?.status === 'verified') return; // already converted — don't nudge
      void sendStageTo(tgId, stage);
    }, delay);
    if (typeof t.unref === 'function') t.unref();
  }
}

// ---- Scheduler: fire due posts (also catches up after a redeploy) ----
async function runScheduledJob(row: SchedRow): Promise<void> {
  const draft = draftFromStored(row.kind, row.text, row.file_id, row.reply_markup);
  const recipients = recipientList();
  let sent = 0, failed = 0, blocked = 0;
  for (const id of recipients) {
    const res = await sendOne(id, draft);
    if (res === 'ok') sent++;
    else if (res === 'blocked') { blocked++; db.prepare('UPDATE users SET welcomed = 0 WHERE tg_id = ?').run(id); }
    else failed++;
    await sleep(SEND_DELAY_MS);
  }
  db.prepare("UPDATE scheduled_posts SET status = 'done', sent = ?, failed = ?, blocked = ? WHERE id = ?").run(sent, failed, blocked, row.id);
  db.prepare(
    `INSERT INTO broadcasts (sent_by, kind, text, photo_file_id, recipients, sent, failed, blocked, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(row.created_by ?? 'scheduler', row.kind, row.text || null, row.file_id ?? null, recipients.length, sent, failed, blocked, Date.now());
  if (row.notify_chat_id) {
    await sendBotMessage(row.notify_chat_id, `✅ <b>Scheduled post sent.</b>\n📨 ${sent} · ⚠️ ${failed} · 🚫 ${blocked} (of ${recipients.length}).`);
  }
}

let schedulerBusy = false;
export function startScheduler(): void {
  setInterval(async () => {
    if (schedulerBusy) return;
    schedulerBusy = true;
    try {
      const now = Date.now();
      for (const row of pendingScheduledRows()) {
        if (row.run_at > now) continue;
        db.prepare("UPDATE scheduled_posts SET status = 'sending' WHERE id = ?").run(row.id);
        try {
          await runScheduledJob(row);
        } catch (e) {
          db.prepare("UPDATE scheduled_posts SET status = 'error' WHERE id = ?").run(row.id);
          console.warn('[broadcast] scheduled job failed:', e instanceof Error ? e.message : e);
        }
      }
    } finally {
      schedulerBusy = false;
    }
  }, 30000);
}

// Start the scheduler once on import (only meaningful when the bot is configured).
if (BOT_CONFIGURED) startScheduler();
