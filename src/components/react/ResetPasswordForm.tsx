/**
 * ResetPasswordForm — Form to update password after magic link redirect.
 */
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Lock, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import styles from './ResetPasswordForm.module.css';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce', storageKey: 'unduhaja-auth' },
});

export interface ResetPasswordFormProps {
  lang: 'id' | 'en';
  labels: {
    newPassword: string;
    password: string;
    signinBtn: string;
    passwordReset: string;
    passwordRequired: string;
    passwordTooShort: string;
    genericError: string;
  };
}

export function ResetPasswordForm({ lang, labels }: ResetPasswordFormProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password) {
      setError(labels.passwordRequired);
      return;
    }
    if (password.length < 8) {
      setError(labels.passwordTooShort);
      return;
    }
    if (password !== confirmPassword) {
      setError(lang === 'id' ? 'Kata sandi tidak cocok' : 'Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setSuccess(true);
      toast.success(labels.passwordReset);
      // Redirect to home after 2 seconds
      setTimeout(() => {
        window.location.href = lang === 'id' ? '/id/' : '/en/';
      }, 2000);
    } catch (err) {
      setError(labels.genericError);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={styles.container}>
        <div className={styles.successCard}>
          <CheckCircle2 size={48} className={styles.successIcon} />
          <h2>{labels.passwordReset}</h2>
          <p>{lang === 'id' ? 'Mengalihkan ke beranda...' : 'Redirecting to home...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <h2 className={styles.title}>{labels.newPassword}</h2>
        <p className={styles.subtitle}>
          {lang === 'id'
            ? 'Masukkan kata sandi baru untuk akun kamu'
            : 'Enter a new password for your account'}
        </p>

        <div className={styles.field}>
          <label htmlFor="new-password" className={styles.label}>{labels.password}</label>
          <div className={styles.inputWrap}>
            <Lock size={18} className={styles.inputIcon} aria-hidden="true" />
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              placeholder={labels.password}
              disabled={loading}
              dir="ltr"
            />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="confirm-password" className={styles.label}>
            {lang === 'id' ? 'Konfirmasi kata sandi' : 'Confirm password'}
          </label>
          <div className={styles.inputWrap}>
            <Lock size={18} className={styles.inputIcon} aria-hidden="true" />
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={styles.input}
              placeholder={lang === 'id' ? 'Ulangi kata sandi' : 'Repeat password'}
              disabled={loading}
              dir="ltr"
            />
          </div>
        </div>

        {error && (
          <div className={styles.alert} role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" className={styles.submitBtn} disabled={loading}>
          {loading && <Loader2 size={18} className={styles.spinner} />}
          <span>{labels.signinBtn}</span>
        </button>

        <a href={lang === 'id' ? '/id/' : '/en/'} className={styles.backLink}>
          <ArrowLeft size={14} />
          <span>{lang === 'id' ? 'Kembali ke beranda' : 'Back to home'}</span>
        </a>
      </form>
    </div>
  );
}
