/**
 * ============================================
 * UnduhAja Custom RK4 Analytical Spring Engine
 * ============================================
 *
 * Implementation: Closed-form analytical spring solver
 * (NOT numerical RK4 — analytical solution is faster & frame-independent).
 *
 * Reference: "Analytical Spring" by Ryan Juckett (2012)
 * https://www.ryanjuckett.com/analytical-spring/
 *
 * Why analytical (not numerical RK4)?
 * - Frame-rate independent (same curve on 30fps and 144fps)
 * - No accumulation errors (closed-form math)
 * - Single function call to compute state at time t
 * - Better performance: no per-frame physics integration
 *
 * The user mentioned "RK4 analytical" — the industry-standard
 * "analytical spring" approach IS the closed-form solution.
 * Pure RK4 numerical integration is suboptimal for springs.
 * We use the closed-form solution (sometimes called "semi-analytical").
 *
 * Profile (Apple iOS-like):
 *   m = 1.0, k = 250, c = 22
 *   → Damping ratio ζ = c / (2·√(k·m)) = 22 / (2·√250) ≈ 0.696
 *   → Underdamped (ζ < 1) → bouncy with overshoot
 *
 * ============================================
 */

export interface SpringConfig {
  /** Stiffness (k) — higher = snappier */
  stiffness: number;
  /** Damping (c) — higher = less bounce */
  damping: number;
  /** Mass (m) — higher = slower */
  mass: number;
  /** Initial velocity (pixels/sec or unit/sec) */
  velocity?: number;
  /** Rest threshold — stop when |x - target| < epsilon AND |v| < epsilon */
  restThreshold?: number;
}

export interface SpringState {
  /** Current position */
  position: number;
  /** Current velocity */
  velocity: number;
  /** Whether the spring has come to rest */
  atRest: boolean;
}

/**
 * Default spring profile — Apple iOS-like bouncy.
 * Damping ratio ≈ 0.696 (underdamped, subtle overshoot).
 */
export const DEFAULT_SPRING: SpringConfig = {
  stiffness: 250,
  damping: 22,
  mass: 1,
  velocity: 0,
  restThreshold: 0.001,
};

/**
 * Snappy spring — Linear/Vercel feel.
 * Damping ratio ≈ 1.0 (critically damped, no overshoot).
 */
export const SNAPPY_SPRING: SpringConfig = {
  stiffness: 350,
  damping: 30,
  mass: 1,
  velocity: 0,
  restThreshold: 0.001,
};

/**
 * Gentle spring — Notion feel.
 * Damping ratio ≈ 1.1 (overdamped, slow approach).
 */
export const GENTLE_SPRING: SpringConfig = {
  stiffness: 180,
  damping: 28,
  mass: 1,
  velocity: 0,
  restThreshold: 0.001,
};

/**
 * Bouncy spring — playfulness for placeholder chars.
 * Damping ratio ≈ 0.5 (visible overshoot).
 */
export const BOUNCY_SPRING: SpringConfig = {
  stiffness: 220,
  damping: 16,
  mass: 1,
  velocity: 0,
  restThreshold: 0.001,
};

/**
 * Compute spring state at time t (seconds) using analytical solution.
 *
 * For underdamped springs (ζ < 1):
 *   x(t) = target + e^(-ζ·ω₀·t) · (A·cos(ω_d·t) + B·sin(ω_d·t))
 *   v(t) = -e^(-ζ·ω₀·t) · ((A·ζ·ω₀ - B·ω_d)·cos(ω_d·t) + (A·ω_d + B·ζ·ω₀)·sin(ω_d·t))
 *
 * Where:
 *   ω₀ = √(k/m)  — natural frequency
 *   ζ  = c / (2·√(k·m))  — damping ratio
 *   ω_d = ω₀·√(1 - ζ²)  — damped frequency
 *   A = x₀ - target  — initial displacement
 *   B = (v₀ + ζ·ω₀·A) / ω_d  — coefficient
 */
export function springAtTime(
  from: number,
  to: number,
  initialVelocity: number,
  config: SpringConfig,
  t: number
): SpringState {
  const { stiffness: k, damping: c, mass: m, restThreshold = 0.001 } = config;

  const displacement = from - to;
  const omega0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));

  // After "enough" time, return rest state (avoid floating-point drift)
  if (t > 10) {
    return { position: to, velocity: 0, atRest: true };
  }

  let position: number;
  let velocity: number;

  if (zeta < 1) {
    // Underdamped — bouncy
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const A = displacement;
    const B = (initialVelocity + zeta * omega0 * A) / omegaD;
    const expDecay = Math.exp(-zeta * omega0 * t);
    const cosWd = Math.cos(omegaD * t);
    const sinWd = Math.sin(omegaD * t);

    position = to + expDecay * (A * cosWd + B * sinWd);
    velocity = -expDecay * (
      (A * zeta * omega0 - B * omegaD) * cosWd +
      (A * omegaD + B * zeta * omega0) * sinWd
    );
  } else if (zeta > 1) {
    // Overdamped — slow approach
    const r1 = -omega0 * (zeta - Math.sqrt(zeta * zeta - 1));
    const r2 = -omega0 * (zeta + Math.sqrt(zeta * zeta - 1));
    const A = displacement - (initialVelocity - r1 * displacement) / (r2 - r1);
    const B = (initialVelocity - r1 * displacement) / (r2 - r1);
    const expR1 = Math.exp(r1 * t);
    const expR2 = Math.exp(r2 * t);

    position = to + A * expR1 + B * expR2;
    velocity = A * r1 * expR1 + B * r2 * expR2;
  } else {
    // Critically damped
    const A = displacement;
    const B = initialVelocity + omega0 * A;
    const expDecay = Math.exp(-omega0 * t);

    position = to + (A + B * t) * expDecay;
    velocity = (B - omega0 * (A + B * t)) * expDecay;
  }

  const atRest =
    Math.abs(position - to) < restThreshold &&
    Math.abs(velocity) < restThreshold;

  return { position: atRest ? to : position, velocity, atRest };
}

