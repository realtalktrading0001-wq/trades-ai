import { useState } from 'react';
import { useApp } from './state/AppContext';
import BottomNav from './components/BottomNav';
import OnboardingCarousel from './components/OnboardingCarousel';
import LoginScreen from './screens/LoginScreen';
import SignalsScreen from './screens/SignalsScreen';
import ProfileScreen from './screens/ProfileScreen';
import ReferralsScreen from './screens/ReferralsScreen';
import AssistantScreen from './screens/AssistantScreen';
import SupportScreen from './screens/SupportScreen';

// Persisted once the user logs in for the first time. Until then, the welcome
// slides show on every visit (so first-time visitors always get the intro).
const LOGGED_IN_KEY = 'signalai_logged_in';

export default function App() {
  const { tab, loading, error, user } = useApp();
  const hasLoggedIn = localStorage.getItem(LOGGED_IN_KEY) === '1';
  // Dismissed for THIS visit only (in-memory, resets on reload) so a not-yet-
  // logged-in visitor sees the welcome slides again the next time they open the site.
  const [skipOnboarding, setSkipOnboarding] = useState(false);

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

  // Welcome carousel: shown on every visit until the user has logged in once.
  if (!hasLoggedIn && !user && !skipOnboarding) {
    return <OnboardingCarousel onDone={() => setSkipOnboarding(true)} />;
  }

  // No session yet → email login (the website's gate; the mini app used Telegram).
  if (!user) return <LoginScreen />;

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
