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
/** Admins past auth: 'content' = awaiting the message, 'buttons' = awaiting button lines. */
interface Compose {
  phase: 'content' | 'buttons';
  content?: Content;
  createdAt: number;
}
const compose = new Map<string, Compose>();

interface Draft extends Content {
  adminId: string;
  replyMarkup?: unknown; // computed inline keyboard (buttons / default / none)
  buttonCount: number;
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

  // /broadcast <passphrase> — start a broadcast.
  if (text === '/broadcast' || text.startsWith('/broadcast ')) {
    const passphrase = text.slice('/broadcast'.length).trim();
    if (!isAdmin(fromId)) {
      // Not an admin: tell them their own id (harmless) so a real admin can bootstrap
      // ADMIN_CHAT_IDS, but don't reveal anything about the passphrase.
      await sendBotMessage(
        chatId,
        `🚫 You're not authorised to broadcast.\n\nYour Telegram ID is <code>${fromId}</code>.`
      );
      return;
    }
    if (!BROADCAST_PASSPHRASE || passphrase !== BROADCAST_PASSPHRASE) {
      await sendBotMessage(
        chatId,
        '🔒 Wrong (or missing) passphrase. Usage:\n<code>/broadcast &lt;passphrase&gt;</code>'
      );
      return;
    }
    prune();
    compose.set(fromId, { phase: 'content', createdAt: Date.now() });
    await sendBotMessage(
      chatId,
      '✅ <b>Authorised.</b>\n\nNow send the message to broadcast — plain <b>text</b>, or a <b>photo / video / GIF / document</b> (with an optional caption).\n\nSend /cancel anytime to abort.'
    );
    return;
  }

  const state = compose.get(fromId);
  if (!state) return; // not mid-compose → stay silent to everyone else

  if (state.phase === 'content') {
    await handleContent(fromId, chatId, msg);
  } else {
    await handleButtons(fromId, chatId, text);
  }
}

/** Step 2 → 3: capture the content, then ask about buttons. */
async function handleContent(fromId: string, chatId: number, msg: TgMessage): Promise<void> {
  const content = extractContent(msg);
  if (!content) {
    await sendBotMessage(
      chatId,
      '⚠️ Unsupported message. Send plain text, or a single photo / video / GIF / document (caption optional). /cancel to abort.'
    );
    return; // stay in 'content' phase to retry
  }
  compose.set(fromId, { phase: 'buttons', content, createdAt: Date.now() });
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

  compose.delete(fromId); // compose complete
  const token = crypto.randomBytes(8).toString('hex');
  const draft: Draft = { adminId: fromId, ...state.content, replyMarkup, buttonCount, createdAt: Date.now() };
  drafts.set(token, draft);

  // Preview: send the content exactly as recipients will see it.
  const preview = await sendDraftTo(chatId, draft);
  if (!preview.ok) {
    drafts.delete(token);
    await sendBotMessage(
      chatId,
      `⚠️ Couldn't render that preview${preview.description ? ` (${preview.description})` : ''}. Check any HTML formatting / button URLs and start over with /broadcast.`
    );
    return;
  }

  const count = recipientCount();
  const btnNote = buttonCount ? ` · ${buttonCount} button(s)` : ' · no buttons';
  await sendBotMessage(chatId, `👆 <b>Preview.</b> Send this to <b>${count}</b> user(s)?${btnNote}`, {
    replyMarkup: {
      inline_keyboard: [
        [
          { text: `✅ Send to ${count}`, callback_data: `bc:send:${token}` },
          { text: '✖ Cancel', callback_data: `bc:cancel:${token}` },
        ],
      ],
    },
  });
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
  const m = /^bc:(send|cancel):([0-9a-f]+)$/.exec(data);
  if (!cq.message) return;
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;

  if (!isAdmin(cq.from.id)) {
    await answerCallbackQuery(cq.id, 'Not authorised.');
    return;
  }
  if (!m) {
    await answerCallbackQuery(cq.id);
    return;
  }

  const [, action, token] = m;
  const draft = drafts.get(token);
  if (!draft) {
    await answerCallbackQuery(cq.id, 'This draft expired.');
    await editBotMessageText(chatId, messageId, '⌛ This draft expired — start over with /broadcast.');
    return;
  }

  if (action === 'cancel') {
    drafts.delete(token);
    await answerCallbackQuery(cq.id, 'Cancelled');
    await editBotMessageText(chatId, messageId, '✖ Broadcast cancelled.');
    return;
  }

  // action === 'send'
  drafts.delete(token); // consume so a double-tap can't fire twice
  await answerCallbackQuery(cq.id, 'Sending…');
  await deliver(draft, chatId, messageId);
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
