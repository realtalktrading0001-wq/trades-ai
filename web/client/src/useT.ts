import { useApp } from './state/AppContext';
import { langToCode, translate } from './i18n';

/** Returns a translate function bound to the user's current language. */
export function useT() {
  const { user } = useApp();
  const code = langToCode(user?.language);
  return (key: string, vars?: Record<string, string | number>) => translate(code, key, vars);
}
