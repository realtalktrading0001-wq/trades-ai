import { useEffect, useState } from 'react';
import type { Signal } from '../api';
import { ArrowUpIcon, ArrowDownIcon, WarningIcon, CheckIcon, CloseIcon } from './Icons';

interface Props {
  signal: Signal;
  onTake: () => void;
  onSkip: () => void;
}

function parseExpirySeconds(exp: string): number {
  const m = exp.match(/(\d+)\s*(sec|min)/i);
  if (!m) return 60;
  const n = parseInt(m[1], 10);
  return m[2].toLowerCase() === 'min' ? n * 60 : n;
}

function hhmm(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function strengthColor(s: number): string {
  if (s < 40) return '#EF4444'; // weak
  if (s < 70) return '#F59E0B'; // moderate
  return '#22C55E'; // strong
}

function recommendation(s: number): { text: string; tone: 'warn' | 'ok' } {
  if (s < 40)
    return { text: 'Consider skipping or switching pairs. Weak trend reduces signal accuracy.', tone: 'warn' };
  if (s < 70)
    return { text: 'Moderate trend. Manage your risk and confirm the entry before trading.', tone: 'warn' };
  return { text: 'Strong trend detected — favorable entry conditions for this expiry.', tone: 'ok' };
}

function Box({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[12px] border px-3.5 py-1.5 ${className}`}
      style={{ background: 'var(--pill-bg)', borderColor: 'var(--card-border)' }}
    >
      {children}
    </div>
  );
}

export default function SignalCard({ signal, onTake, onSkip }: Props) {
  const expirySecs = parseExpirySeconds(signal.expiration);
  const expiresAt = signal.createdAt + expirySecs * 1000;
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const remainingMs = Math.max(0, expiresAt - now);
  const remainingS = Math.ceil(remainingMs / 1000);
  const expired = remainingMs <= 0;

  const up = signal.direction === 'UP';
  const dirColor = up ? '#22C55E' : '#EF4444';
  const rec = recommendation(signal.trendStrength);
  const base = signal.pair.slice(0, 2);
  const biasColor =
    signal.trendBias === 'Bullish' ? '#22C55E' : signal.trendBias === 'Bearish' ? '#EF4444' : 'var(--app-muted)';

  return (
    <div className="card animate-fade-in p-3 space-y-1.5">
      <h2 className="text-[15px] font-extrabold leading-none" style={{ color: 'var(--app-strong)' }}>
        Signal
      </h2>

      {/* Currency pair */}
      <Box className="flex items-center gap-2.5">
        <span className="flex h-5 w-7 items-center justify-center rounded-[5px] bg-gradient-to-br from-[#244cff] to-[#071b74] text-[10px] font-bold text-white shadow-sm">
          {base}
        </span>
        <div className="leading-tight">
          <div className="label-muted">Currency Pair</div>
          <div className="text-[15px] font-extrabold" style={{ color: 'var(--app-strong)' }}>
            {signal.pair}
          </div>
        </div>
      </Box>

      {/* Timeframe + Accuracy */}
      <div className="grid grid-cols-2 gap-2.5">
        <Box>
          <div className="label-muted">Timeframe</div>
          <div className="text-[15px] font-extrabold leading-tight" style={{ color: 'var(--app-strong)' }}>
            {signal.expiration}
          </div>
        </Box>
        <Box>
          <div className="label-muted">Accuracy</div>
          <div className="text-[15px] font-extrabold leading-tight text-electric">{signal.accuracy}%</div>
        </Box>
      </div>

      {/* Trend strength */}
      <Box>
        <div className="flex items-center justify-between">
          <span className="label-muted">Trend Strength</span>
          <span className="text-[12px] font-semibold" style={{ color: biasColor }}>
            — {signal.trendBias}
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--ring-track)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${signal.trendStrength}%`, background: strengthColor(signal.trendStrength) }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
          <span>Weak</span>
          <span className="font-bold" style={{ color: 'var(--app-strong)' }}>
            {signal.trendStrength}%
          </span>
          <span>Strong</span>
        </div>
      </Box>

      {/* Recommendation */}
      <div
        className="flex gap-2 rounded-[12px] border px-3.5 py-1.5"
        style={{
          background: rec.tone === 'ok' ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)',
          borderColor: rec.tone === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)',
        }}
      >
        <WarningIcon className={`mt-0.5 h-4 w-4 shrink-0 ${rec.tone === 'ok' ? 'text-success' : 'text-amber'}`} />
        <div className="leading-snug">
          <div className="text-[12.5px] font-bold" style={{ color: 'var(--app-strong)' }}>
            Recommendation
          </div>
          <div className="text-[12px] text-muted">{rec.text}</div>
        </div>
      </div>

      {/* Direction */}
      <div
        className="flex items-center justify-between rounded-[12px] border px-3.5 py-1.5"
        style={{ background: up ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', borderColor: dirColor }}
      >
        <div className="leading-tight">
          <div className="label-muted">Direction</div>
          <div className="flex items-center gap-1.5 text-[21px] font-extrabold" style={{ color: dirColor }}>
            {up ? <ArrowUpIcon className="h-5 w-5" /> : <ArrowDownIcon className="h-5 w-5" />}
            {signal.direction}
          </div>
        </div>
        <div className="text-[12px] text-muted">until {hhmm(expiresAt)}</div>
      </div>

      {/* Take / Skip */}
      {!done ? (
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => {
              setDone(true);
              onTake();
            }}
            className="btn py-2.5 text-[14px] font-bold text-white"
            style={{ background: '#22C55E' }}
          >
            <CheckIcon className="h-4 w-4" /> Take
          </button>
          <button
            onClick={() => {
              setDone(true);
              onSkip();
            }}
            className="btn py-2.5 text-[14px] font-bold text-danger"
            style={{ border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.06)' }}
          >
            <CloseIcon className="h-4 w-4" /> Skip
          </button>
        </div>
      ) : (
        <div className="rounded-[12px] border py-2 text-center" style={{ borderColor: 'var(--card-border)' }}>
          <span className="text-[13px] font-semibold text-success">Trade recorded ✓</span>
        </div>
      )}

      {/* Time to expiry */}
      <Box className="flex items-center justify-between">
        <span className="label-muted">Time to expiry</span>
        <span className={`font-mono text-[14px] font-bold ${expired ? 'text-muted' : 'text-cyan'}`}>
          {expired ? 'Expired' : `${String(Math.floor(remainingS / 60)).padStart(2, '0')}:${String(remainingS % 60).padStart(2, '0')}`}
        </span>
      </Box>
    </div>
  );
}
