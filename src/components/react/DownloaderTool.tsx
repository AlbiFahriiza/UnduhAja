/**
 * DownloaderTool — Main React island orchestrating the entire download flow.
 *
 * Flow:
 *   1. User pastes/types URL → UrlInput
 *   2. Auto-scan triggered → POST /api/extract
 *   3. Loading state (skeleton preview)
 *   4. Metadata received → VideoPreview + QualityDropdown + DownloadButton
 *   5. User clicks Download → POST /api/download → file stream
 *   6. Success toast + auto file save
 *   7. Manual fallback link if auto-download times out (8s)
 *
 * State machine:
 *   - input phase: idle, scanning, invalid, error
 *   - download phase: idle, loading, success, error
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase, type Session } from '@/lib/supabase-browser';
import { UrlInput, type UrlInputStatus } from './UrlInput';
import { VideoPreview, type VideoMetadata } from './VideoPreview';
import {
  QualityDropdown,
  type QualityOption,
  type QualityTab,
} from './QualityDropdown';
import { DownloadButton, type DownloadStatus } from './DownloadButton';
import { EmptyState } from './EmptyState';
import { RateLimitBadge } from './RateLimitBadge';
import { TurnstileWidget } from './TurnstileWidget';
import { AuthModal } from './AuthModal';
import { Toaster, toast as sonnerToast } from 'sonner';
import styles from './DownloaderTool.module.css';

// Supabase client (singleton, browser-only)


const supabase = getSupabase();
// (removed duplicate createClient)

export interface DownloaderToolProps {
  lang: 'id' | 'en';
  translations: {
    input: {
      placeholder: string;
      placeholderTikTok: string;
      placeholderYouTube: string;
      paste: string;
      scan: string;
      scanning: string;
      clear: string;
      invalid: string;
      unsupported: string;
      dragDrop: string;
    };
    preview: {
      verified: string;
      views: string;
      duration: string;
      uploaded: string;
      channel: string;
      creator: string;
      description: string;
      music: string;
      noDescription: string;
      playVideo: string;
      private: string;
      deleted: string;
      ageRestricted: string;
      tryAnother: string;
    };
    quality: {
      label: string;
      video: string;
      audio: string;
      selectQuality: string;
      default: string;
      best: string;
      available: string;
    };
    download: {
      button: string;
      processing: string;
      downloading: string;
      success: string;
      error: string;
      retry: string;
      manualFallback: string;
    };
    errors: {
      rateLimited: string;
      networkError: string;
      serverError: string;
      videoTooLarge: string;
      invalidUrl: string;
      unsupportedUrl: string;
      videoNotFound: string;
      videoPrivate: string;
      videoDeleted: string;
      ageRestricted: string;
      liveStream: string;
      playlistNotSupported: string;
    };
    toast: {
      downloadStarted: string;
      downloadComplete: string;
      downloadFailed: string;
      copied: string;
    };
    auth: {
      signin: string;
      signup: string;
      forgot: string;
      email: string;
      password: string;
      signinBtn: string;
      signupBtn: string;
      sendLink: string;
      google: string;
      noAccount: string;
      haveAccount: string;
      forgotLink: string;
      backToSignin: string;
      magicSent: string;
      verificationSent: string;
      signinSuccess: string;
      signupSuccess: string;
      passwordReset: string;
      emailRequired: string;
      passwordRequired: string;
      passwordTooShort: string;
      invalidEmail: string;
      genericError: string;
    };
  };
}

type ToolStatus =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'ready'; metadata: VideoMetadata }
  | { kind: 'error'; code: keyof DownloaderToolProps['translations']['errors'] };

export function DownloaderTool({ lang, translations }: DownloaderToolProps) {
  return (
    <>
      <DownloaderToolInner lang={lang} translations={translations} />
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          duration: 4000,
          style: {
            fontFamily: 'var(--font-sans)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            boxShadow: 'var(--shadow-lg)',
          },
        }}
      />
    </>
  );
}

function DownloaderToolInner({ lang, translations }: DownloaderToolProps) {
  // Sonner is called globally — no hook needed
  const toast = sonnerToast;
  const resultRef = useRef<HTMLDivElement>(null);

  const [url, setUrl] = useState('');
  const [inputStatus, setInputStatus] = useState<UrlInputStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [toolStatus, setToolStatus] = useState<ToolStatus>({ kind: 'idle' });

  // Quality state
  const [activeTab, setActiveTab] = useState<QualityTab>('video');
  const [selectedVideoId, setSelectedVideoId] = useState('1080p60');
  const [selectedAudioId, setSelectedAudioId] = useState('mp3');
  const [videoQualities, setVideoQualities] = useState<QualityOption[]>(getDefaultVideoQualities());
  const [audioFormats, setAudioFormats] = useState<QualityOption[]>(getDefaultAudioFormats());

  // Download state
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('disabled');
  const [manualFallbackUrl, setManualFallbackUrl] = useState<string | null>(null);

  // Auth state
  const [session, setSession] = useState<Session | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Rate limit state
  const [rateLimitRemaining, setRateLimitRemaining] = useState<number | null>(null);
  const [rateLimitLimit, setRateLimitLimit] = useState<number>(5);
  const [showTurnstile, setShowTurnstile] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  // Subscribe to auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) setAuthModalOpen(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Update rate limit based on auth state
  useEffect(() => {
    setRateLimitLimit(session ? 50 : 5);
    setRateLimitRemaining(session ? 50 : 5);
  }, [session]);

  // Reset quality when new metadata arrives
  useEffect(() => {
    if (toolStatus.kind !== 'ready') return;

    const metadata = toolStatus.metadata;
    // Filter available qualities based on metadata
    const available = metadata.availableQualities ?? ['1080p60', '1080p', '720p60', '720p', '480p', '360p', '240p', '144p'];
    const newVideoQualities = getDefaultVideoQualities().map((q) => ({
      ...q,
      available: available.includes(q.id),
    }));
    setVideoQualities(newVideoQualities);

    // Reset selected if not available
    if (!newVideoQualities.find((q) => q.id === selectedVideoId && q.available)) {
      const firstAvailable = newVideoQualities.find((q) => q.available);
      if (firstAvailable) setSelectedVideoId(firstAvailable.id);
    }

    setDownloadStatus('idle');
  }, [toolStatus]);

  // ============================================
  // URL validation + extract
  // ============================================
  const detectPlatform = (url: string): 'youtube' | 'tiktok' | null => {
    const trimmed = url.trim();
    if (!trimmed) return null;
    const ytPatterns = [
      /^https?:\/\/(www\.)?youtube\.com\/watch\?v=/i,
      /^https?:\/\/youtu\.be\//i,
      /^https?:\/\/(www\.)?youtube\.com\/shorts\//i,
      /^https?:\/\/(www\.)?youtube\.com\/embed\//i,
    ];
    if (ytPatterns.some((p) => p.test(trimmed))) {
      // Reject playlists
      if (/[?&]list=/i.test(trimmed)) return null;
      return 'youtube';
    }
    const ttPatterns = [
      /^https?:\/\/(www\.)?tiktok\.com\//i,
      /^https?:\/\/vm\.tiktok\.com\//i,
      /^https?:\/\/vt\.tiktok\.com\//i,
    ];
    if (ttPatterns.some((p) => p.test(trimmed))) return 'tiktok';
    return null;
  };

  const handleSubmit = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    const platform = detectPlatform(trimmed);
    if (!platform) {
      setInputStatus('invalid');
      setErrorMessage(translations.errors.unsupportedUrl);
      return;
    }

    setInputStatus('scanning');
    setToolStatus({ kind: 'scanning' });
    setErrorMessage('');

    try {
      // Get auth token if available
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Call Supabase Edge Function directly
      const sbUrl = import.meta.env.PUBLIC_SUPABASE_URL;
      const sbKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

      const res = await fetch(`${sbUrl}/functions/v1/extract`, {
        method: 'POST',
        headers: {
          ...headers,
          apikey: sbKey,
        },
        body: JSON.stringify({ url: trimmed }),
      });

      // Update rate limit info from headers
      const remaining = res.headers.get('X-RateLimit-Remaining');
      const limit = res.headers.get('X-RateLimit-Limit');
      if (remaining) setRateLimitRemaining(parseInt(remaining, 10));
      if (limit) setRateLimitLimit(parseInt(limit, 10));

      const data = await res.json();

      if (!res.ok) {
        const errorCode = (data.error ?? 'serverError') as keyof typeof translations.errors;
        setInputStatus('invalid');
        setErrorMessage(translations.errors[errorCode] ?? translations.errors.serverError);
        setToolStatus({ kind: 'error', code: errorCode });

        // Show Turnstile if rate limited
        if (res.status === 429 && !session) {
          setShowTurnstile(true);
          toast.warning(lang === 'id' ? 'Verifikasi diperlukan' : 'Verification required');
        }
        return;
      }

      setInputStatus('valid');
      setToolStatus({ kind: 'ready', metadata: data.metadata });
      // Scroll result into view
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } catch (err) {
      setInputStatus('invalid');
      setErrorMessage(translations.errors.networkError);
      setToolStatus({ kind: 'error', code: 'networkError' });
    }
  }, [url, translations]);

  // ============================================
  // Download
  // ============================================
  const handleDownload = useCallback(async () => {
    if (toolStatus.kind !== 'ready') return;

    setDownloadStatus('loading');
    setManualFallbackUrl(null);

    const metadata = toolStatus.metadata;
    const formatId = activeTab === 'video' ? selectedVideoId : selectedAudioId;

    try {
      // Construct download URL — backend streams the file
      const params = new URLSearchParams({
        url: metadata.sourceUrl,
        format: formatId,
        type: activeTab,
      });
      const downloadUrl = `/api/download?${params.toString()}`;

      // Set fallback URL (in case auto-download fails)
      setManualFallbackUrl(downloadUrl);

      // Trigger download via hidden anchor
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${metadata.title.substring(0, 80).replace(/[^\w\s-]/g, '').trim()}.${activeTab === 'audio' ? selectedAudioId : 'mp4'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast.info(translations.toast.downloadStarted);

      // Brief loading state, then success (file dialog handled by browser)
      setTimeout(() => {
        setDownloadStatus('success');
        toast.success(translations.toast.downloadComplete);
        // Reset to idle after 3s
        setTimeout(() => setDownloadStatus('idle'), 3000);
      }, 1500);
    } catch (err) {
      setDownloadStatus('error');
      toast.error(translations.toast.downloadFailed, {
        description: translations.errors.networkError,
      });
    }
  }, [toolStatus, activeTab, selectedVideoId, selectedAudioId, toast, translations]);

  const handleRetry = useCallback(() => {
    setDownloadStatus('idle');
    handleDownload();
  }, [handleDownload]);

  // ============================================
  // Render
  // ============================================
  return (
    <div className={styles.tool}>
      <UrlInput
        value={url}
        onChange={(v) => {
          setUrl(v);
          if (inputStatus !== 'idle') {
            setInputStatus('idle');
            setErrorMessage('');
          }
          if (toolStatus.kind !== 'idle') {
            setToolStatus({ kind: 'idle' });
          }
        }}
        onSubmit={handleSubmit}
        status={inputStatus}
        errorMessage={errorMessage}
        lang={lang}
        placeholder={translations.input.placeholder}
        placeholderTikTok={translations.input.placeholderTikTok}
        placeholderYouTube={translations.input.placeholderYouTube}
        invalidMessage={translations.input.invalid}
        unsupportedMessage={translations.input.unsupported}
        scanLabel={translations.input.scan}
        scanningLabel={translations.input.scanning}
        clearLabel={translations.input.clear}
        pasteLabel={translations.input.paste}
        dragDropLabel={translations.input.dragDrop}
      />

      <RateLimitBadge
        isAuthenticated={!!session}
        remaining={rateLimitRemaining}
        limit={rateLimitLimit}
        lang={lang}
        onSignInClick={() => setAuthModalOpen(true)}
      />

      {showTurnstile && !session && (
        <div className={styles.turnstileWrap}>
          <p className={styles.turnstileHint}>
            {lang === 'id'
              ? 'Verifikasi bahwa kamu bukan bot untuk melanjutkan'
              : 'Verify you are not a bot to continue'}
          </p>
          <TurnstileWidget
            onVerify={(token) => {
              setTurnstileToken(token);
              // After verification, retry pending action if any
              if (pendingAction) {
                pendingAction();
                setPendingAction(null);
              }
              setShowTurnstile(false);
            }}
          />
        </div>
      )}

      <div ref={resultRef} className={styles.resultArea}>
        {toolStatus.kind === 'scanning' && <PreviewSkeleton />}

        {toolStatus.kind === 'ready' && (
          <div className={styles.resultContent}>
            <VideoPreview
              metadata={toolStatus.metadata}
              lang={lang}
              labels={translations.preview}
            />

            <div className={styles.optionsRow}>
              <QualityDropdown
                videoQualities={videoQualities}
                audioFormats={audioFormats}
                defaultVideoId="1080p60"
                defaultAudioId="mp3"
                selectedTab={activeTab}
                selectedVideoId={selectedVideoId}
                selectedAudioId={selectedAudioId}
                onTabChange={setActiveTab}
                onVideoSelect={setSelectedVideoId}
                onAudioSelect={setSelectedAudioId}
                labels={translations.quality}
              />

              <DownloadButton
                status={downloadStatus}
                onClick={handleDownload}
                onRetry={handleRetry}
                manualFallbackUrl={manualFallbackUrl}
                labels={translations.download}
              />
            </div>
          </div>
        )}

        {toolStatus.kind === 'error' && (
          <EmptyState
            variant="error"
            title={translations.errors[toolStatus.code]}
            description={translations.preview.tryAnother}
            actionLabel={translations.preview.tryAnother}
            onAction={() => {
              setUrl('');
              setInputStatus('idle');
              setToolStatus({ kind: 'idle' });
            }}
          />
        )}
      </div>

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        lang={lang}
        labels={translations.auth}
      />
    </div>
  );
}

// ============================================
// Default quality options
// ============================================
function getDefaultVideoQualities(): QualityOption[] {
  return [
    { id: '1080p60', label: '1080p', sublabel: '60 FPS · Full HD', available: true },
    { id: '1080p', label: '1080p', sublabel: '30 FPS · Full HD', available: true },
    { id: '720p60', label: '720p', sublabel: '60 FPS · HD', available: true },
    { id: '720p', label: '720p', sublabel: '30 FPS · HD', available: true },
    { id: '480p', label: '480p', sublabel: '30 FPS · SD', available: true },
    { id: '360p', label: '360p', sublabel: '30 FPS', available: true },
    { id: '240p', label: '240p', sublabel: '30 FPS', available: true },
    { id: '144p', label: '144p', sublabel: '30 FPS', available: true },
  ];
}

function getDefaultAudioFormats(): QualityOption[] {
  return [
    { id: 'mp3', label: 'MP3', sublabel: '320 kbps', available: true },
    { id: 'm4a', label: 'M4A', sublabel: '256 kbps · AAC', available: true },
  ];
}

// ============================================
// Preview Skeleton
// ============================================
function PreviewSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <div className={styles.skeletonMedia} />
      <div className={styles.skeletonInfo}>
        {/* Title */}
        <div className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
        <div className={`${styles.skeletonLine} ${styles.skeletonTitleSecond}`} />

        {/* Meta row: avatar + creator + stats */}
        <div className={styles.skeletonMetaRow}>
          <div className={styles.skeletonAvatar} />
          <div>
            <div className={`${styles.skeletonLine} ${styles.skeletonCreatorName}`} />
            <div className={`${styles.skeletonLine} ${styles.skeletonCreatorLabel}`} />
          </div>
          <div className={styles.skeletonStats}>
            <div className={`${styles.skeletonLine} ${styles.skeletonStat}`} />
            <div className={`${styles.skeletonLine} ${styles.skeletonStat}`} />
            <div className={`${styles.skeletonLine} ${styles.skeletonStat}`} />
          </div>
        </div>

        {/* Description */}
        <div className={`${styles.skeletonLine} ${styles.skeletonDescTitle}`} />
        <div className={`${styles.skeletonLine} ${styles.skeletonDescLine}`} />
        <div className={`${styles.skeletonLine} ${styles.skeletonDescLine}`} />
        <div className={`${styles.skeletonLine} ${styles.skeletonDescLineShort}`} />
      </div>
    </div>
  );
}
