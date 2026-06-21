import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext';
import { api, type Signal } from '../api';
import Dropdown from '../components/Dropdown';
import WinrateRing from '../components/WinrateRing';
import RegistrationCard from '../components/RegistrationCard';
import RegistrationModal from '../components/RegistrationModal';
import SignalCard from '../components/SignalCard';
import { ClockIcon, LightningIcon, MoonIcon, SunIcon } from '../components/Icons';
import { haptic } from '../telegram';
import { useT } from '../useT';

function PairFlag({ pair }: { pair: string }) {
  const [base, quote] = pair.split('/');
  const code = ((base?.[0] ?? '') + (quote?.[0] ?? '')).toUpperCase();
  return (
    <span className="flex h-5 w-7 items-center justify-center rounded-[5px] bg-gradient-to-br from-[#244cff] to-[#071b74] text-[10px] font-bold shadow-sm">
      {code}
    </span>
  );
}

export default function SignalsScreen() {
  const { user, config, setUser, theme, toggleTheme, refresh } = useApp();
  const t = useT();
  const [regStep, setRegStep] = useState<'step1' | 'enterId'>('step1');
  const [modalOpen, setModalOpen] = useState(false);
  const [pair, setPair] = useState('EUR/USD-OTC');
  const [expiration, setExpiration] = useState('3 min');
  const [signal, setSignal] = useState<Signal | null>(null);
  const [generating, setGenerating] = useState(false);
  const [decided, setDecided] = useState(false); // Take/Skip chosen -> unlock dropdowns
  const [phase, setPhase] = useState(0); // analysis phase index
  const [showVerifiedToast, setShowVerifiedToast] = useState(false);
  const prevStatus = useRef(user?.status);
  const statusRef = useRef(user?.status);

  // While verifying, poll the verification endpoint (it re-checks the
  // PocketOption affiliate API and promotes the user once registered).
  async function verifyNow() {
    try {
      const u = await api.verifyStatus();
      setUser(u);
    } catch {
      /* ignore transient errors */
    }
  }

  useEffect(() => {
    if (user?.status !== 'verifying') return;
    const id = setInterval(verifyNow, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.status]);

  // When verification just completed (verifying -> verified), flash the
  // "Account verified" confirmation for a few seconds, then remove it.
  useEffect(() => {
    if (prevStatus.current === 'verifying' && user?.status === 'verified') {
      setShowVerifiedToast(true);
      const t = setTimeout(() => setShowVerifiedToast(false), 4000);
      prevStatus.current = user?.status;
      return () => clearTimeout(t);
    }
    prevStatus.current = user?.status;
  }, [user?.status]);

  // The not-found / duplicate rejection cards are a transient heads-up: auto-clear
  // ~7s after showing (unless the user tapped "enter ID again"). The low-balance
  // cards are NOT transient — they persist so the user can deposit and re-check.
  const persistentReject =
    user?.rejectReason === 'low_balance' || user?.rejectReason === 'balance_dropped';
  useEffect(() => {
    if (user?.status !== 'rejected' || regStep === 'enterId' || persistentReject) return;
    const t = setTimeout(() => {
      api.resetRegistration().then(setUser).catch(() => {});
    }, 7000);
    return () => clearTimeout(t);
  }, [user?.status, regStep, persistentReject, setUser]);

  // Leaving the Signals tab (this screen unmounts) while rejected also returns
  // the user to the normal view — but not for the persistent low-balance cards.
  statusRef.current = user?.status;
  const reasonRef = useRef(user?.rejectReason);
  reasonRef.current = user?.rejectReason;
  useEffect(() => {
    return () => {
      const persistent =
        reasonRef.current === 'low_balance' || reasonRef.current === 'balance_dropped';
      if (statusRef.current === 'rejected' && !persistent) {
        api.resetRegistration().then(setUser).catch(() => {});
      }
    };
  }, [setUser]);

  if (!user || !config) return null;
  const verified = user.status === 'verified';
  const showRegistrationState =
    user.status === 'verifying' ||
    user.status === 'rejected' ||
    (user.status === 'verified' && showVerifiedToast) ||
    (user.status !== 'verified' && regStep === 'enterId');

  function guard() {
    if (!verified) {
      setModalOpen(true);
      return false;
    }
    return true;
  }

  async function getSignal() {
    if (!guard()) return;
    haptic();
    // Lock the pair/expiry and run the multi-phase analysis, then reveal.
    setDecided(false);
    setSignal(null);
    setPhase(0);
    setGenerating(true);
    try {
      const s = await api.generateSignal(pair, expiration);
      setTimeout(() => setPhase(1), 1000);
      setTimeout(() => setPhase(2), 2000);
      setTimeout(() => {
        setSignal(s);
        setGenerating(false);
      }, 2900);
    } catch {
      setGenerating(false);
      // Could be a balance-revoke (403) — refresh so the low-balance card shows.
      refresh();
    }
  }

  async function track(action: 'taken' | 'skipped') {
    // Take/Skip unlocks the pair/expiry again; the card stays (recorded state +
    // expiry countdown). Pressing "Get Signal" again replaces it with a new one.
    setDecided(true);
    const stats = await api.track(action);
    setUser({ ...user!, stats });
  }

  // Changing the pair or expiration invalidates the current signal: clear it
  // so the screen returns to the "Press 'Get Signal' to start" state.
  function changePair(v: string) {
    setPair(v);
    setSignal(null);
  }
  function changeExpiration(v: string) {
    setExpiration(v);
    setSignal(null);
  }

  // Pair/expiry are locked during analysis and while a signal awaits a decision.
  const locked = generating || (signal !== null && !decided);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[20px] font-extrabold leading-none tracking-[0.06em]" style={{ color: 'var(--app-strong)' }}>
          <span className="bg-gradient-to-r from-electric via-cyan to-electric bg-clip-text text-transparent">
            TRADES
          </span>{' '}
          AI <span className="ml-0.5 align-top text-[13px] text-electric">✧</span>
        </h1>
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/10"
          style={{ color: 'var(--app-strong)' }}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
        </button>
      </div>

      {showRegistrationState && (
        <div className="mb-5">
          <RegistrationCard
            status={user.status}
            regStep={regStep}
            pocketOptionId={user.pocketOptionId}
            rejectReason={user.rejectReason}
            refUrl={config.pocketOptionRefUrl}
            minBalance={config.accessMinBalance}
            revokeBalance={config.revokeBalance}
            onOpenModal={() => setModalOpen(true)}
            onEnterIdLink={() => setRegStep('enterId')}
            onBackToStep1={() => setRegStep('step1')}
            onSubmitId={async (id) => {
              const updated = await api.submitId(id);
              // Leave the enterId sub-state so the verifying/rejected cards (and
              // the auto-dismiss timer) take over — otherwise the form would
              // swallow a 'rejected' result and the heads-up never shows.
              setRegStep('step1');
              setUser(updated);
            }}
            onRefresh={verifyNow}
          />
        </div>
      )}

      <div className="grid grid-cols-[1fr_0.78fr] gap-3">
        <Dropdown
          value={pair}
          options={config.currencyPairs}
          onChange={changePair}
          disabled={locked}
          prefix={<PairFlag pair={pair} />}
          buttonClassName="h-[48px] rounded-[14px] border text-[15px] font-bold shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
          menuClassName="min-w-[210px]"
        />
        <Dropdown
          value={expiration}
          options={config.expirations}
          onChange={changeExpiration}
          disabled={locked}
          prefix={<ClockIcon className="h-5 w-5 text-electric" />}
          buttonClassName="h-[48px] rounded-[14px] border text-[15px] font-bold shadow-[0_8px_20px_rgba(0,0,0,0.1)]"
        />
      </div>

      <div className="mt-5">
        {generating ? (
          <div
            className="flex min-h-[160px] flex-col items-center justify-center gap-4 rounded-[16px] border px-6 text-center"
            style={{ background: 'var(--panel-bg)', borderColor: 'var(--card-border)' }}
          >
            <span className="h-12 w-12 rounded-full border-[3px] border-cyan/25 border-t-cyan animate-spin" />
            <span className="text-[15px] font-semibold text-cyan">{t('sig.analyzing' + (phase + 1))}</span>
            <div className="h-1.5 w-2/3 overflow-hidden rounded-full" style={{ background: 'var(--ring-track)' }}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-electric to-cyan transition-all duration-700"
                style={{ width: `${[34, 68, 96][phase]}%` }}
              />
            </div>
          </div>
        ) : signal ? (
          <SignalCard signal={signal} onTake={() => track('taken')} onSkip={() => track('skipped')} />
        ) : (
          <div className="space-y-6">
            <div
              className="flex min-h-[92px] items-center justify-center rounded-[16px] border px-4 text-center shadow-[0_10px_30px_rgba(0,0,0,0.1)]"
              style={{ background: 'var(--panel-bg)', borderColor: 'var(--card-border)' }}
            >
              <span className="text-[15px] font-medium text-muted">{t('sig.press')}</span>
            </div>

            <div className="flex justify-center">
              <WinrateRing value={80} label={t('sig.winrate')} />
            </div>
          </div>
        )}
      </div>

      <button
        onClick={getSignal}
        disabled={generating}
        className="btn mt-5 h-[52px] w-full rounded-[14px] bg-gradient-to-r from-electric to-cyan text-[17px] font-extrabold text-white shadow-glow-cyan hover:brightness-110"
      >
        <LightningIcon className="h-5 w-5" /> {t('sig.getSignal')}
      </button>

      <RegistrationModal
        open={modalOpen}
        refUrl={config.pocketOptionRefUrl}
        onClose={() => setModalOpen(false)}
        onProceedToId={() => setRegStep('enterId')}
      />
    </div>
  );
}
