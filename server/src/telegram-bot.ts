// Minimal Telegram Bot API client. Used to DM users who have allowed the bot to
// message them (via the Mini App's requestWriteAccess) — the one-time welcome and
// admin broadcasts — and to receive admin commands via webhook. No-ops if BOT_TOKEN
// is unset (local dev).
export const BOT_TOKEN = process.env.BOT_TOKEN ?? '';
export const BOT_USERNAME = process.env.BOT_USERNAME ?? 'tradesaipocketbot';

export const BOT_CONFIGURED = !!BOT_TOKEN;

/** Result of a raw Bot API call — status + parsed body, so callers can branch on 403/429. */
export interface BotApiResult {
  ok: boolean;
  status: number;
  description?: string;
  /** Telegram's `parameters.retry_after` (seconds) on 429s. */
  retryAfter?: number;
  result?: unknown;
}

/** Low-level Bot API call. Never throws — network/parse errors come back as ok:false. */
export async function callBotApi(
  method: string,
  body: Record<string, unknown>,
  timeoutMs = 10000
): Promise<BotApiResult> {
  if (!BOT_CONFIGURED) return { ok: false, status: 0, description: 'bot_not_configured' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: unknown;
      parameters?: { retry_after?: number };
    };
    if (!data.ok) {
      console.warn(`[bot] ${method} failed:`, data.description ?? `status_${res.status}`);
    }
    return {
      ok: !!data.ok,
      status: res.status,
      description: data.description,
      retryAfter: data.parameters?.retry_after,
      result: data.result,
    };
  } catch (e) {
    console.warn(`[bot] ${method} error:`, e instanceof Error ? e.message : e);
    return { ok: false, status: 0, description: e instanceof Error ? e.message : 'network_error' };
  }
}

/** An inline keyboard that re-opens the Mini App via the universal startapp deep link. */
export function openAppKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🚀 Open TRADES AI', url: `https://t.me/${BOT_USERNAME}?startapp=open` }],
    ],
  };
}

interface SendOpts {
  /** Append an inline button that re-opens the Mini App. */
  openAppButton?: boolean;
  /** Override the reply_markup entirely (e.g. confirm/cancel buttons). */
  replyMarkup?: unknown;
}

/**
 * Send a text message to a chat. Returns true on success.
 * Telegram only delivers this if the user started the bot OR granted write access.
 */
export async function sendBotMessage(
  chatId: string | number,
  text: string,
  opts: SendOpts = {}
): Promise<boolean> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (opts.replyMarkup) body.reply_markup = opts.replyMarkup;
  else if (opts.openAppButton) body.reply_markup = openAppKeyboard();
  return (await callBotApi('sendMessage', body)).ok;
}

/** Send a photo (by file_id or URL) with an optional HTML caption. Returns true on success. */
export async function sendBotPhoto(
  chatId: string | number,
  photo: string,
  caption?: string,
  opts: SendOpts = {}
): Promise<boolean> {
  const body: Record<string, unknown> = { chat_id: chatId, photo };
  if (caption) {
    body.caption = caption;
    body.parse_mode = 'HTML';
  }
  if (opts.replyMarkup) body.reply_markup = opts.replyMarkup;
  else if (opts.openAppButton) body.reply_markup = openAppKeyboard();
  return (await callBotApi('sendPhoto', body)).ok;
}

/** Edit a message's text in place (used to update the broadcast status line). */
export async function editBotMessageText(
  chatId: string | number,
  messageId: number,
  text: string,
  replyMarkup?: unknown
): Promise<boolean> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (replyMarkup !== undefined) body.reply_markup = replyMarkup;
  return (await callBotApi('editMessageText', body)).ok;
}

/** Acknowledge a callback_query so Telegram stops showing the button spinner. */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  const body: Record<string, unknown> = { callback_query_id: callbackQueryId };
  if (text) body.text = text;
  await callBotApi('answerCallbackQuery', body, 5000);
}

/** Register (or update) the webhook with Telegram. secretToken is echoed back in a header. */
export async function setBotWebhook(url: string, secretToken: string): Promise<boolean> {
  const res = await callBotApi('setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
  return res.ok;
}
