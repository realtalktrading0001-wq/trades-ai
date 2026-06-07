import { useState } from 'react';
import { useApp } from './state/AppContext';
import BottomNav from './components/BottomNav';
import OnboardingCarousel from './components/OnboardingCarousel';
import SignalsScreen from './screens/SignalsScreen';
import ProfileScreen from './screens/ProfileScreen';
import ReferralsScreen from './screens/ReferralsScreen';
import AssistantScreen from './screens/AssistantScreen';
import SupportScreen from './screens/SupportScreen';

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
