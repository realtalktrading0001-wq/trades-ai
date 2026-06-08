import { useEffect, useState } from 'react';
import { useT } from '../useT';

function parts(ms: number) {
  const clamp = Math.max(0, ms);
  const d = Math.floor(clamp / 86400000);
  const h = Math.floor((clamp % 86400000) / 3600000);
  const m = Math.floor((clamp % 3600000) / 60000);
  const s = Math.floor((clamp % 60000) / 1000);
  return { d, h, m, s };
}

export default function Countdown({ target }: { target: number }) {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const { d, h, m, s } = parts(target - now);
  const cell = (v: number, l: string) => (
    <div className="flex flex-col items-center">
      <div className="min-w-[44px] rounded-lg bg-midnight-deep/80 border border-white/[0.08] px-2 py-1.5 text-center font-mono text-lg font-bold text-cyan">
        {String(v).padStart(2, '0')}
      </div>
      <span className="mt-1 text-[10px] uppercase tracking-wide text-muted">{l}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-2">
      {cell(d, t('ref.days'))}
      {cell(h, t('ref.hrs'))}
      {cell(m, t('ref.min'))}
      {cell(s, t('ref.sec'))}
    </div>
  );
}
