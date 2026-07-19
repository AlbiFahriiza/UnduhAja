/**
 * AuthModal — Enterprise-grade auth modal with tabs.
 *
 * Tabs:
 *   - signin: email + password + Google button
 *   - signup: email + password + Google button + honeypot + Turnstile
 *   - forgot: email only (sends magic link)
 *
 * Features:
 *   - Spring-animated entrance (scale + opacity)
 *   - Backdrop (solid, no blur per zero-blur policy)
 *   - Escape key closes
 *   - Click backdrop closes
 *   - Mobile responsive (full-screen)
 *   - Sonner toast notifications
 *   - Honeypot anti-bot field
 *   - Turnstile widget on signup
 */
import { useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase-browser';
import { Mail, Lock, X, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useReducedMotion } from './hooks/useReducedMotion';
import { BOUNCY_SPRING, springAtTime, springDuration } from '@/lib/spring';
import { TurnstileWidget } from './TurnstileWidget';
import styles from './AuthModal.module.css';

export type AuthTab = 'signin' | 'signup' | 'forgot';

export interface AuthModalProps {
  open: boolean;
  initialTab?: AuthTab;
  onClose: () => void;
  onAuthSuccess?: () => void;
  lang: 'id' | 'en';
  labels: {
    signin: string;
    signup: string;
    forgot: string;
    email: string;
    password: string;
    newPassword: string;
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
}

const supabase = getSupabase();
// (removed duplicate createClient)

export function AuthModal({
  open,
  initialTab = 'signin',
  onClose,
  onAuthSuccess,
  lang,
  labels,
}: AuthModalProps) {
  const reducedMotion = useReducedMotion();
  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<AuthTab>(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [honeypot, setHoneypot] = useState(''); // hidden field
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Update tab when modal opens
  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setError(null);
      setInfoMessage(null);
      setEmail('');
      setPassword('');
      setCaptchaToken(null);
      // Focus first input after modal animation
      setTimeout(() => firstInputRef.current?.focus(), 100);
    }
  }, [open, initialTab]);

  // Escape key closes modal
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [open]);

  // Spring entrance animation
  useEffect(() => {
    if (!open || !modalRef.current) return;
    if (reducedMotion) {
      modalRef.current.style.opacity = '1';
      modalRef.current.style.transform = 'none';
      return;
    }

    const element = modalRef.current;
    const duration = springDuration(BOUNCY_SPRING) * 1000;
    const samples = 40;
    const keyframes: Keyframe[] = [];

    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * (duration / 1000);
      const scale = springAtTime(0.95, 1, 0, BOUNCY_SPRING, t).position;
      const opacity = Math.min(1, i / (samples * 0.4));
      keyframes.push({
        offset: i / samples,
        transform: `scale(${scale})`,
        opacity,
      });
    }

    const anim = element.animate(keyframes, {
      duration,
      easing: 'linear',
      fill: 'forwards',
    });
    return () => anim.cancel();
  }, [open, reducedMotion]);

  if (!open) return null;

  const validateEmail = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (!email) {
      setError(labels.emailRequired);
      return;
    }
    if (!validateEmail(email)) {
      setError(labels.invalidEmail);
      return;
    }

    setLoading(true);

    try {
      if (tab === 'signin') {
        if (!password) {
          setError(labels.passwordRequired);
          setLoading(false);
          return;
        }
        // Captcha required by Supabase Auth (Attack Protection enabled)
        if (!captchaToken) {
          setError(lang === 'id' ? 'Selesaikan verifikasi captcha dulu' : 'Please complete captcha verification first');
          setLoading(false);
          return;
        }
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken },
        });
        if (signInError) {
          setError(signInError.message);
          setLoading(false);
          return;
        }
        toast.success(labels.signinSuccess);
        onAuthSuccess?.();
        onClose();
      } else if (tab === 'signup') {
        if (!password) {
          setError(labels.passwordRequired);
          setLoading(false);
          return;
        }
        if (password.length < 8) {
          setError(labels.passwordTooShort);
          setLoading(false);
          return;
        }
        // Captcha required by Supabase Auth (Attack Protection enabled)
        if (!captchaToken) {
          setError(lang === 'id' ? 'Selesaikan verifikasi captcha dulu' : 'Please complete captcha verification first');
          setLoading(false);
          return;
        }
        // Honeypot check (silent reject for bots)
        if (honeypot) {
          // Pretend success to confuse bot
          setInfoMessage(labels.verificationSent);
          setLoading(false);
          return;
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/api/auth/callback`,
            captchaToken,
          },
        });
        if (signUpError) {
          setError(signUpError.message);
          setLoading(false);
          return;
        }
        if (data.session) {
          // Auto-login (no verification needed)
          toast.success(labels.signupSuccess);
          onAuthSuccess?.();
          onClose();
        } else {
          setInfoMessage(labels.verificationSent);
          setEmail('');
          setPassword('');
        }
      } else if (tab === 'forgot') {
        // Captcha required by Supabase Auth (Attack Protection enabled)
        if (!captchaToken) {
          setError(lang === 'id' ? 'Selesaikan verifikasi captcha dulu' : 'Please complete captcha verification first');
          setLoading(false);
          return;
        }
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/id/auth/reset-password`,
          captchaToken,
        });
        if (resetError) {
          setError(resetError.message);
          setLoading(false);
          return;
        }
        setInfoMessage(labels.magicSent);
        setEmail('');
      }
    } catch (err) {
      setError(labels.genericError);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
    // No setLoading(false) — page will redirect
  };

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div ref={modalRef} className={styles.modal} style={{ opacity: 0 }}>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className={styles.header}>
          <h2 id="auth-modal-title" className={styles.title}>
            {tab === 'signin' && labels.signin}
            {tab === 'signup' && labels.signup}
            {tab === 'forgot' && labels.forgot}
          </h2>
        </div>

        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'signin'}
            className={`${styles.tab} ${tab === 'signin' ? styles.tabActive : ''}`}
            onClick={() => { setTab('signin'); setError(null); setInfoMessage(null); }}
          >
            {labels.signin}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'signup'}
            className={`${styles.tab} ${tab === 'signup' ? styles.tabActive : ''}`}
            onClick={() => { setTab('signup'); setError(null); setInfoMessage(null); }}
          >
            {labels.signup}
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Honeypot — hidden from real users */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
            aria-hidden="true"
          />

          <div className={styles.field}>
            <label htmlFor="auth-email" className={styles.label}>{labels.email}</label>
            <div className={styles.inputWrap}>
              <Mail size={18} className={styles.inputIcon} aria-hidden="true" />
              <input
                ref={firstInputRef}
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.input}
                placeholder={labels.email}
                disabled={loading}
                dir="ltr"
              />
            </div>
          </div>

          {tab !== 'forgot' && (
            <div className={styles.field}>
              <label htmlFor="auth-password" className={styles.label}>
                {tab === 'signup' ? labels.password : labels.password}
              </label>
              <div className={styles.inputWrap}>
                <Lock size={18} className={styles.inputIcon} aria-hidden="true" />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={styles.input}
                  placeholder={labels.password}
                  disabled={loading}
                  dir="ltr"
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {tab === 'signup' && (
                <p className={styles.hint}>Min. 8 karakter</p>
              )}
            </div>
          )}

          {tab === 'signin' && (
            <button
              type="button"
              className={styles.forgotLink}
              onClick={() => { setTab('forgot'); setError(null); setInfoMessage(null); }}
            >
              {labels.forgotLink}
            </button>
          )}

          {error && (
            <div className={styles.alert} role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {infoMessage && (
            <div className={`${styles.alert} ${styles.alertInfo}`} role="status">
              <CheckCircle2 size={16} />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Cloudflare Turnstile — required by Supabase Attack Protection */}
          <TurnstileWidget
            onVerify={(token) => setCaptchaToken(token)}
            onExpire={() => setCaptchaToken(null)}
            onError={() => setCaptchaToken(null)}
          />

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading || !captchaToken}
          >
            {loading && <Loader2 size={18} className={styles.spinner} />}
            <span>
              {tab === 'signin' && labels.signinBtn}
              {tab === 'signup' && labels.signupBtn}
              {tab === 'forgot' && labels.sendLink}
            </span>
          </button>

          {tab === 'forgot' && (
            <button
              type="button"
              className={styles.backLink}
              onClick={() => { setTab('signin'); setError(null); setInfoMessage(null); }}
            >
              {labels.backToSignin}
            </button>
          )}

          {tab !== 'forgot' && (
            <>
              <div className={styles.divider}>
                <span>{lang === 'id' ? 'atau' : 'or'}</span>
              </div>

              <button
                type="button"
                className={styles.googleBtn}
                onClick={handleGoogle}
                disabled={loading}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
                  <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
                </svg>
                <span>{labels.google}</span>
              </button>
            </>
          )}

          {tab === 'signin' && (
            <p className={styles.footerText}>
              {labels.noAccount}{' '}
              <button
                type="button"
                className={styles.switchLink}
                onClick={() => { setTab('signup'); setError(null); setInfoMessage(null); }}
              >
                {labels.signup}
              </button>
            </p>
          )}
          {tab === 'signup' && (
            <p className={styles.footerText}>
              {labels.haveAccount}{' '}
              <button
                type="button"
                className={styles.switchLink}
                onClick={() => { setTab('signin'); setError(null); setInfoMessage(null); }}
              >
                {labels.signin}
              </button>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
