// Admin broadcast tool, operated entirely from inside Telegram.
//
// Flow (a stateful "compose" conversation over the bot webhook):
//   1. Admin DMs:  /broadcast <passphrase>
//      → authorised only if from.id ∈ ADMIN_CHAT_IDS AND passphrase === BROADCAST_PASSPHRASE
//      → bot asks for the content and remembers the admin is "awaiting content".
//   2. Admin sends text, or a photo with a caption → bot echoes a live preview + recipient
//      count + [✅ Send] / [✖ Cancel] inline buttons (a short draft token rides on the buttons).
//   3. Tap ✅ → bot blasts every welcomed=1 user (throttled), then reports sent/failed/blocked.
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
  sendBotPhoto,
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

// ---- In-memory conversation state (single Render instance; fine to lose on redeploy) ----

/** Admin ids that sent a valid /broadcast and are now expected to send content. */
const awaitingContent = new Set<string>();

interface Draft {
  adminId: string;
  kind: 'text' | 'photo';
  text: string; // message text, or photo caption ('' if none)
  photoFileId?: string;
  createdAt: number;
}
const drafts = new Map<string, Draft>();
const DRAFT_TTL_MS = 60 * 60 * 1000;

function pruneDrafts() {
  const now = Date.now();
  for (const [token, d] of drafts) if (now - d.createdAt > DRAFT_TTL_MS) drafts.delete(token);
}

// ---- Minimal Telegram update shapes (only the fields we read) ----

interface TgUser {
  id: number;
}
interface TgChat {
  id: number;
  type?: string;
}
interface TgPhotoSize {
  file_id: string;
}
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  caption?: string;
  photo?: TgPhotoSize[];
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

  // /cancel — abort an in-progress compose.
  if (text === '/cancel' || text.startsWith('/cancel ')) {
    awaitingContent.delete(fromId);
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
    awaitingContent.add(fromId);
    await sendBotMessage(
      chatId,
      '✅ <b>Authorised.</b>\n\nNow send the message you want to broadcast — plain text, or a photo with a caption.\n\nSend /cancel to abort.'
    );
    return;
  }

  // Any other private message: if this admin is mid-compose, it's the broadcast content.
  if (!awaitingContent.has(fromId)) return; // stay silent to everyone else

  const draft = buildDraft(fromId, msg);
  if (!draft) {
    await sendBotMessage(
      chatId,
      '⚠️ Unsupported message. Send plain text or a single photo (with optional caption). /cancel to abort.'
    );
    return; // keep them in compose mode to retry
  }

  awaitingContent.delete(fromId); // content captured
  pruneDrafts();
  const token = crypto.randomBytes(8).toString('hex');
  drafts.set(token, draft);

  // Show the preview exactly as recipients will see it (with the Open App button).
  const previewOk = draft.photoFileId
    ? await sendBotPhoto(chatId, draft.photoFileId, draft.text || undefined, { openAppButton: true })
    : await sendBotMessage(chatId, draft.text, { openAppButton: true });
  if (!previewOk) {
    drafts.delete(token);
    await sendBotMessage(
      chatId,
      "⚠️ Couldn't render that as a preview (check any HTML formatting). Start over with /broadcast."
    );
    return;
  }

  const count = recipientCount();
  await sendBotMessage(chatId, `👆 <b>Preview.</b> Send this to <b>${count}</b> user(s)?`, {
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

function buildDraft(adminId: string, msg: TgMessage): Draft | null {
  if (msg.photo && msg.photo.length > 0) {
    const fileId = msg.photo[msg.photo.length - 1].file_id; // largest size
    return { adminId, kind: 'photo', photoFileId: fileId, text: (msg.caption ?? '').trim(), createdAt: Date.now() };
  }
  if (msg.text && msg.text.trim()) {
    return { adminId, kind: 'text', text: msg.text.trim(), createdAt: Date.now() };
  }
  return null;
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

type SendResult = 'ok' | 'blocked' | 'failed';

async function sendOne(chatId: string, draft: Draft): Promise<SendResult> {
  const body: Record<string, unknown> = draft.photoFileId
    ? { chat_id: chatId, photo: draft.photoFileId, reply_markup: openAppKeyboard() }
    : { chat_id: chatId, text: draft.text, disable_web_page_preview: true, reply_markup: openAppKeyboard() };
  if (draft.photoFileId && draft.text) {
    body.caption = draft.text;
    body.parse_mode = 'HTML';
  } else if (!draft.photoFileId) {
    body.parse_mode = 'HTML';
  }
  const method = draft.photoFileId ? 'sendPhoto' : 'sendMessage';

  let res = await callBotApi(method, body);
  if (!res.ok && res.status === 429 && res.retryAfter) {
    await sleep((res.retryAfter + 1) * 1000); // honour Telegram's back-off, then retry once
    res = await callBotApi(method, body);
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
    draft.photoFileId ?? null,
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