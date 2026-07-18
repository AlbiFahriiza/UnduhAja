/**
 * EmptyState — Illustrated empty/error state.
 *
 * Used for:
 *   - TikTok private video
 *   - Video deleted
 *   - Age-restricted content
 *   - Live stream not supported
 */
import { SearchX } from 'lucide-react';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: 'default' | 'error' | 'warning';
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  variant = 'default',
}: EmptyStateProps) {
  return (
    <div className={`${styles.container} ${styles[`variant--${variant}`]}`}>
      <div className={styles.iconWrap}>
        {icon ?? <SearchX size={32} />}
      </div>
      <div className={styles.content}>
        <h3 className={styles.title}>{title}</h3>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actionLabel && onAction && (
        <button type="button" className={styles.action} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
