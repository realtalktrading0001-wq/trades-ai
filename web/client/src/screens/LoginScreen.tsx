import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext';
import { api } from '../api';
import { getRefCode, openExternal } from '../telegram';
import { SupportIcon, SunIcon, MoonIcon } from '../components/Icons';

const RESEND_SECONDS = 30;

// Email + 6-digit code login (the website's replacement for Telegram auth).
export default function LoginScreen() {
  const { login, config, theme, toggleTheme } = useApp();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const supportHandle = config?.supportHandle || 'Tradesaisupport';

  // Countdown that re-enables the "Resend code" button.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  async function sendCode() {
    if (busy || resendIn > 0) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.requestCode(email.trim());
      setDevCode(res.devCode ?? null);
      setStep('code');
      setResendIn(RESEND_SECONDS);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.verifyCode(email.trim(), code.trim(), getRefCode() || undefined);
      login(res.token, res.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not verify the code');
    } finally {
      setBusy(false);
    }
  }

  function backToEmail() {
    setStep('email');
    setCode('');
    setError(null);
    setDevCode(null);
    setResendIn(0);
  }

  return (
    <div
      className="relative flex items-center justify-center px-4 py-6"
      style={{ minHeight: '100dvh' }}
    >
      {/* Theme toggle (same as the Signals tab) */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border transition hover:opacity-80"
        style={{ color: 'var(--app-strong)', borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        {theme === 'dark' ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
      </button>

      <div className="card w-full max-w-sm p-7">
        {/* Brand */}
        <div className="text-center">
          <div className="text-2xl font-black tracking-wide" style={{ color: 'var(--app-strong)' }}>
            TRADES <span className="text-cyan">AI</span>
          </div>
          <p className="mt-1 text-sm text-muted">AI trading signals</p>
        </div>

        {step === 'email' ? (
          <form
            className="mt-7 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && email.trim()) sendCode();
            }}
          >
            <div>
              <label className="label-muted mb-2 block">Email</label>
              <input
                type="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input-dark"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" disabled={busy || !email.trim()} className="btn-cyan w-full py-3">
              {busy ? 'Sending…' : 'Send login code'}
            </button>
            <p className="text-center text-xs text-muted">
              We'll email you a 6-digit code. No password needed.
            </p>
          </form>
        ) : (
          <form
            className="mt-7 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && code.trim().length === 6) verify();
            }}
          >
            <p className="text-center text-sm" style={{ color: 'var(--app-soft)' }}>
              Enter the code we sent to
              <br />
              <span className="font-semibold" style={{ color: 'var(--app-strong)' }}>{email}</span>
            </p>
            {devCode && (
              <div className="rounded-xl bg-amber/10 border border-amber/30 px-4 py-3 text-center text-sm text-amber">
                Dev mode — your code is{' '}
                <span className="font-mono font-bold tracking-widest">{devCode}</span>
              </div>
            )}
            <input
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="input-dark text-center text-2xl font-bold tracking-[0.5em]"
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" disabled={busy || code.length < 6} className="btn-cyan w-full py-3">
              {busy ? 'Verifying…' : 'Verify & continue'}
            </button>

            {/* Spam-folder hint */}
            <div
              className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-xs leading-relaxed"
              style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)', color: 'var(--app-muted)' }}
            >
              <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 shrink-0" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
              <span>
                Don't see it? Check your{' '}
                <span className="font-semibold" style={{ color: 'var(--app-soft)' }}>Spam</span> or{' '}
                <span className="font-semibold" style={{ color: 'var(--app-soft)' }}>Promotions</span> folder —
                it's from <span className="font-semibold" style={{ color: 'var(--app-soft)' }}>login@pocketaitrades.com</span>.
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <button type="button" onClick={backToEmail} className="text-muted hover:opacity-80">
                ← Change email
              </button>
              <button
                type="button"
                disabled={busy || resendIn > 0}
                onClick={sendCode}
                className="font-semibold text-electric disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        {/* Contact support */}
        <div className="mt-5 border-t pt-4 text-center" style={{ borderColor: 'var(--card-border)' }}>
          <button
            type="button"
            onClick={() => openExternal(`https://t.me/${supportHandle}`)}
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:opacity-80"
          >
            <SupportIcon className="h-3.5 w-3.5" />
            Trouble signing in? <span className="font-semibold text-electric">Contact support</span>
          </button>
        </div>
      </div>
    </div>
  );
}
