import React from 'react';

interface PwaInstallPromptProps {
  visible: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'kuci_pwa_install_prompt_dismissed_at';
const DISMISS_MS = 1000 * 60 * 60 * 24 * 7;

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const navigatorStandalone = 'standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone;
  return Boolean(window.matchMedia('(display-mode: standalone)').matches || navigatorStandalone);
}

function isIosSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isWebkit = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
  return isIos && isWebkit;
}

export const PwaInstallPrompt: React.FC<PwaInstallPromptProps> = ({ visible }) => {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = React.useState(false);

  React.useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  React.useEffect(() => {
    if (!visible || isStandaloneMode()) {
      setShowPrompt(false);
      return;
    }

    const dismissedAtRaw = localStorage.getItem(DISMISS_KEY);
    if (dismissedAtRaw) {
      const dismissedAt = Number(dismissedAtRaw);
      if (Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_MS) {
        setShowPrompt(false);
        return;
      }
    }

    if (deferredPrompt || isIosSafari()) {
      setShowPrompt(true);
      return;
    }

    setShowPrompt(false);
  }, [deferredPrompt, visible]);

  const dismiss = React.useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShowPrompt(false);
  }, []);

  const handleInstall = React.useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'dismissed') {
      dismiss();
    } else {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt, dismiss]);

  if (!showPrompt) return null;

  const showManualIosHelp = !deferredPrompt && isIosSafari();

  return (
    <div className="fixed left-3 right-3 bottom-20 z-[130] rounded-[20px] border border-[var(--color-border)] bg-white shadow-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-[var(--color-text)]">Add KUCI to your homescreen for faster access.</p>
      {showManualIosHelp ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          On iPhone: tap Share, then choose Add to Home Screen.
        </p>
      ) : (
        <p className="text-xs text-[var(--color-text-muted)]">
          Install once and open KUCI like a regular app.
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={dismiss}
          className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]"
        >
          Maybe later
        </button>
        {deferredPrompt ? (
          <button
            onClick={() => void handleInstall()}
            className="rounded-full bg-[var(--color-primary)] text-white px-4 py-1.5 text-[10px] font-black uppercase tracking-wider"
          >
            Add to Homescreen
          </button>
        ) : null}
      </div>
    </div>
  );
};

