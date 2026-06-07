import { useState } from 'react';
import type { UserStatus } from '../api';
import { WarningIcon, RefreshIcon, CheckIcon } from './Icons';

interface Props {
  status: UserStatus;
  regStep: 'step1' | 'enterId';
  pocketOptionId: string | null;
  onOpenModal: () => void;
  onEnterIdLink: () => void;
  onBackToStep1: () => void;
  onSubmitId: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export default function RegistrationCard({
  status,
  regStep,
  pocketOptionId,
  onOpenModal,
  onEnterIdLink,
  onBackToStep1,
  onSubmitId,
  onRefresh,
}: Props) {
  const [idInput, setIdInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ---- Verified ----
  if (status === 'verified') {
    return (
      <div className="card border-success/30 bg-success/5 p-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success/20 text-success">
          <CheckIcon className="h-5 w-5" />
        </span>
        <div>
          <div className="font-bold text-white">Account verified ✓</div>
          <div className="text-sm text-slate-300">
            PocketOption ID: <span className="font-semibold text-success">{pocketOptionId}</span> · signals unlocked
          </div>
        </div>
      </div>
    );
  }

  // ---- Step 3: verifying ----
  if (status === 'verifying') {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-full border-[3px] border-cyan/30 border-t-cyan animate-spin" />
          <div>
            <div className="font-bold text-white">Verifying…</div>
            <div className="text-sm text-slate-300">
              Checking your PocketOption account. Make sure you registered using our link — if you
              just signed up, this can take a moment.
            </div>
          </div>
        </div>
        <button
          onClick={async () => {
            setBusy(true);
            await onRefresh();
            setBusy(false);
          }}
          disabled={busy}
          className="btn-ghost mt-4 w-full py-2.5"
        >
          <RefreshIcon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Tap refresh to check
        </button>
      </div>
    );
  }

  // ---- Step 2/2: enter ID ----
  if (regStep === 'enterId') {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-widest text-cyan">Step 2/2</div>
        </div>
        <h3 className="mt-1 text-lg font-extrabold text-white">Enter your PocketOption ID</h3>
        <p className="mt-1 text-sm text-muted">Find it in your PocketOption profile.</p>
        <input
          value={idInput}
          inputMode="numeric"
          placeholder="12345678"
          onChange={(e) => {
            setIdInput(e.target.value.replace(/\D/g, ''));
            setErr(null);
          }}
          className="input-dark mt-3 font-mono tracking-widest"
        />
        {err && <div className="mt-2 text-sm text-danger">{err}</div>}
        <button
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await onSubmitId(idInput);
            } catch (e) {
              setErr(e instanceof Error ? e.message : 'Submit failed');
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy || idInput.length < 4}
          className="btn-primary mt-3 w-full py-3"
        >
          {busy ? 'Submitting…' : 'Submit'}
        </button>
        <button onClick={onBackToStep1} className="mt-3 block w-full text-sm font-semibold text-electric">
          ← Register on PocketOption
        </button>
      </div>
    );
  }

  // ---- Step 1/2: not registered (default) ----
  return (
    <div className="card p-5">
      <div className="text-xs font-bold uppercase tracking-widest text-cyan">Step 1/2</div>
      <h3 className="mt-1 text-lg font-extrabold text-white">
        To view signals you need to <span className="text-cyan">Register on Pocket Option</span>
      </h3>
      <button onClick={onOpenModal} className="btn-primary mt-4 w-full py-3">
        Register
      </button>
      <button onClick={onEnterIdLink} className="mt-3 block w-full text-sm font-semibold text-electric">
        Enter your PocketOption ID
      </button>

      <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber/10 border border-amber/30 px-3 py-2.5 text-sm text-amber">
        <WarningIcon className="h-4 w-4 shrink-0" />
        You haven't completed registration yet
      </div>

      <button onClick={onOpenModal} className="btn-ghost mt-3 w-full py-2.5 text-sm">
        I already have a PocketOption account
      </button>
    </div>
  );
}
