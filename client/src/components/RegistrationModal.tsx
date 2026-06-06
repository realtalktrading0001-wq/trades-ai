import { useState } from 'react';
import Modal from './Modal';
import { openExternal } from '../telegram';
import { ChartUpIcon, CheckIcon } from './Icons';

interface Props {
  open: boolean;
  refUrl: string;
  onClose: () => void;
  onProceedToId: () => void;
}

type Page = 1 | 2 | 3 | 'have-account';

export default function RegistrationModal({ open, refUrl, onClose, onProceedToId }: Props) {
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
          <h3 className="text-xl font-extrabold text-white">AI signals — for free! 🎯</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Our bot analyzes the market 24/7 and sends you high-probability entry signals.
          </p>
          <ul className="mt-4 space-y-2 text-left">
            {['Free signals 24/7', 'AI analysis of 50+ pairs', '90%+ accuracy on strong trends'].map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-slate-200">
                <CheckIcon className="h-4 w-4 text-success" /> {f}
              </li>
            ))}
          </ul>
          <button onClick={() => setPage(2)} className="btn-primary mt-6 w-full py-3">
            How does it work? →
          </button>
        </div>
      )}

      {page === 2 && (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-success/15 border border-success/30 text-2xl">
            🤝
          </div>
          <h3 className="text-xl font-extrabold text-white">Why is the bot free?</h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            We earn 2% from our team's trading volume on the broker — at no extra cost to you. So
            we're motivated for you to profit.
          </p>
          <div className="mt-4 rounded-xl bg-success/10 border border-success/30 py-3 text-lg font-extrabold text-success">
            WIN-WIN! 🚀
          </div>
          <button onClick={() => setPage(3)} className="btn-primary mt-6 w-full py-3">
            Got it, what do I do? →
          </button>
        </div>
      )}

      {page === 3 && (
        <div className="text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-cyan">Step 1</div>
          <h3 className="mt-1 text-xl font-extrabold text-white">Register on PocketOption</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Click the button below to create an account. It only takes 1 minute.
          </p>
          <button
            onClick={() => openExternal(refUrl)}
            className="btn-cyan mt-5 w-full py-4 text-base animate-pulse-glow"
          >
            Register on PocketOption
          </button>
          <button onClick={proceedToId} className="mt-4 block w-full text-sm font-semibold text-electric">
            Done, what's next? →
          </button>
          <button
            onClick={() => setPage('have-account')}
            className="mt-2 block w-full text-sm font-medium text-muted hover:text-slate-200"
          >
            I already have a PocketOption account
          </button>
        </div>
      )}

      {page === 'have-account' && (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber/15 border border-amber/30 text-2xl">
            ⚠️
          </div>
          <h3 className="text-xl font-extrabold text-white">I already have a PocketOption account</h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            If you already have a broker account, it can't be linked to us. To get free signals you
            need to create a new one using our link.
          </p>
          <button
            onClick={() => openExternal(refUrl)}
            className="btn-cyan mt-5 w-full py-4 text-base"
          >
            Register new account
          </button>
          <button onClick={proceedToId} className="mt-3 block w-full text-sm font-semibold text-electric">
            Done, what's next? →
          </button>
        </div>
      )}
    </Modal>
  );
}
