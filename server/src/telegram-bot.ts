// Minimal Telegram Bot API sender. Used to DM users who have allowed the bot to
// message them (via the Mini App's requestWriteAccess) — the one-time welcome and,
// later, broadcasts. No-ops if BOT_TOKEN is unset (local dev).
const BOT_TOKEN = process.env.BOT_TOKEN ?? '';
const BOT_USERNAME = process.env.BOT_USERNAME ?? 'tradesaipocketbot';

export const BOT_CONFIGURED = !!BOT_TOKEN;

interface SendOpts {
  /** Append an inline button that re-opens the Mini App. */
  openAppButton?: boolean;
}

/**
 * Send a message to a user's private chat. Returns true on success.
 * Telegram only delivers this if the user started the bot OR granted write access.
 */
export async function sendBotMessage(
  chatId: string | number,
  text: string,
  opts: SendOpts = {}
): Promise<boolean> {
  if (!BOT_CONFIGURED) return false;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (opts.openAppButton) {
    // `url` to the startapp deep link is universally supported (no web-app domain
    // setup needed) and re-opens the Mini App.
    body.reply_markup = {
      inline_keyboard: [
        [{ text: '🚀 Open TRADES AI', url: `https://t.me/${BOT_USERNAME}?startapp=open` }],
      ],
    };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!data.ok) console.warn('[bot] sendMessage failed:', data.description ?? `status_${res.status}`);
    return !!data.ok;
  } catch (e) {
    console.warn('[bot] sendMessage error:', e instanceof Error ? e.message : e);
    return false;
  }
}
