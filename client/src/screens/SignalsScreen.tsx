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

function PairFlag() {
  return (
    <span className="flex h-5 w-7 items-center justify-center rounded-[5px] bg-gradient-to-br from-[#244cff] to-[#071b74] text-[10px] font-bold shadow-sm">
      EU
    </span>
  );
}

export default function SignalsScreen() {
  const { user, config, setUser, refresh, theme, toggleTheme } = useApp();
  const [regStep, setRegStep] = useState<'step1' | 'enterId'>('step1');
  const [modalOpen, setModalOpen] = useState(false);
  const [pair, setPair] = useState('EUR/USD-OTC');
  const [expiration, setExpiration] = useState('3 min');
  const [signal, setSignal] = useState<Signal | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showVerifiedToast, setShowVerifiedToast] = useState(false);
  const prevStatus = useRef(user?.status);

  useEffect(() => {
    if (user?.status !== 'verifying') return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [user?.status, refresh]);

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

  if (!user || !config) return null;
  const verified = user.status === 'verified';
  const showRegistrationState =
    user.status === 'verifying' ||
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
    setGenerating(true);
    setSignal(null);
    try {
      const s = await api.generateSignal(pair, expiration);
      setTimeout(() => {
        setSignal(s);
        setGenerating(false);
      }, 900);
    } catch {
      setGenerating(false);
    }
  }

  async function track(action: 'taken' | 'skipped') {
    const stats = await api.track(action);
    setUser({ ...user!, stats });
    // Keep the signal card on screen (it shows the recorded state + expiry
    // countdown). Pressing "Get Signal" again replaces it with a new one.
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

  return (
    <div className="min-h-[calc(100vh-180px)]">
      <div className="mb-3 flex items-center justify-between">
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
            onOpenModal={() => setModalOpen(true)}
            onEnterIdLink={() => setRegStep('enterId')}
            onBackToStep1={() => setRegStep('step1')}
            onSubmitId={async (id) => {
              const updated = await api.submitId(id);
              setUser(updated);
            }}
            onRefresh={refresh}
          />
        </div>
      )}

      <div className="grid grid-cols-[1fr_0.78fr] gap-3">
        <Dropdown
          value={pair}
          options={config.currencyPairs}
          onChange={changePair}
          prefix={<PairFlag />}
          buttonClassName="h-[48px] rounded-[14px] border text-[15px] font-bold shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
          menuClassName="min-w-[210px]"
        />
        <Dropdown
          value={expiration}
          options={config.expirations}
          onChange={changeExpiration}
          prefix={<ClockIcon className="h-5 w-5 text-electric" />}
          buttonClassName="h-[48px] rounded-[14px] border text-[15px] font-bold shadow-[0_8px_20px_rgba(0,0,0,0.1)]"
        />
      </div>

      {generating ? (
        <div
          className="mt-6 flex min-h-[160px] flex-col items-center justify-center gap-4 rounded-[16px] border px-6 text-center"
          style={{ background: 'var(--panel-bg)', borderColor: 'var(--card-border)' }}
        >
          <span className="h-12 w-12 rounded-full border-[3px] border-cyan/25 border-t-cyan animate-spin" />
          <span className="text-[15px] font-semibold text-cyan">Analyzing market...</span>
          <div className="h-1.5 w-2/3 overflow-hidden rounded-full" style={{ background: 'var(--ring-track)' }}>
            <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-electric to-cyan animate-[pulse_1s_ease-in-out_infinite]" />
          </div>
        </div>
      ) : signal ? (
        <div className="mt-3">
          <SignalCard signal={signal} onTake={() => track('taken')} onSkip={() => track('skipped')} />
        </div>
      ) : (
        <>
          <div
            className="mt-6 flex min-h-[92px] items-center justify-center rounded-[16px] border px-4 text-center shadow-[0_10px_30px_rgba(0,0,0,0.1)]"
            style={{ background: 'var(--panel-bg)', borderColor: 'var(--card-border)' }}
          >
            <span className="text-[15px] font-medium text-muted">Press 'Get Signal' to start</span>
          </div>

          <div className="mt-6 flex justify-center">
            <WinrateRing value={80} />
          </div>
        </>
      )}

      <button
        onClick={getSignal}
        disabled={generating}
        className="btn mt-2 h-[52px] w-full rounded-[14px] bg-gradient-to-r from-electric to-cyan text-[17px] font-extrabold text-white shadow-glow-cyan hover:brightness-110"
      >
        <LightningIcon className="h-5 w-5" /> Get Signal
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
