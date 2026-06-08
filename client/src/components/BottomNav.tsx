import { useApp, type Tab } from '../state/AppContext';
import { UserIcon, GiftIcon, SignalIcon, BotIcon, SupportIcon } from './Icons';
import { haptic } from '../telegram';
import { useT } from '../useT';

const TABS: { key: Tab; tkey: string; Icon: typeof UserIcon }[] = [
  { key: 'profile', tkey: 'nav.profile', Icon: UserIcon },
  { key: 'referrals', tkey: 'nav.referrals', Icon: GiftIcon },
  { key: 'signals', tkey: 'nav.signals', Icon: SignalIcon },
  { key: 'assistant', tkey: 'nav.assistant', Icon: BotIcon },
  { key: 'support', tkey: 'nav.support', Icon: SupportIcon },
];

export default function BottomNav() {
  const { tab, setTab } = useApp();
  const t = useT();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40">
      <div
        className="mx-auto grid max-w-md grid-cols-5 rounded-t-[28px] border px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-18px_45px_rgba(0,0,0,0.22)] backdrop-blur-xl"
        style={{ background: 'var(--nav-bg)', borderColor: 'var(--card-border)' }}
      >
        {TABS.map(({ key, tkey, Icon }) => {
          const active = tab === key;
          const center = key === 'signals';
          return (
            <button
              key={key}
              onClick={() => {
                haptic();
                setTab(key);
              }}
              className="flex flex-col items-center gap-1 py-1"
            >
              <span
                className={`flex items-center justify-center rounded-full transition-all ${
                  center ? 'h-[52px] w-[52px] -mt-6' : 'h-8 w-8'
                } ${
                  active
                    ? center
                      ? 'bg-gradient-to-br from-electric to-cyan text-white shadow-glow-cyan'
                      : 'text-electric'
                    : center
                      ? 'bg-gradient-to-br from-electric to-cyan text-white shadow-glow-cyan'
                      : 'text-muted'
                }`}
              >
                <Icon className={center ? 'h-6 w-6' : 'h-[20px] w-[20px]'} />
              </span>
              <span className={`text-[11px] font-medium leading-tight ${active ? 'text-electric' : 'text-muted'}`}>
                {t(tkey)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
