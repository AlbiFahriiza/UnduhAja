/**
 * VideoPreview — Enterprise-grade video preview card.
 *
 * Enhanced:
 *   - Clean layout with proper aspect ratio (16:9 thumbnail)
 *   - Description renders HTML + markdown (URLs clickable, line breaks, hashtags)
 *   - Better metadata hierarchy
 *   - Smooth entrance animation
 *   - Thumbnail blur-up loading
 *   - TikTok external link fallback
 *   - Mobile-optimized vertical stack
 *   - Scrollable info section on desktop
 */
import { useEffect, useRef, useState, useMemo } from 'react';
import {
  BadgeCheck,
  Calendar,
  Clock,
  Eye,
  ExternalLink,
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
  duration?: string;
  viewCount?: number;
  uploadDate?: string;
  music?: string;
  embedUrl?: string;
  sourceUrl?: string;
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
  if (!views || views <= 0) return '';
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

/**
 * Render description with HTML + markdown support.
 * - Escapes HTML entities first (security)
 * - Converts \n to <br>
 * - Converts URLs to clickable links
 * - Converts hashtags to styled spans
 */
function renderDescription(desc: string): string {
  if (!desc) return '';

  // Step 1: Escape HTML to prevent XSS
  let html = desc
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // Step 2: Convert URLs to clickable links
  html = html.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Step 3: Convert hashtags to styled spans
  html = html.replace(
    /(^|\s)(#[\w]+)/g,
    '$1<span class="hashtag">$2</span>'
  );

  // Step 4: Convert line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}

export function VideoPreview({ metadata, lang, labels }: VideoPreviewProps) {
  const reducedMotion = useReducedMotion();
  const cardRef = useRef<HTMLElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [thumbLoaded, setThumbLoaded] = useState(false);

  const renderedDesc = useMemo(() => renderDescription(metadata.description), [metadata.description]);
  const hasLongDesc = metadata.description && metadata.description.length > 150;

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
      const offsetY = springAtTime(20, 0, 0, GENTLE_SPRING, t).position;
      const opacity = Math.min(1, i / (samples * 0.3));
      keyframes.push({
        offset: i / samples,
        transform: `translateY(${offsetY}px)`,
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

  const handlePlayClick = () => setIsPlaying(true);
  const isYouTube = metadata.platform === 'youtube';
  const isTikTok = metadata.platform === 'tiktok';

  return (
    <article ref={cardRef} className={styles.card} style={{ opacity: 0 }}>
      {/* Media Section — 16:9 aspect ratio */}
      <div className={styles.mediaSection}>
        {isYouTube && metadata.embedUrl && isPlaying ? (
          <iframe
            src={`${metadata.embedUrl}?autoplay=1&rel=0&modestbranding=1`}
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
              className={`${styles.thumbnail} ${thumbLoaded ? styles.thumbnailLoaded : styles.thumbnailLoading}`}
              loading="eager"
              onLoad={() => setThumbLoaded(true)}
              onError={() => setThumbLoaded(true)}
            />
            <span className={styles.playButton}>
              <Play size={28} fill="currentColor" />
            </span>
            {metadata.duration && (
              <span className={styles.durationBadge}>
                {formatDuration(metadata.duration)}
              </span>
            )}
            {isTikTok && metadata.sourceUrl && (
              <a
                href={metadata.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.tiktokFallback}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={12} />
                <span>{lang === 'id' ? 'Buka di TikTok' : 'Open in TikTok'}</span>
              </a>
            )}
          </button>
        )}
      </div>

      {/* Info Section */}
      <div className={styles.infoSection}>
        {/* Title + Platform Badge */}
        <div className={styles.header}>
          <h3 className={styles.title}>{metadata.title}</h3>
          <span className={styles.platformBadge} data-platform={metadata.platform}>
            {isYouTube ? 'YouTube' : 'TikTok'}
          </span>
        </div>

        {/* Creator + Stats */}
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
            {metadata.viewCount !== undefined && metadata.viewCount > 0 && (
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

        {/* Music (TikTok) */}
        {isTikTok && metadata.music && (
          <div className={styles.musicRow}>
            <Music2 size={14} />
            <span className={styles.musicText}>{metadata.music}</span>
          </div>
        )}

        {/* Description — renders HTML + markdown */}
        <div className={styles.description}>
          <h4 className={styles.descriptionTitle}>{labels.description}</h4>
          <div
            className={`${styles.descriptionText} ${isExpanded ? styles.expanded : ''}`}
            dangerouslySetInnerHTML={{ __html: renderedDesc || labels.noDescription }}
          />
          {hasLongDesc && (
            <button
              type="button"
              className={styles.readMore}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded
                ? (lang === 'id' ? 'Tampilkan lebih sedikit' : 'Show less')
                : (lang === 'id' ? 'Baca selengkapnya' : 'Read more')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
