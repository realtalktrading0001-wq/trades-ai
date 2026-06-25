import { useEffect, useState } from 'react';
import { useT } from '../useT';

// Remembers a manual dismissal so we don't nag on every visit.
const DISMISS_KEY = 'signalai_install_dismissed';

// `beforeinstallprompt` isn't in TS's DOM lib types yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// True when the app is already running as an installed PWA (home-screen launch).
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Dismissible "Install app" banner that makes the PWA discoverable.
 * - Android / desktop Chrome: captures `beforeinstallprompt` and shows an Install button.
 * - iOS Safari (no such event): shows the manual "Share → Add to Home Screen" hint.
 * Renders nothing when already installed or once dismissed.
 */
export default function InstallPrompt() {
  const t = useT();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1' || isStandalone()
  );

  useEffect(() => {
    if (dismissed) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // suppress Chrome's mini-infobar; we show our own button
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setShowIosHint(false);
      setDismissed(true);
      localStorage.setItem(DISMISS_KEY, '1');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // iOS Safari never fires beforeinstallprompt — offer the manual hint instead.
    if (isIos() && !isStandalone()) setShowIosHint(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [dismissed]);

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, '1');
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'accepted') dismiss();
  };

  if (dismissed || (!deferred && !showIosHint)) return null;

  return (
    <div className="card mb-3 flex items-center gap-3 p-3">
      <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-white">{t('install.title')}</div>
        <div className="text-xs text-muted">{deferred ? t('install.subtitle') : t('install.ios')}</div>
      </div>
      {deferred && (
        <button onClick={install} className="btn-cyan shrink-0 px-3 py-2 text-sm">
          {t('install.cta')}
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label={t('install.dismiss')}
        className="btn-ghost shrink-0 px-2.5 py-2 text-sm leading-none"
      >
        ✕
      </button>
    </div>
  );
}
