import { useState } from 'react';
import { useApp } from '../state/AppContext';
import { api } from '../api';
import { getRefCode } from '../telegram';

// Email + 6-digit code login (the website's replacement for Telegram auth).
export default function LoginScreen() {
  const { login } = useApp();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  async function sendCode() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.requestCode(email.trim());
      setDevCode(res.devCode ?? null);
      setStep('code');
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

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-7">
        {/* Brand */}
        <div className="text-center">
          <div className="text-2xl font-black tracking-wide text-white">
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
              if (!busy && code.trim()) verify();
            }}
          >
            <p className="text-center text-sm text-slate-300">
              Enter the code we sent to <span className="font-semibold text-white">{email}</span>
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
            <div className="flex items-center justify-between text-xs text-muted">
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                  setDevCode(null);
                }}
                className="hover:text-slate-200"
              >
                ← Change email
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={sendCode}
                className="hover:text-slate-200 disabled:opacity-50"
              >
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
