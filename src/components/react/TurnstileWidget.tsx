/**
 * TurnstileWidget — Cloudflare Turnstile wrapper.
 * Lazy-loads Turnstile script, renders widget, calls back with token.
 *
 * NOTE: Turnstile site key must be set in PUBLIC_TURNSTILE_SITE_KEY env.
 * If not set, this component renders nothing (silent fallback).
 */
import { useEffect, useRef, useState } from 'react';
import styles from './TurnstileWidget.module.css';

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: {
        sitekey: string;
        theme?: 'light' | 'dark' | 'auto';
        callback?: (token: string) => void;
        'error-callback'?: () => void;
        'expired-callback'?: () => void;
      }) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

let scriptLoaded: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (scriptLoaded) return scriptLoaded;
  scriptLoaded = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('SSR'));
    if (window.turnstile) return resolve();

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Turnstile'));
    document.head.appendChild(script);
  });
  return scriptLoaded;
}

export interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  theme?: 'light' | 'dark' | 'auto';
}

export function TurnstileWidget({
  onVerify,
  onError,
  onExpire,
  theme = 'auto',
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [widgetId, setWidgetId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const siteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;

        const id = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          callback: (token: string) => {
            setError(false);
            onVerify(token);
          },
          'error-callback': () => {
            setError(true);
            onError?.();
          },
          'expired-callback': () => {
            onExpire?.();
          },
        });
        setWidgetId(id);
      })
      .catch(() => setError(true));

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, theme]);

  if (!siteKey) {
    // No site key configured — render nothing (silent fallback)
    return null;
  }

  return (
    <div className={styles.container}>
      <div ref={containerRef} className={styles.widget} />
      {error && (
        <p className={styles.error}>
          Verification failed. Please refresh the page and try again.
        </p>
      )}
    </div>
  );
}
