/**
 * useSpring — React hook for spring-based animations using WAAPI.
 *
 * Uses analytical spring (closed-form solution) for frame-rate
 * independence. Falls back to instant transition when reduced motion is preferred.
 */
import { useCallback, useRef } from 'react';
import {
  type SpringConfig,
  type SpringKeyframeOptions,
  springAtTime,
  springDuration,
  springToKeyframes,
  DEFAULT_SPRING,
} from '@/lib/spring';

export interface UseSpringOptions {
  config?: SpringConfig;
  /** Reduced motion → instant transition */
  reducedMotion?: boolean;
}

export interface SpringApi {
  /** Animate an element's transform using spring */
  animate: (
    element: HTMLElement | null,
    from: number,
    to: number,
    options?: {
      config?: SpringConfig;
      property?: string;
      unit?: string;
      format?: (value: number) => string;
      fill?: FillMode;
      duration?: number;
      onComplete?: () => void;
    }
  ) => Animation | null;
  /** Compute duration (ms) for a config */
  duration: (config?: SpringConfig) => number;
  /** Sample position at time t (seconds) */
  sample: (from: number, to: number, t: number, config?: SpringConfig) => number;
}

export function useSpring(options: UseSpringOptions = {}): SpringApi {
  const { config: defaultConfig = DEFAULT_SPRING, reducedMotion = false } = options;

  const animationsRef = useRef<Set<Animation>>(new Set());

  const animate = useCallback<SpringApi['animate']>(
    (element, from, to, opts = {}) => {
      if (!element) return null;

      // Reduced motion → instant
      if (reducedMotion) {
        element.style.setProperty(
          opts.property ?? 'transform',
          opts.format ? opts.format(to) : `${to}${opts.unit ?? ''}`
        );
        opts.onComplete?.();
        return null;
      }

      const cfg = opts.config ?? defaultConfig;
      const duration = opts.duration ?? springDuration(cfg) * 1000;

      const keyframes = springToKeyframes({
        from,
        to,
        config: cfg,
        property: opts.property,
        unit: opts.unit,
        format: opts.format,
      });

      const anim = element.animate(keyframes, {
        duration,
        easing: 'linear',
        fill: opts.fill ?? 'forwards',
      });

      animationsRef.current.add(anim);
      anim.onfinish = () => {
        animationsRef.current.delete(anim);
        opts.onComplete?.();
      };
      anim.oncancel = () => {
        animationsRef.current.delete(anim);
      };

      return anim;
    },
    [defaultConfig, reducedMotion]
  );

  const duration = useCallback(
    (config: SpringConfig = defaultConfig) => springDuration(config) * 1000,
    [defaultConfig]
  );

  const sample = useCallback(
    (from: number, to: number, t: number, config: SpringConfig = defaultConfig) =>
      springAtTime(from, to, config.velocity ?? 0, config, t).position,
    [defaultConfig]
  );

  return { animate, duration, sample };
}
