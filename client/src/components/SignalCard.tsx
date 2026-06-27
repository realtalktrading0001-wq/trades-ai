import { useEffect, useState } from 'react';
import type { Signal } from '../api';
import { ArrowUpIcon, ArrowDownIcon, WarningIcon, CheckIcon, CloseIcon } from './Icons';
import { useT } from '../useT';
import { useApp } from '../state/AppContext';
import { formatHHMM } from '../time';

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

function strengthColor(s: number): string {
  if (s < 40) return '#EF4444';
  if (s < 70) return '#F59E0B';
  return '#22C55E';
}

function recommendation(s: number): { key: string; tone: 'warn' | 'ok' } {
  if (s < 40) return { key: 'rec.weak', tone: 'warn' };
  if (s < 70) return { key: 'rec.moderate', tone: 'warn' };
  return { key: 'rec.strong', tone: 'ok' };
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
  const t = useT();
  const { user } = useApp();
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
    <div className="card animate-fade-in p-3 space-y-2.5">
      <h2 className="text-[15px] font-extrabold leading-none" style={{ color: 'var(--app-strong)' }}>
        {t('card.signal')}
      </h2>

      {/* Currency pair */}
      <Box className="flex items-center gap-2.5">
        <span className="flex h-5 w-7 items-center justify-center rounded-[5px] bg-gradient-to-br from-[#244cff] to-[#071b74] text-[10px] font-bold text-white shadow-sm">
          {base}
        </span>
        <div className="leading-tight">
          <div className="label-muted">{t('card.pair')}</div>
          <div className="text-[15px] font-extrabold" style={{ color: 'var(--app-strong)' }}>
            {signal.pair}
          </div>
        </div>
      </Box>

      {/* Timeframe + Accuracy */}
      <div className="grid grid-cols-2 gap-2.5">
        <Box>
          <div className="label-muted">{t('card.timeframe')}</div>
          <div className="text-[15px] font-extrabold leading-tight" style={{ color: 'var(--app-strong)' }}>
            {signal.expiration}
          </div>
        </Box>
        <Box>
          <div className="label-muted">{t('card.accuracy')}</div>
          <div className="text-[15px] font-extrabold leading-tight text-electric">{signal.accuracy}%</div>
        </Box>
      </div>

      {/* Trend strength */}
      <Box>
        <div className="flex items-center justify-between">
          <span className="label-muted">{t('card.trend')}</span>
          <span className="text-[12px] font-semibold" style={{ color: biasColor }}>
            — {t('bias.' + signal.trendBias)}
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--ring-track)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${signal.trendStrength}%`, background: strengthColor(signal.trendStrength) }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
          <span>{t('card.weak')}</span>
          <span className="font-bold" style={{ color: 'var(--app-strong)' }}>
            {signal.trendStrength}%
          </span>
          <span>{t('card.strong')}</span>
        </div>
      </Box>

      {/* Recommendation — only shown for weak/moderate trends, as a caution.
          Strong trends are self-evidently good, so we hide the box to keep the
          card clean and let the Direction stay the clear headline. */}
      {rec.tone === 'warn' && (
        <div
          className="flex gap-2 rounded-[12px] border px-3.5 py-1.5"
          style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)' }}
        >
          <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
          <div className="leading-snug">
            <div className="text-[12.5px] font-bold" style={{ color: 'var(--app-strong)' }}>
              {t('card.recommendation')}
            </div>
            <div className="text-[12px] text-muted">{t(rec.key)}</div>
          </div>
        </div>
      )}

      {/* Direction — the headline of the card, made large to draw attention */}
      <div
        className="mt-0.5 flex items-center justify-between rounded-[14px] border-2 px-4 py-3"
        style={{
          background: up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          borderColor: dirColor,
          boxShadow: `0 0 22px ${up ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
        }}
      >
        <div className="leading-tight">
          <div className="label-muted">{t('card.direction')}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[30px] font-extrabold leading-none" style={{ color: dirColor }}>
            {up ? <ArrowUpIcon className="h-8 w-8" /> : <ArrowDownIcon className="h-8 w-8" />}
            {t(up ? 'card.up' : 'card.down')}
          </div>
        </div>
        <div className="text-[13px] text-muted">{t('card.until')} {formatHHMM(expiresAt, user?.timezone)}</div>
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
            <CheckIcon className="h-4 w-4" /> {t('card.take')}
          </button>
          <button
            onClick={() => {
              setDone(true);
              onSkip();
            }}
            className="btn py-2.5 text-[14px] font-bold text-danger"
            style={{ border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.06)' }}
          >
            <CloseIcon className="h-4 w-4" /> {t('card.skip')}
          </button>
        </div>
      ) : (
        <div className="rounded-[12px] border py-2 text-center" style={{ borderColor: 'var(--card-border)' }}>
          <span className="text-[13px] font-semibold text-success">{t('card.recorded')}</span>
        </div>
      )}

      {/* Time to expiry */}
      <Box className="flex items-center justify-between">
        <span className="label-muted">{t('card.timeToExpiry')}</span>
        <span className={`font-mono text-[14px] font-bold ${expired ? 'text-muted' : 'text-cyan'}`}>
          {expired ? t('card.expired') : `${String(Math.floor(remainingS / 60)).padStart(2, '0')}:${String(remainingS % 60).padStart(2, '0')}`}
        </span>
      </Box>
    </div>
  );
}