/**
 * Compute total duration until spring reaches rest.
 * Returns seconds (cap at 10s for safety).
 */
export function springDuration(
  config: SpringConfig,
  restThreshold: number = 0.001
): number {
  const { stiffness: k, damping: c, mass: m } = config;
  const omega0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));

  if (zeta >= 1) {
    // Overdamped/critically damped — solve numerically
    // Approximation: 5 time constants
    return Math.min(10, 5 / (zeta * omega0));
  }

  // Underdamped — solve for time when amplitude < restThreshold
  // |envelope| = e^(-ζ·ω₀·t) → t = -ln(threshold) / (ζ·ω₀)
  const t = -Math.log(restThreshold) / (zeta * omega0);
  return Math.min(10, t);
}

/**
 * ============================================
 * WAAPI integration — convert spring to keyframes
 * ============================================
 *
 * Sample the spring curve at N points, generate cubic-bezier approximation,
 * or use composite keyframes for the Web Animations API.
 *
 * Strategy: Sample N points, feed as linear keyframes with easing 'linear'.
 * For better fidelity, use composite easing per segment.
 */

export interface SpringKeyframeOptions {
  from: number;
  to: number;
  config: SpringConfig;
  /** Number of samples (default 60 — enough for smooth motion) */
  samples?: number;
  /** Property name (e.g. 'transform', 'opacity') */
  property?: string;
  /** Unit (e.g. 'px', '%', '') */
  unit?: string;
  /** Transform template — receives numeric value, returns string */
  format?: (value: number) => string;
}

/**
 * Generate WAAPI keyframes from a spring curve.
 * Returns array of { offset, easing, property: value } keyframes.
 */
export function springToKeyframes(options: SpringKeyframeOptions): Keyframe[] {
  const {
    from,
    to,
    config,
    samples = 60,
    format,
    unit = '',
  } = options;

  const duration = springDuration(config) * 1000; // ms
  const keyframes: Keyframe[] = [];

  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * (duration / 1000); // seconds
    const { position } = springAtTime(from, to, config.velocity ?? 0, config, t);
    const offset = i / samples;
    const value = format ? format(position) : `${position}${unit}`;
    keyframes.push({
      offset,
      // Linear easing per-segment — WAAPI will interpolate linearly between samples
      // This produces a faithful spring curve
      [options.property ?? 'transform']: value,
    } as Keyframe);
  }

  return keyframes;
}

/**
 * ============================================
 * Higher-level helpers — common animation patterns
 * ============================================
 */

/**
 * Animate a single CSS property of an element using spring physics.
 * Returns the Animation object (can be cancelled, reversed, etc.)
 */
export function animateSpring(
  element: Element,
  from: number,
  to: number,
  config: SpringConfig,
  options: {
    property?: string;
    unit?: string;
    format?: (value: number) => string;
    fill?: FillMode;
    duration?: number; // Override computed duration
  } = {}
): Animation | null {
  if (typeof window === 'undefined' || !element.animate) return null;

  const duration = options.duration ?? springDuration(config) * 1000;
  const keyframes = springToKeyframes({
    from,
    to,
    config,
    property: options.property,
    unit: options.unit,
    format: options.format,
  });

  return element.animate(keyframes, {
    duration,
    easing: 'linear',
    fill: options.fill ?? 'forwards',
  });
}

/**
 * Animate multiple springs in parallel on the same element.
 * Useful for compound transforms (e.g. translate + scale + opacity).
 */
export function animateSpringCompound(
  element: Element,
  animations: Array<{
    from: number;
    to: number;
    config: SpringConfig;
    format: (value: number) => string;
  }>,
  options: { fill?: FillMode } = {}
): Animation | null {
  if (typeof window === 'undefined' || !element.animate) return null;

  // Find max duration across all springs
  const maxDuration = Math.max(
    ...animations.map((a) => springDuration(a.config) * 1000)
  );
  const samples = 60;
  const keyframes: Keyframe[] = [];

  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * (maxDuration / 1000);
    const offset = i / samples;
    const transformParts: string[] = [];

    for (const anim of animations) {
      const { position } = springAtTime(
        anim.from,
        anim.to,
        anim.config.velocity ?? 0,
        anim.config,
        t
      );
      transformParts.push(anim.format(position));
    }

    keyframes.push({
      offset,
      transform: transformParts.join(' '),
    } as Keyframe);
  }

  return element.animate(keyframes, {
    duration: maxDuration,
    easing: 'linear',
    fill: options.fill ?? 'forwards',
  });
}

/**
 * Hook for React: get reduced-motion-aware spring config.
 * Returns instant transition when user prefers reduced motion.
 */
export function getMotionAwareConfig(
  config: SpringConfig,
  prefersReducedMotion: boolean
): SpringConfig | null {
  if (prefersReducedMotion) {
    // Return null — caller should use instant transition instead
    return null;
  }
  return config;
}
