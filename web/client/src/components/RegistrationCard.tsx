import { useState } from 'react';
import type { UserStatus, RejectReason } from '../api';
import { WarningIcon, RefreshIcon, CheckIcon } from './Icons';
import { openExternal } from '../telegram';
import { useT } from '../useT';

interface Props {
  status: UserStatus;
  regStep: 'step1' | 'enterId';
  pocketOptionId: string | null;
  rejectReason: RejectReason | null;
  refUrl: string;
  minBalance: number;
  revokeBalance: number;
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
  rejectReason,
  refUrl,
  minBalance,
  revokeBalance,
  onOpenModal,
  onEnterIdLink,
  onBackToStep1,
  onSubmitId,
  onRefresh,
}: Props) {
  const t = useT();
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
          <div className="font-bold text-white">{t('reg.verified')}</div>
          <div className="text-sm text-slate-300">
            {t('reg.poId')}: <span className="font-semibold text-success">{pocketOptionId}</span> · {t('reg.unlocked')}
          </div>
        </div>
      </div>
    );
  }

  // ---- Verifying ----
  if (status === 'verifying') {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-full border-[3px] border-cyan/30 border-t-cyan animate-spin" />
          <div>
            <div className="font-bold text-white">{t('reg.verifying')}</div>
            <div className="text-sm text-slate-300">{t('reg.verifyingText')}</div>
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
          <RefreshIcon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> {t('reg.tapRefresh')}
        </button>
      </div>
    );
  }

  // ---- Registered under our link, but balance too low to UNLOCK (green) ----
  if (status === 'rejected' && rejectReason === 'low_balance' && regStep !== 'enterId') {
    return (
      <div className="card border-success/30 bg-success/5 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/20 text-success">
            <CheckIcon className="h-5 w-5" />
          </span>
          <div>
            <div className="font-bold text-white">{t('reg.lowBalTitle')}</div>
            <div className="mt-1 text-sm text-slate-300">{t('reg.lowBalText', { min: minBalance })}</div>
          </div>
        </div>
        <button onClick={() => openExternal(refUrl)} className="btn-cyan mt-4 w-full py-3 animate-pulse-glow">
          {t('reg.depositCta')}
        </button>
        <button
          onClick={async () => {
            setBusy(true);
            await onRefresh();
            setBusy(false);
          }}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 text-sm font-semibold text-electric"
        >
          <RefreshIcon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> {t('reg.depositedCheck')}
        </button>
      </div>
    );
  }

  // ---- Was verified, but balance dropped below the floor — access paused (amber) ----
  if (status === 'rejected' && rejectReason === 'balance_dropped' && regStep !== 'enterId') {
    return (
      <div className="card border-amber/30 bg-amber/5 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber/15 text-amber">
            <WarningIcon className="h-5 w-5" />
          </span>
          <div>
            <div className="font-bold text-white">{t('reg.dropTitle')}</div>
            <div className="mt-1 text-sm text-slate-300">
              {t('reg.dropText', { floor: revokeBalance, min: minBalance })}
            </div>
          </div>
        </div>
        <button onClick={() => openExternal(refUrl)} className="btn-cyan mt-4 w-full py-3 animate-pulse-glow">
          {t('reg.depositCta')}
        </button>
        <button
          onClick={async () => {
            setBusy(true);
            await onRefresh();
            setBusy(false);
          }}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 text-sm font-semibold text-electric"
        >
          <RefreshIcon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> {t('reg.depositedCheck')}
        </button>
      </div>
    );
  }

  // ---- Rejected: either the ID isn't under our link, or it's already in use ----
  if (status === 'rejected' && regStep !== 'enterId') {
    const isDuplicate = rejectReason === 'duplicate';
    return (
      <div className="card border-danger/30 bg-danger/5 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
            <WarningIcon className="h-5 w-5" />
          </span>
          <div>
            <div className="font-bold text-white">
              {isDuplicate ? t('reg.dupTitle') : t('reg.rejectedTitle')}
            </div>
            <div className="mt-1 text-sm text-slate-300">
              {isDuplicate ? t('reg.dupText') : t('reg.rejectedText', { id: pocketOptionId ?? '' })}
            </div>
          </div>
        </div>
        <button onClick={() => openExternal(refUrl)} className="btn-cyan mt-4 w-full py-3 animate-pulse-glow">
          {t('reg.registerPO')}
        </button>
        <button
          onClick={() => {
            setIdInput('');
            setErr(null);
            onEnterIdLink();
          }}
          className="mt-3 block w-full text-sm font-semibold text-electric"
        >
          {t('reg.enterAgain')}
        </button>
      </div>
    );
  }

  // ---- Step 2/2: enter ID ----
  if (regStep === 'enterId') {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-widest text-cyan">{t('reg.step2')}</div>
        </div>
        <h3 className="mt-1 text-lg font-extrabold text-white">{t('reg.enterYourId')}</h3>
        <p className="mt-1 text-sm text-muted">{t('reg.findId')}</p>
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
          {busy ? t('reg.submitting') : t('reg.submit')}
        </button>
        <button onClick={onBackToStep1} className="mt-3 block w-full text-sm font-semibold text-electric">
          {t('reg.backRegister')}
        </button>
      </div>
    );
  }

  // ---- Step 1/2: not registered (default) ----
  return (
    <div className="card p-5">
      <div className="text-xs font-bold uppercase tracking-widest text-cyan">{t('reg.step1')}</div>
      <h3 className="mt-1 text-lg font-extrabold text-white">
        {t('reg.toView')} <span className="text-cyan">{t('reg.registerOnPO')}</span>
      </h3>
      <button onClick={onOpenModal} className="btn-primary mt-4 w-full py-3">
        {t('reg.register')}
      </button>
      <button onClick={onEnterIdLink} className="mt-3 block w-full text-sm font-semibold text-electric">
        {t('reg.enterYourId')}
      </button>

      <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber/10 border border-amber/30 px-3 py-2.5 text-sm text-amber">
        <WarningIcon className="h-4 w-4 shrink-0" />
        {t('reg.notDone')}
      </div>

      <button onClick={onOpenModal} className="btn-ghost mt-3 w-full py-2.5 text-sm">
        {t('reg.haveAccount')}
      </button>
    </div>
  );
}
