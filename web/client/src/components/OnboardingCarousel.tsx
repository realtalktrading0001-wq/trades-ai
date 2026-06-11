import { useState } from 'react';
import { ChartUpIcon, ClockIcon, BarsIcon } from './Icons';
import { useT } from '../useT';

const SLIDES = [
  { Icon: ChartUpIcon, k: 's1' },
  { Icon: ClockIcon, k: 's2' },
  { Icon: BarsIcon, k: 's3' },
];

export default function OnboardingCarousel({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  const isLast = i === SLIDES.length - 1;

  function next() {
    if (isLast) onDone();
    else setI((n) => n + 1);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-b from-midnight to-midnight-deep" />
      <div className="relative z-10 w-full max-w-md">
        <div className="card p-7 text-center animate-fade-in">
          <div className="mx-auto mb-6 flex h-28 w-28 items-center justify-center rounded-3xl bg-gradient-to-br from-electric/20 to-cyan/10 border border-cyan/30 shadow-glow-cyan">
            <slide.Icon className="h-14 w-14 text-cyan" />
          </div>

          <div className="text-xs font-semibold uppercase tracking-widest text-cyan/80">{t(`ob.${slide.k}.title`)}</div>
          <h2 className="mt-2 text-2xl font-extrabold text-white">{t(`ob.${slide.k}.header`)}</h2>
          <p className="mt-1 text-sm font-medium text-muted">{t(`ob.${slide.k}.sub`)}</p>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-300">{t(`ob.${slide.k}.text`)}</p>

          <div className="mt-6 flex items-center justify-center gap-2">
            {SLIDES.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-6 bg-cyan' : 'w-1.5 bg-white/20'}`}
              />
            ))}
          </div>

          <div className="mt-7 flex gap-3">
            {i > 0 && (
              <button
                onClick={() => setI((n) => n - 1)}
                className={`btn flex-1 py-3 ${i === 1 ? 'btn-cyan' : 'btn-charcoal'}`}
              >
                {t('ob.back')}
              </button>
            )}
            <button onClick={next} className="btn-primary flex-1 py-3">
              {t('ob.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
