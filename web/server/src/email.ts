// Sends the email login code. Uses Resend (https://resend.com) when
// RESEND_API_KEY is set; otherwise (local dev) it just prints the code to the
// server console so you can log in without any email account configured.

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'TRADES AI <login@pocketaitrades.com>';
const APP_NAME = process.env.APP_NAME ?? 'TRADES AI';

export const EMAIL_CONFIGURED = !!RESEND_API_KEY;

function codeEmailHtml(code: string): string {
  return `
  <div style="font-family:Inter,Arial,sans-serif;background:#060A13;padding:32px;color:#e2e8f0">
    <div style="max-width:440px;margin:0 auto;background:#0B1426;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:28px;text-align:center">
      <div style="width:60px;height:60px;margin:4px auto 14px;border-radius:16px;background:#3B82F6;background:linear-gradient(135deg,#3B82F6,#00E5FF);text-align:center;font-size:30px;line-height:60px">📈</div>
      <div style="font-weight:800;font-size:22px;color:#fff;letter-spacing:.5px">TRADES <span style="color:#00E5FF">AI</span></div>
      <div style="margin-top:4px;color:#7c8aa0;font-size:12px;letter-spacing:1px;text-transform:uppercase">AI Trading Signals</div>
      <div style="margin-top:18px;color:#94a3b8;font-size:14px">Your login code</div>
      <div style="margin:20px auto;font-size:40px;font-weight:900;letter-spacing:10px;color:#00E5FF">${code}</div>
      <div style="color:#94a3b8;font-size:13px">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</div>
      <div style="color:#64748b;font-size:11px;margin-top:14px">This is an automated message — please don't reply.</div>
    </div>
  </div>`;
}

export async function sendLoginCode(email: string, code: string): Promise<void> {
  if (!EMAIL_CONFIGURED) {
    console.log(
      `\n[auth] Login code for ${email}: ${code}  (set RESEND_API_KEY to email it)\n`
    );
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [email],
        subject: `Your ${APP_NAME} login code: ${code}`,
        html: codeEmailHtml(code),
        text: `Your ${APP_NAME} login code is ${code}. It expires in 10 minutes.`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error('[email] Resend responded', res.status, (await res.text()).slice(0, 300));
    }
  } catch (e) {
    console.error('[email] send failed:', e instanceof Error ? e.message : e);
  }
}
