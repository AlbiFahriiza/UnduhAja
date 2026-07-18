/**
 * VideoPreview — Enterprise-grade video preview card.
 *
 * Layout (desktop): horizontal split — thumbnail/video on left, metadata on right.
 * Layout (mobile): vertical stack — thumbnail top, metadata below.
 *
 * Includes:
 *   - Embedded video player (paused by default, custom poster)
 *   - Title, channel/creator with verified badge
 *   - View count, duration, upload date
 *   - Short description (truncated with "Read more")
 *   - TikTok-specific: music info
 *
 * Spring entrance animation: card slides up + scales in (subtle).
 */
import { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  Calendar,
  Clock,
  Eye,
  Music2,
  Play,
  User,
} from 'lucide-react';
import { useReducedMotion } from './hooks/useReducedMotion';
import { GENTLE_SPRING, springAtTime, springDuration } from '@/lib/spring';
import styles from './VideoPreview.module.css';

export interface VideoMetadata {
  platform: 'youtube' | 'tiktok';
  videoId: string;
  title: string;
  description: string;
  channel: string;
  channelVerified?: boolean;
  channelAvatar?: string;
  thumbnail: string;
  duration?: string; // ISO 8601 or "MM:SS"
  viewCount?: number;
  uploadDate?: string; // ISO date
  // TikTok-specific
  music?: string;
  // YouTube-specific
  embedUrl?: string;
}

export interface VideoPreviewProps {
  metadata: VideoMetadata;
  lang: 'id' | 'en';
  labels: {
    views: string;
    duration: string;
    uploaded: string;
    channel: string;
    creator: string;
    description: string;
    music: string;
    noDescription: string;
    playVideo: string;
    verified: string;
  };
}

function formatViews(views: number | undefined, lang: 'id' | 'en', label: string): string {
  if (!views) return '';
  let formatted: string;
  if (lang === 'id') {
    if (views >= 1_000_000) formatted = `${(views / 1_000_000).toFixed(1).replace('.', ',')} jt`;
    else if (views >= 1_000) formatted = `${(views / 1_000).toFixed(1).replace('.', ',')} rb`;
    else formatted = String(views);
  } else {
    if (views >= 1_000_000) formatted = `${(views / 1_000_000).toFixed(1)}M`;
    else if (views >= 1_000) formatted = `${(views / 1_000).toFixed(1)}K`;
    else formatted = String(views);
  }
  return `${formatted} ${label}`;
}

function formatDate(isoDate: string | undefined, lang: 'id' | 'en'): string {
  if (!isoDate) return '';
  try {
    const date = new Date(isoDate);
    return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return '';
  }
}

function formatDuration(duration: string | undefined): string {
  if (!duration) return '';
  // Already in MM:SS or HH:MM:SS format from API
  if (/^\d+:\d+/.test(duration)) return duration;
  // ISO 8601 (PT1H2M3S)
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return duration;
  const [, h, m, s] = match;
  const parts = [h, m, s].filter(Boolean).map((n) => String(n).padStart(2, '0'));
  return parts.join(':');
}

export function VideoPreview({ metadata, lang, labels }: VideoPreviewProps) {
  const reducedMotion = useReducedMotion();
  const cardRef = useRef<HTMLElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Spring entrance animation
  useEffect(() => {
    if (!cardRef.current) return;

    if (reducedMotion) {
      cardRef.current.style.opacity = '1';
      cardRef.current.style.transform = 'none';
      return;
    }

    const element = cardRef.current;
    const duration = springDuration(GENTLE_SPRING) * 1000;
    const samples = 50;
    const keyframes: Keyframe[] = [];

    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * (duration / 1000);
      const offsetY = springAtTime(24, 0, 0, GENTLE_SPRING, t).position;
      const scale = springAtTime(0.96, 1, 0, GENTLE_SPRING, t).position;
      const opacity = Math.min(1, i / (samples * 0.4));
      keyframes.push({
        offset: i / samples,
        transform: `translateY(${offsetY}px) scale(${scale})`,
        opacity,
      });
    }

    const anim = element.animate(keyframes, {
      duration,
      easing: 'linear',
      fill: 'forwards',
    });

    return () => anim.cancel();
  }, [reducedMotion]);

  const handlePlayClick = () => {
    setIsPlaying(true);
  };

  const isYouTube = metadata.platform === 'youtube';
  const isTikTok = metadata.platform === 'tiktok';

  return (
    <article ref={cardRef} className={styles.card} style={{ opacity: 0 }}>
      <div className={styles.mediaSection}>
        <div className={styles.playerWrap}>
          {isYouTube && metadata.embedUrl && isPlaying ? (
            <iframe
              src={`${metadata.embedUrl}?autoplay=1&rel=0`}
              className={styles.iframe}
              title={metadata.title}
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              className={styles.poster}
              onClick={handlePlayClick}
              aria-label={labels.playVideo}
            >
              <img
                src={metadata.thumbnail}
                alt={metadata.title}
                className={styles.thumbnail}
                loading="lazy"
              />
              <span className={styles.playButton}>
                <Play size={28} fill="currentColor" />
              </span>
              {metadata.duration && (
                <span className={styles.durationBadge}>
                  {formatDuration(metadata.duration)}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      <div className={styles.infoSection}>
        <div className={styles.header}>
          <h3 className={styles.title}>{metadata.title}</h3>
          <span className={styles.platformBadge} data-platform={metadata.platform}>
            {isYouTube ? 'YouTube' : 'TikTok'}
          </span>
        </div>

        <div className={styles.metaRow}>
          <div className={styles.creator}>
            {metadata.channelAvatar ? (
              <img
                src={metadata.channelAvatar}
                alt=""
                className={styles.avatar}
                loading="lazy"
              />
            ) : (
              <div className={styles.avatarPlaceholder}>
                <User size={18} />
              </div>
            )}
            <div className={styles.creatorInfo}>
              <span className={styles.creatorName}>
                {metadata.channel}
                {metadata.channelVerified && (
                  <BadgeCheck
                    size={16}
                    className={styles.verified}
                    aria-label={labels.verified}
                  />
                )}
              </span>
              <span className={styles.creatorLabel}>
                {isTikTok ? labels.creator : labels.channel}
              </span>
            </div>
          </div>

          <div className={styles.stats}>
            {metadata.viewCount !== undefined && (
              <span className={styles.stat} title={`${metadata.viewCount.toLocaleString()} ${labels.views}`}>
                <Eye size={14} />
                {formatViews(metadata.viewCount, lang, labels.views)}
              </span>
            )}
            {metadata.duration && (
              <span className={styles.stat}>
                <Clock size={14} />
                {formatDuration(metadata.duration)}
              </span>
            )}
            {metadata.uploadDate && (
              <span className={styles.stat}>
                <Calendar size={14} />
                {formatDate(metadata.uploadDate, lang)}
              </span>
            )}
          </div>
        </div>

        {isTikTok && metadata.music && (
          <div className={styles.musicRow}>
            <Music2 size={14} />
            <span className={styles.musicText}>{metadata.music}</span>
          </div>
        )}

        <div className={styles.description}>
          <h4 className={styles.descriptionTitle}>{labels.description}</h4>
          <p className={`${styles.descriptionText} ${isExpanded ? styles.expanded : ''}`}>
            {metadata.description || labels.noDescription}
          </p>
          {metadata.description && metadata.description.length > 200 && (
            <button
              type="button"
              className={styles.readMore}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
