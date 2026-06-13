import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type AppConfig, type UserState } from '../api';
import { initTelegram, requestWriteAccess } from '../telegram';
import { langToCode, isRTL } from '../i18n';

// Ask once per device for permission to message the user. On grant, the server
// sends the one-time welcome DM (so the bot lands in their chat list and we can
// re-engage them later). Fire-and-forget — never blocks app load.
const WA_KEY = 'tradesai_write_access_asked';
async function maybeAskWriteAccess() {
  if (localStorage.getItem(WA_KEY)) return;
  localStorage.setItem(WA_KEY, '1');
  const granted = await requestWriteAccess();
  if (granted) {
    try {
      await api.welcome();
    } catch {
      /* ignore */
    }
  }
}

export type Tab = 'profile' | 'referrals' | 'signals' | 'assistant' | 'support';
export type ThemeMode = 'dark' | 'light';

interface AppContextValue {
  user: UserState | null;
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
  tab: Tab;
  theme: ThemeMode;
  setTab: (t: Tab) => void;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
  refresh: () => Promise<void>;
  setUser: (u: UserState) => void;
}

const AppContext = createContext<AppContextValue | null>(null);
const THEME_KEY = 'tradesai_theme';

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserState | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('signals');
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' ? 'light' : 'dark';
  });

  function setTheme(next: ThemeMode) {
    localStorage.setItem(THEME_KEY, next);
    setThemeState(next);
  }

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }

  async function bootstrap() {
    try {
      initTelegram();
      const [cfg, authed] = await Promise.all([api.config(), api.auth()]);
      // A 'rejected' state is transient — if the app is reopened while rejected,
      // clear it so the user lands on the normal view.
      let usr = authed;
      if (usr.status === 'rejected') {
        try {
          usr = await api.resetRegistration();
        } catch {
          /* ignore */
        }
      }
      setConfig(cfg);
      setUser(usr);
      setError(null);
      void maybeAskWriteAccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    try {
      const usr = await api.me();
      setUser(usr);
    } catch {
      /* ignore transient refresh errors */
    }
  }

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Apply language direction (RTL for Arabic) + lang attribute.
  useEffect(() => {
    const code = langToCode(user?.language);
    document.documentElement.lang = code;
    document.documentElement.dir = isRTL(code) ? 'rtl' : 'ltr';
  }, [user?.language]);

  return (
    <AppContext.Provider
      value={{ user, config, loading, error, tab, theme, setTab, setTheme, toggleTheme, refresh, setUser }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
