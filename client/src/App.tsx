import { useState } from 'react';
import { useApp } from './state/AppContext';
import BottomNav from './components/BottomNav';
import OnboardingCarousel from './components/OnboardingCarousel';
import SignalsScreen from './screens/SignalsScreen';
import ProfileScreen from './screens/ProfileScreen';
import ReferralsScreen from './screens/ReferralsScreen';
import AssistantScreen from './screens/AssistantScreen';
import SupportScreen from './screens/SupportScreen';
import { ChevronDown, CloseIcon } from './components/Icons';

const ONBOARDED_KEY = 'signalai_onboarded';

export default function App() {
  const { tab, loading, error } = useApp();
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem(ONBOARDED_KEY) === '1');

  function finishOnboarding() {
    localStorage.setItem(ONBOARDED_KEY, '1');
    setOnboarded(true);
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <span className="h-10 w-10 rounded-full border-[3px] border-cyan/30 border-t-cyan animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center p-6 text-center">
        <div className="card p-6">
          <div className="text-lg font-bold text-danger">Connection error</div>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <p className="mt-3 text-xs text-muted">Make sure the backend is running on port 4000.</p>
        </div>
      </div>
    );
  }

  if (!onboarded) return <OnboardingCarousel onDone={finishOnboarding} />;

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-30 bg-[#1b2635] text-white shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
        <div className="mx-auto flex h-[52px] max-w-md items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <CloseIcon className="h-5 w-5" />
            <span className="text-[17px] font-extrabold tracking-[-0.01em]">TRADES AI</span>
          </div>
          <div className="flex items-center gap-4">
            <ChevronDown className="h-5 w-5" />
            <span className="flex h-5 w-1 flex-col justify-center gap-1" aria-hidden="true">
              <span className="h-1 w-1 rounded-full bg-white" />
              <span className="h-1 w-1 rounded-full bg-white" />
              <span className="h-1 w-1 rounded-full bg-white" />
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-3">
        {tab === 'signals' && <SignalsScreen />}
        {tab === 'profile' && <ProfileScreen />}
        {tab === 'referrals' && <ReferralsScreen />}
        {tab === 'assistant' && <AssistantScreen />}
        {tab === 'support' && <SupportScreen />}
      </main>

      <BottomNav />
    </div>
  );
}
