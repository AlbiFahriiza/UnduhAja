/**
 * RateLimitBadge — Displays current rate limit status to user.
 *
 * Shows:
 *   - Guest mode: "Mode tamu: 5 unduh/jam · Sisa: 3"
 *   - Authenticated: "Mode login: 50 unduh/jam · Sisa: 47"
 *   - With CTA button if guest: "Masuk untuk limit lebih longgar"
 */
import { User, Zap, LogIn } from 'lucide-react';
import styles from './RateLimitBadge.module.css';

export interface RateLimitBadgeProps {
  isAuthenticated: boolean;
  remaining: number | null;
  limit: number;
  lang: 'id' | 'en';
  onSignInClick?: () => void;
}

export function RateLimitBadge({
  isAuthenticated,
  remaining,
  limit,
  lang,
  onSignInClick,
}: RateLimitBadgeProps) {
  const isID = lang === 'id';
  const remainingText = remaining !== null
    ? `${isID ? 'Sisa' : 'Remaining'}: ${remaining}`
    : null;

  return (
    <div className={`${styles.badge} ${isAuthenticated ? styles.badgeUser : styles.badgeGuest}`}>
      <div className={styles.info}>
        {isAuthenticated ? (
          <User size={14} className={styles.icon} />
        ) : (
          <Zap size={14} className={styles.icon} />
        )}
        <span className={styles.label}>
          {isAuthenticated
            ? (isID ? 'Mode login' : 'Logged in')
            : (isID ? 'Mode tamu' : 'Guest mode')}
        </span>
        <span className={styles.limit}>
          {limit} {isID ? 'unduh/jam' : 'downloads/hr'}
        </span>
        {remainingText && (
          <>
            <span className={styles.separator}>·</span>
            <span className={styles.remaining}>{remainingText}</span>
          </>
        )}
      </div>

      {!isAuthenticated && onSignInClick && (
        <button
          type="button"
          className={styles.cta}
          onClick={onSignInClick}
        >
          <LogIn size={12} />
          <span>{isID ? 'Masuk' : 'Sign in'}</span>
        </button>
      )}
    </div>
  );
}
