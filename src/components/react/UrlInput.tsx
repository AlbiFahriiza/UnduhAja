/**
 * UrlInput — Custom URL input with animated placeholder.
 *
 * Placeholder cycling:
 *   1. "Masukkan URL video kamu!" (idle prompt)
 *   2. TikTok example URL (censored)
 *   3. YouTube example URL (censored)
 *   → Loop
 *
 * Animation per character:
 *   - Fade IN: LEFT → RIGHT (first char appears first), with spring overshoot
 *   - Fade OUT: RIGHT → LEFT (last char disappears first), fast
 *
 * Drag & drop URL support.
 * Ctrl+V anywhere focuses input.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Clipboard, Link2, Loader2, X } from 'lucide-react';
import { useReducedMotion } from './hooks/useReducedMotion';
import {
  BOUNCY_SPRING,
  springAtTime,
  springDuration,
  type SpringConfig,
} from '@/lib/spring';
import styles from './UrlInput.module.css';

export type UrlInputStatus = 'idle' | 'scanning' | 'valid' | 'invalid';

export interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  status: UrlInputStatus;
  errorMessage?: string;
  lang: 'id' | 'en';
  placeholder: string;
  placeholderTikTok: string;
  placeholderYouTube: string;
  invalidMessage: string;
  unsupportedMessage: string;
  scanLabel: string;
  scanningLabel: string;
  clearLabel: string;
  pasteLabel: string;
  dragDropLabel: string;
}

type Phase = 'prompt' | 'tiktok' | 'youtube';

const PHASE_ORDER: Phase[] = ['prompt', 'tiktok', 'youtube'];
const PHASE_DURATION_MS = 3500;
const CHAR_OUT_DELAY = 40; // ms per char (outgoing)
const CHAR_IN_DELAY = 35;  // ms per char (incoming)

export function UrlInput(props: UrlInputProps) {
  const {
    value,
    onChange,
    onSubmit,
    status,
    errorMessage,
    lang,
    placeholder,
    placeholderTikTok,
    placeholderYouTube,
    invalidMessage,
    unsupportedMessage,
    scanLabel,
    scanningLabel,
    clearLabel,
    pasteLabel,
    dragDropLabel,
  } = props;

  const reducedMotion = useReducedMotion();

  const inputRef = useRef<HTMLInputElement>(null);
  const placeholderRef = useRef<HTMLSpanElement>(null);
  const isAnimatingOutRef = useRef(false);

  const [phaseIndex, setPhaseIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPasteAnimating, setIsPasteAnimating] = useState(false);

  const phaseTexts: Record<Phase, string> = {
    prompt: placeholder,
    tiktok: placeholderTikTok,
    youtube: placeholderYouTube,
  };

  const currentPhase = PHASE_ORDER[phaseIndex];

  // ============================================
  // Placeholder cycling — animate OUT then change phase
  // ============================================
  useEffect(() => {
    if (isFocused || value) return;

    const cycleTimeout = setTimeout(() => {
      const container = placeholderRef.current;
      if (!container || reducedMotion) {
        setPhaseIndex((prev) => (prev + 1) % PHASE_ORDER.length);
        return;
      }

      // Get current char spans
      const chars = Array.from(container.querySelectorAll(`.${styles.char}`)) as HTMLSpanElement[];
      if (chars.length === 0) {
        setPhaseIndex((prev) => (prev + 1) % PHASE_ORDER.length);
        return;
      }

      isAnimatingOutRef.current = true;

      // Animate OUT: RIGHT → LEFT (last char disappears first)
      const totalChars = chars.length;
      chars.forEach((char, i) => {
        // Right to left: last char (index = totalChars-1) starts first
        const reverseIndex = totalChars - 1 - i;
        const delay = reverseIndex * CHAR_OUT_DELAY;

        setTimeout(() => {
          if (!char.isConnected) return;
          char.animate(
            [
              { opacity: 1, transform: 'translateY(0px)', offset: 0 },
              { opacity: 0, transform: 'translateY(4px)', offset: 1 },
            ],
            { duration: 150, easing: 'ease-out', fill: 'forwards' }
          );
        }, delay);
      });

      // After all chars animated out, change phase
      const totalOutTime = totalChars * CHAR_OUT_DELAY + 200;
      setTimeout(() => {
        isAnimatingOutRef.current = false;
        setPhaseIndex((prev) => (prev + 1) % PHASE_ORDER.length);
      }, totalOutTime);
    }, PHASE_DURATION_MS);

    return () => clearTimeout(cycleTimeout);
  }, [phaseIndex, isFocused, value, reducedMotion]);

  // Animate IN: LEFT → RIGHT (first char appears first) with spring overshoot
  useEffect(() => {
    if (reducedMotion || isFocused || value) return;

    const container = placeholderRef.current;
    if (!container) return;

    const text = phaseTexts[currentPhase];

    // Build character spans
    container.innerHTML = '';
    const chars: HTMLSpanElement[] = [];

    text.split('').forEach((char) => {
      const span = document.createElement('span');
      span.textContent = char === ' ' ? '\u00A0' : char;
      span.className = styles.char;
      span.style.opacity = '0';
      span.style.display = 'inline-block';
      span.style.willChange = 'transform, opacity';
      container.appendChild(span);
      chars.push(span);
    });

    // Stagger animation: LEFT → RIGHT (first char starts first)
    const totalChars = chars.length;

    chars.forEach((char, i) => {
      // Left to right: first char (index 0) starts first
      const delay = i * CHAR_IN_DELAY;

      setTimeout(() => {
        if (!char.isConnected) return;

        // Spring animation: translateY 6px → 0 (from bottom to top), opacity 0 → 1
        char.animate(
          [
            { transform: 'translateY(6px)', opacity: 0, offset: 0 },
            ...sampleSpringKeyframes(6, 0, BOUNCY_SPRING, 'translateY', 'px'),
            { transform: 'translateY(0px)', opacity: 1, offset: 1 },
          ],
          {
            duration: 400,
            easing: 'linear',
            fill: 'forwards',
          }
        );
      }, delay);
    });

    return () => {
      chars.forEach((c) => c.getAnimations().forEach((a) => a.cancel()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPhase, reducedMotion, isFocused, value]);

  // ============================================
  // Keyboard shortcut: Ctrl+V focuses input
  // ============================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ============================================
  // Auto-scan when URL becomes valid
  // ============================================
  const detectPlatform = useCallback(
    (url: string): 'youtube' | 'tiktok' | null => {
      const trimmed = url.trim();
      if (!trimmed) return null;
      const ytPatterns = [
        /^https?:\/\/(www\.)?youtube\.com\/watch\?v=/i,
        /^https?:\/\/youtu\.be\//i,
        /^https?:\/\/(www\.)?youtube\.com\/shorts\//i,
        /^https?:\/\/(www\.)?youtube\.com\/embed\//i,
      ];
      if (ytPatterns.some((p) => p.test(trimmed))) return 'youtube';
      const ttPatterns = [
        /^https?:\/\/(www\.)?tiktok\.com\//i,
        /^https?:\/\/vm\.tiktok\.com\//i,
        /^https?:\/\/vt\.tiktok\.com\//i,
      ];
      if (ttPatterns.some((p) => p.test(trimmed))) return 'tiktok';
      return null;
    },
    []
  );

  useEffect(() => {
    if (status === 'scanning') return;
    if (!value) return;
    const platform = detectPlatform(value);
    if (platform && status === 'idle') {
      const debounce = setTimeout(() => {
        onSubmit();
      }, 600);
      return () => clearTimeout(debounce);
    }
  }, [value, status, detectPlatform, onSubmit]);

  // ============================================
  // Handlers
  // ============================================
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        onChange(text.trim());
        inputRef.current?.focus();
        setIsPasteAnimating(true);
        setTimeout(() => setIsPasteAnimating(false), 600);
      }
    } catch {
      inputRef.current?.focus();
    }
  };

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (text) {
      onChange(text.trim());
      inputRef.current?.focus();
    }
  };

  // ============================================
  // Render
  // ============================================
  const statusClass = styles[`status--${status}`] ?? '';
  const showPlaceholder = !value && !isFocused;

  return (
    <form
      className={`${styles.form} ${statusClass} ${isDragOver ? styles.dragOver : ''}`}
      onSubmit={handleSubmit}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="search"
    >
      <div className={styles.inputWrap}>
        <div className={styles.iconLeft}>
          {status === 'scanning' ? (
            <Loader2 size={20} className={styles.spinner} aria-hidden="true" />
          ) : (
            <Link2 size={20} aria-hidden="true" />
          )}
        </div>

        <div className={styles.inputInner}>
          <input
            ref={inputRef}
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className={styles.input}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            aria-label={placeholder}
            aria-invalid={status === 'invalid'}
            aria-describedby={errorMessage ? 'url-error' : undefined}
            dir="ltr"
          />

          {showPlaceholder && (
            <span
              ref={placeholderRef}
              className={styles.placeholder}
              aria-hidden="true"
              dir="ltr"
            />
          )}
        </div>

        {value && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={handleClear}
            aria-label={clearLabel}
          >
            <X size={16} />
          </button>
        )}

        {!value && (
          <button
            type="button"
            className={styles.pasteBtn}
            onClick={handlePaste}
            aria-label={pasteLabel}
          >
            <Clipboard size={16} />
            <span>{pasteLabel}</span>
          </button>
        )}
      </div>

      <button
        type="submit"
        className={styles.submitBtn}
        disabled={!value || status === 'scanning'}
      >
        {status === 'scanning' ? scanningLabel : scanLabel}
      </button>

      {(status === 'invalid' || errorMessage) && (
        <div id="url-error" className={styles.error} role="alert">
          {errorMessage || (value ? unsupportedMessage : invalidMessage)}
        </div>
      )}

      {isDragOver && (
        <div className={styles.dragOverlay}>
          <Link2 size={32} />
          <span>{dragDropLabel}</span>
        </div>
      )}

      <div className={styles.hint}>
        {isPasteAnimating && <span className={styles.pastedFlash}>Pasted!</span>}
      </div>
    </form>
  );
}

/**
 * Helper: Sample spring curve into keyframes for a single transform property.
 */
function sampleSpringKeyframes(
  from: number,
  to: number,
  config: SpringConfig,
  transformName: string,
  unit: string
): Keyframe[] {
  const samples = 30;
  const keyframes: Keyframe[] = [];

  const duration = springDuration(config);
  if (typeof duration !== 'number' || !isFinite(duration)) return [];

  for (let i = 1; i < samples; i++) {
    const t = (i / samples) * duration;
    const { position } = springAtTime(from, to, config.velocity ?? 0, config, t);
    const offset = i / samples;
    keyframes.push({
      offset,
      transform: `${transformName}(${position}${unit})`,
    });
  }
  return keyframes;
}
