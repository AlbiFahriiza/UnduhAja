/**
 * AccountDashboard — React island for user account page.
 *
 * Features:
 *   - Display user email + avatar
 *   - Show download stats (anonymous, opt-in)
 *   - Allow theme preference change
 *   - Allow language preference change
 *   - Sign out button
 *
 * If not logged in: show CTA to sign in.
 */
import { useEffect, useState } from 'react';
import { createClient, type User } from '@supabase/supabase-js';
import { User as UserIcon, Mail, LogOut, Palette, Globe, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import styles from './AccountDashboard.module.css';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce', storageKey: 'unduhaja-auth' },
});

export interface AccountDashboardProps {
  lang: 'id' | 'en';
  labels: {
    signin: string;
    signout: string;
    account: string;
    profile: string;
    email: string;
  };
}

export function AccountDashboard({ lang, labels }: AccountDashboardProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');
  const [language, setLanguage] = useState<'id' | 'en'>(lang);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success(lang === 'id' ? 'Berhasil keluar' : 'Signed out');
    setTimeout(() => {
      window.location.href = lang === 'id' ? '/id/' : '/en/';
    }, 1000);
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    if (newTheme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      localStorage.removeItem('unduhaja-theme');
    } else {
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('unduhaja-theme', newTheme);
    }
    toast.success(lang === 'id' ? 'Tema diubah' : 'Theme updated');
  };

  const handleLanguageChange = (newLang: 'id' | 'en') => {
    setLanguage(newLang);
    window.location.href = `/${newLang}/account`;
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <Loader2 size={32} className={styles.spinner} />
        <p>{lang === 'id' ? 'Memuat...' : 'Loading...'}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.notLoggedIn}>
        <AlertCircle size={48} className={styles.alertIcon} />
        <h2>{lang === 'id' ? 'Belum login' : 'Not logged in'}</h2>
        <p>
          {lang === 'id'
            ? 'Anda perlu login untuk mengakses halaman akun.'
            : 'You need to log in to access the account page.'}
        </p>
        <a href={lang === 'id' ? '/id/' : '/en/'} className={styles.ctaBtn}>
          {lang === 'id' ? 'Kembali ke Beranda' : 'Back to Home'}
        </a>
      </div>
    );
  }

  const email = user.email ?? '';
  const initials = email ? email.split('@')[0].slice(0, 2).toUpperCase() : 'U';
  const avatarUrl = user.user_metadata?.avatar_url ?? user.user_metadata?.picture;
  const provider = user.app_metadata?.provider ?? 'email';
  const createdAt = user.created_at ? new Date(user.created_at).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  return (
    <div className={styles.dashboard}>
      {/* Profile Card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <UserIcon size={20} />
            <span>{labels.profile}</span>
          </h2>
        </div>
        <div className={styles.profileInfo}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className={styles.avatar} />
          ) : (
            <div className={styles.avatarFallback}>{initials}</div>
          )}
          <div className={styles.profileDetails}>
            <div className={styles.profileRow}>
              <Mail size={14} />
              <span className={styles.profileEmail}>{email}</span>
            </div>
            <div className={styles.profileMeta}>
              <span className={styles.badge}>via {provider}</span>
              {createdAt && (
                <span className={styles.metaText}>
                  {lang === 'id' ? 'Bergabung sejak' : 'Member since'} {createdAt}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preferences Card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <Palette size={20} />
            <span>{lang === 'id' ? 'Preferensi Tema' : 'Theme Preference'}</span>
          </h2>
        </div>
        <div className={styles.preferenceRow}>
          <div className={styles.themeOptions}>
            <button
              type="button"
              className={`${styles.themeOption} ${theme === 'light' ? styles.themeOptionActive : ''}`}
              onClick={() => handleThemeChange('light')}
            >
              {lang === 'id' ? 'Terang' : 'Light'}
            </button>
            <button
              type="button"
              className={`${styles.themeOption} ${theme === 'dark' ? styles.themeOptionActive : ''}`}
              onClick={() => handleThemeChange('dark')}
            >
              {lang === 'id' ? 'Gelap' : 'Dark'}
            </button>
            <button
              type="button"
              className={`${styles.themeOption} ${theme === 'system' ? styles.themeOptionActive : ''}`}
              onClick={() => handleThemeChange('system')}
            >
              {lang === 'id' ? 'Sistem' : 'System'}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <Globe size={20} />
            <span>{lang === 'id' ? 'Preferensi Bahasa' : 'Language Preference'}</span>
          </h2>
        </div>
        <div className={styles.preferenceRow}>
          <div className={styles.themeOptions}>
            <button
              type="button"
              className={`${styles.themeOption} ${language === 'id' ? styles.themeOptionActive : ''}`}
              onClick={() => handleLanguageChange('id')}
            >
              Bahasa Indonesia
            </button>
            <button
              type="button"
              className={`${styles.themeOption} ${language === 'en' ? styles.themeOptionActive : ''}`}
              onClick={() => handleLanguageChange('en')}
            >
              English
            </button>
          </div>
        </div>
      </div>

      {/* Rate Limit Info Card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <span>{lang === 'id' ? 'Batas Unduhan' : 'Download Limit'}</span>
          </h2>
        </div>
        <div className={styles.rateLimitInfo}>
          <div className={styles.rateLimitRow}>
            <span>{lang === 'id' ? 'Mode' : 'Mode'}</span>
            <span className={styles.rateLimitValue}>{lang === 'id' ? 'Login' : 'Authenticated'}</span>
          </div>
          <div className={styles.rateLimitRow}>
            <span>{lang === 'id' ? 'Limit' : 'Limit'}</span>
            <span className={styles.rateLimitValue}>50 {lang === 'id' ? 'unduh/jam' : 'downloads/hr'}</span>
          </div>
          <div className={styles.rateLimitRow}>
            <span>{lang === 'id' ? 'Extract limit' : 'Extract limit'}</span>
            <span className={styles.rateLimitValue}>100 {lang === 'id' ? 'scan/jam' : 'scans/hr'}</span>
          </div>
        </div>
      </div>

      {/* Sign Out */}
      <div className={styles.signOutCard}>
        <button type="button" className={styles.signOutBtn} onClick={handleSignOut}>
          <LogOut size={16} />
          <span>{labels.signout}</span>
        </button>
      </div>
    </div>
  );
}
