/**
 * DownloadButton — Enterprise-grade download button with state machine.
 *
 * States:
 *   - idle: default, ready to download
 *   - loading: indeterminate shimmer (yt-dlp doesn't expose progress)
 *   - success: brief success animation, auto-reset to idle
 *   - error: red state with retry CTA
 *   - disabled: no metadata yet
 *
 * Includes manual fallback link if auto-download fails (after timeout).
 *
 * Hover: scale 1.05 with spring
 * Pressed: scale 0.97 with spring
 */
import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useReducedMotion } from './hooks/useReducedMotion';
import { BOUNCY_SPRING, springAtTime, springDuration } from '@/lib/spring';
import styles from './DownloadButton.module.css';

export type DownloadStatus = 'idle' | 'loading' | 'success' | 'error' | 'disabled';

export interface DownloadButtonProps {
  status: DownloadStatus;
  onClick: () => void;
  onRetry?: () => void;
  manualFallbackUrl?: string | null;
  disabled?: boolean;
  labels: {
    button: string;
    processing: string;
    downloading: string;
    success: string;
    error: string;
    retry: string;
    manualFallback: string;
  };
}

export function DownloadButton({
  status,
  onClick,
  onRetry,
  manualFallbackUrl,
  disabled = false,
  labels,
}: DownloadButtonProps) {
  const reducedMotion = useReducedMotion();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [showFallback, setShowFallback] = useState(false);

  // Auto-show fallback after 8s of loading
  useEffect(() => {
    if (status !== 'loading') {
      setShowFallback(false);
      return;
    }
    const timeout = setTimeout(() => setShowFallback(true), 8000);
    return () => clearTimeout(timeout);
  }, [status]);

  // Spring hover/press animation
  const handleMouseEnter = () => {
    if (reducedMotion || !buttonRef.current || status === 'loading' || disabled) return;
    const duration = springDuration(BOUNCY_SPRING) * 1000;
    const samples = 20;
    const keyframes: Keyframe[] = [];
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * (duration / 1000);
      const scale = springAtTime(1, 1.05, 0, BOUNCY_SPRING, t).position;
      keyframes.push({ offset: i / samples, transform: `scale(${scale})` });
    }
    buttonRef.current.animate(keyframes, { duration, easing: 'linear', fill: 'forwards' });
  };

  const handleMouseLeave = () => {
    if (reducedMotion || !buttonRef.current) return;
    const duration = springDuration(BOUNCY_SPRING) * 1000;
    const samples = 20;
    const keyframes: Keyframe[] = [];
    const startScale = status === 'loading' || disabled ? 1 : 1.05;
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * (duration / 1000);
      const scale = springAtTime(startScale, 1, 0, BOUNCY_SPRING, t).position;
      keyframes.push({ offset: i / samples, transform: `scale(${scale})` });
    }
    buttonRef.current.animate(keyframes, { duration, easing: 'linear', fill: 'forwards' });
  };

  const handleMouseDown = () => {
    if (reducedMotion || !buttonRef.current || disabled) return;
    buttonRef.current.style.transform = 'scale(0.97)';
  };

  const handleMouseUp = () => {
    if (reducedMotion || !buttonRef.current || disabled) return;
    buttonRef.current.style.transform = '';
  };

  const getLabel = () => {
    switch (status) {
      case 'loading':
        return labels.downloading;
      case 'success':
        return labels.success;
      case 'error':
        return labels.error;
      case 'disabled':
        return labels.button;
      default:
        return labels.button;
    }
  };

  const getIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader2 size={20} className={styles.spinner} />;
      case 'success':
        return <CheckCircle2 size={20} />;
      case 'error':
        return <AlertCircle size={20} />;
      default:
        return <Download size={20} />;
    }
  };

  const isDisabled = disabled || status === 'disabled' || status === 'loading';

  return (
    <div className={styles.container}>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.button} ${styles[`status--${status}`]} ${disabled ? styles.disabled : ''}`}
        onClick={status === 'error' && onRetry ? onRetry : onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        disabled={isDisabled}
        aria-live="polite"
        aria-busy={status === 'loading'}
      >
        <span className={styles.icon}>{getIcon()}</span>
        <span className={styles.label}>{getLabel()}</span>
        {status === 'loading' && (
          <span className={styles.shimmer} aria-hidden="true" />
        )}
      </button>

      {showFallback && manualFallbackUrl && (
        <a
          href={manualFallbackUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.fallback}
        >
          <ExternalLink size={14} />
          <span>{labels.manualFallback}</span>
        </a>
      )}
    </div>
  );
}
