import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type AppConfig, type UserState } from '../api';
import { initTelegram, getToken, setToken, clearToken, clearRefCode } from '../telegram';
import { langToCode, isRTL } from '../i18n';

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
  login: (token: string, user: UserState) => void;
  logout: () => Promise<void>;
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
      const cfg = await api.config();
      setConfig(cfg);
      // If we already hold a session token, restore the logged-in user.
      if (getToken()) {
        try {
          let usr = await api.me();
          // A 'rejected' state is transient — if the app is reopened while
          // rejected, clear it so the user lands on the normal view.
          if (usr.status === 'rejected') {
            try {
              usr = await api.resetRegistration();
            } catch {
              /* ignore */
            }
          }
          localStorage.setItem('signalai_logged_in', '1'); // returning user — skip the welcome slides
          setUser(usr);
        } catch {
          clearToken(); // stale/invalid token — fall back to the login screen
          setUser(null);
        }
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  function login(token: string, usr: UserState) {
    setToken(token);
    clearRefCode(); // referral is now consumed
    localStorage.setItem('signalai_logged_in', '1'); // first login — welcome slides won't show again
    setUser(usr);
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      /* ignore — clear locally regardless */
    }
    clearToken();
    setUser(null);
    setTab('signals');
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
      value={{ user, config, loading, error, tab, theme, setTab, setTheme, toggleTheme, refresh, setUser, login, logout }}
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
