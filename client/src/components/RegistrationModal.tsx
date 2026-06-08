import { useState } from 'react';
import Modal from './Modal';
import { openExternal } from '../telegram';
import { ChartUpIcon, CheckIcon } from './Icons';
import { useT } from '../useT';

interface Props {
  open: boolean;
  refUrl: string;
  onClose: () => void;
  onProceedToId: () => void;
}

type Page = 1 | 2 | 3 | 'have-account';

export default function RegistrationModal({ open, refUrl, onClose, onProceedToId }: Props) {
  const t = useT();
  const [page, setPage] = useState<Page>(1);

  function proceedToId() {
    onProceedToId();
    onClose();
    setPage(1);
  }

  return (
    <Modal open={open} onClose={onClose}>
      {page === 1 && (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-electric/15 border border-electric/30">
            <ChartUpIcon className="h-8 w-8 text-cyan" />
          </div>
          <h3 className="text-xl font-extrabold text-white">{t('mod.p1.title')}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{t('mod.p1.text')}</p>
          <ul className="mt-4 space-y-2 text-left">
            {['mod.p1.f1', 'mod.p1.f2', 'mod.p1.f3'].map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-slate-200">
                <CheckIcon className="h-4 w-4 text-success" /> {t(f)}
              </li>
            ))}
          </ul>
          <button onClick={() => setPage(2)} className="btn-primary mt-6 w-full py-3">
            {t('mod.p1.cta')}
          </button>
        </div>
      )}

      {page === 2 && (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-success/15 border border-success/30 text-2xl">
            🤝
          </div>
          <h3 className="text-xl font-extrabold text-white">{t('mod.p2.title')}</h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">{t('mod.p2.text')}</p>
          <div className="mt-4 rounded-xl bg-success/10 border border-success/30 py-3 text-lg font-extrabold text-success">
            {t('mod.p2.winwin')}
          </div>
          <button onClick={() => setPage(3)} className="btn-primary mt-6 w-full py-3">
            {t('mod.p2.cta')}
          </button>
        </div>
      )}

      {page === 3 && (
        <div className="text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-cyan">{t('mod.p3.step')}</div>
          <h3 className="mt-1 text-xl font-extrabold text-white">{t('mod.p3.title')}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{t('mod.p3.text')}</p>
          <button
            onClick={() => openExternal(refUrl)}
            className="btn-cyan mt-5 w-full py-4 text-base animate-pulse-glow"
          >
            {t('mod.p3.cta')}
          </button>
          <button onClick={proceedToId} className="mt-4 block w-full text-sm font-semibold text-electric">
            {t('mod.p3.done')}
          </button>
          <button
            onClick={() => setPage('have-account')}
            className="mt-2 block w-full text-sm font-medium text-muted hover:text-slate-200"
          >
            {t('mod.p3.have')}
          </button>
        </div>
      )}

      {page === 'have-account' && (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber/15 border border-amber/30 text-2xl">
            ⚠️
          </div>
          <h3 className="text-xl font-extrabold text-white">{t('mod.alt.title')}</h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">{t('mod.alt.text')}</p>
          <button onClick={() => openExternal(refUrl)} className="btn-cyan mt-5 w-full py-4 text-base">
            {t('mod.alt.cta')}
          </button>
          <button onClick={proceedToId} className="mt-3 block w-full text-sm font-semibold text-electric">
            {t('mod.p3.done')}
          </button>
        </div>
      )}
    </Modal>
  );
}
