/**
 * HeaderAuth — React island for header auth state.
 *
 * Renders either:
 *   - "Masuk" button (when logged out) → triggers AuthModal
 *   - Avatar + dropdown menu (when logged in) → Profile, Sign out
 *
 * Mounted via client:load in Header.astro
 */
import { useEffect, useRef, useState } from 'react';
import { LogIn, User, LogOut, ChevronDown } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { AuthModal } from './AuthModal';
import { useReducedMotion } from './hooks/useReducedMotion';
import { BOUNCY_SPRING, springAtTime, springDuration } from '@/lib/spring';
import styles from './HeaderAuth.module.css';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce', storageKey: 'unduhaja-auth' },
});

export interface HeaderAuthProps {
  lang: 'id' | 'en';
  labels: {
    signin: string;
    signout: string;
    account: string;
    profile: string;
    signinTitle: string;
    signup: string;
    email: string;
    password: string;
    newPassword: string;
    signinBtn: string;
    signupBtn: string;
    sendLink: string;
    forgot: string;
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

export function HeaderAuth({ lang, labels }: HeaderAuthProps) {
  const reducedMotion = useReducedMotion();
  const [user, setUser] = useState<{ email: string; avatarUrl?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          email: session.user.email ?? '',
          avatarUrl: session.user.user_metadata?.avatar_url ?? session.user.user_metadata?.picture,
        });
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          email: session.user.email ?? '',
          avatarUrl: session.user.user_metadata?.avatar_url ?? session.user.user_metadata?.picture,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setMenuOpen(false);
    toast.success(lang === 'id' ? 'Berhasil keluar' : 'Signed out');
  };

  // Spring hover for signin button
  const handleSignInHover = (entering: boolean) => {
    if (reducedMotion) return;
    const btn = document.querySelector<HTMLButtonElement>('[data-signin-btn]');
    if (!btn) return;
    const duration = springDuration(BOUNCY_SPRING) * 1000;
    const samples = 20;
    const keyframes: Keyframe[] = [];
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * (duration / 1000);
      const scale = springAtTime(entering ? 1 : 1.05, entering ? 1.05 : 1, 0, BOUNCY_SPRING, t).position;
      keyframes.push({ offset: i / samples, transform: `scale(${scale})` });
    }
    btn.animate(keyframes, { duration, easing: 'linear', fill: 'forwards' });
  };

  if (loading) {
    return <div className={styles.placeholder} aria-hidden="true" />;
  }

  if (!user) {
    return (
      <>
        <button
          type="button"
          data-signin-btn
          className={styles.signinBtn}
          onClick={() => setModalOpen(true)}
          onMouseEnter={() => handleSignInHover(true)}
          onMouseLeave={() => handleSignInHover(false)}
        >
          <LogIn size={16} />
          <span>{labels.signin}</span>
        </button>

        <AuthModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          lang={lang}
          labels={{
            signin: labels.signin,
            signup: labels.signup,
            forgot: labels.forgot,
            email: labels.email,
            password: labels.password,
            signinBtn: labels.signinBtn,
            signupBtn: labels.signupBtn,
            sendLink: labels.sendLink,
            google: labels.google,
            noAccount: labels.noAccount,
            haveAccount: labels.haveAccount,
            forgotLink: labels.forgotLink,
            backToSignin: labels.backToSignin,
            magicSent: labels.magicSent,
            verificationSent: labels.verificationSent,
            signinSuccess: labels.signinSuccess,
            signupSuccess: labels.signupSuccess,
            passwordReset: labels.passwordReset,
            emailRequired: labels.emailRequired,
            passwordRequired: labels.passwordRequired,
            passwordTooShort: labels.passwordTooShort,
            invalidEmail: labels.invalidEmail,
            genericError: labels.genericError,
          }}
        />
      </>
    );
  }

  // Logged in — render avatar + dropdown
  const initials = user.email
    ? user.email.split('@')[0].slice(0, 2).toUpperCase()
    : 'U';

  return (
    <div ref={menuRef} className={styles.userMenu}>
      <button
        type="button"
        className={styles.avatarBtn}
        onClick={() => setMenuOpen(!menuOpen)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className={styles.avatarImg} />
        ) : (
          <span className={styles.avatarFallback}>{initials}</span>
        )}
        <ChevronDown size={14} className={`${styles.chevron} ${menuOpen ? styles.chevronOpen : ''}`} />
      </button>

      {menuOpen && (
        <div className={styles.dropdown} role="menu">
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownEmail}>{user.email}</span>
          </div>
          <button
            type="button"
            role="menuitem"
            className={styles.dropdownItem}
            onClick={() => {
              setMenuOpen(false);
              window.location.href = `/${lang}/account`;
            }}
          >
            <User size={16} />
            <span>{labels.profile}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${styles.dropdownItem} ${styles.signoutItem}`}
            onClick={handleSignOut}
          >
            <LogOut size={16} />
            <span>{labels.signout}</span>
          </button>
        </div>
      )}
    </div>
  );
}
