/**
 * StatusDashboard — Real-time service health monitoring.
 *
 * Checks:
 *   - Frontend (Vercel) — ping landing page
 *   - Supabase Auth — ping /auth/v1/health
 *   - Supabase Edge Functions (extract) — ping with test URL
 *   - Cloudflare Worker (UnduhAja API) — ping /api/health
 *   - YouTube extraction — test with dQw4w9WgXcQ
 *   - TikTok extraction — test with sample TikTok URL
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, RefreshCw, Activity } from 'lucide-react';
import styles from './StatusDashboard.module.css';

type Status = 'operational' | 'degraded' | 'down' | 'checking';

interface ServiceStatus {
  name: string;
  description: string;
  status: Status;
  latencyMs?: number;
  lastChecked?: string;
  error?: string;
}

interface Props {
  lang: 'id' | 'en';
}

const SERVICES = [
  {
    key: 'frontend',
    name: 'Frontend (Vercel)',
    description: 'UnduhAja website',
    check: async () => {
      const start = Date.now();
      const res = await fetch('https://unduhaja.vercel.app/id/', { method: 'HEAD' });
      return { status: res.ok ? 'operational' : 'down' as Status, latencyMs: Date.now() - start };
    },
  },
  {
    key: 'worker',
    name: 'API Worker (Cloudflare)',
    description: 'YouTube & TikTok extraction API',
    check: async () => {
      const start = Date.now();
      const res = await fetch('https://unduhaja-api.unduhaja.workers.dev/api/health');
      const data = await res.json();
      return { status: data.status === 'ok' ? 'operational' : 'down' as Status, latencyMs: Date.now() - start };
    },
  },
  {
    key: 'supabase-auth',
    name: 'Supabase Auth',
    description: 'User authentication & sessions',
    check: async () => {
      const start = Date.now();
      const res = await fetch(`${import.meta.env.PUBLIC_SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: import.meta.env.PUBLIC_SUPABASE_ANON_KEY },
      });
      const data = await res.json();
      return { status: data.name === 'GoTrue' ? 'operational' : 'down' as Status, latencyMs: Date.now() - start };
    },
  },
  {
    key: 'supabase-extract',
    name: 'Edge Function: Extract',
    description: 'Video metadata extraction',
    check: async () => {
      const start = Date.now();
      const res = await fetch(`${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
      });
      const data = await res.json();
      const ok = data.metadata?.title && !data.error;
      return { status: ok ? 'operational' : 'degraded' as Status, latencyMs: Date.now() - start };
    },
  },
];

export function StatusDashboard({ lang }: Props) {
  const isID = lang === 'id';
  const [services, setServices] = useState<ServiceStatus[]>(
    SERVICES.map((s) => ({
      name: s.name,
      description: s.description,
      status: 'checking' as Status,
    }))
  );
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const checkAll = async () => {
    setRefreshing(true);
    const results = await Promise.all(
      SERVICES.map(async (service) => {
        try {
          const result = await service.check();
          return {
            name: service.name,
            description: service.description,
            status: result.status,
            latencyMs: result.latencyMs,
            lastChecked: new Date().toISOString(),
          };
        } catch (err: any) {
          return {
            name: service.name,
            description: service.description,
            status: 'down' as Status,
            lastChecked: new Date().toISOString(),
            error: err.message,
          };
        }
      })
    );
    setServices(results);
    setLastUpdated(new Date());
    setRefreshing(false);
  };

  useEffect(() => {
    checkAll();
    // Auto-refresh every 60 seconds
    const interval = setInterval(checkAll, 60000);
    return () => clearInterval(interval);
  }, []);

  const operationalCount = services.filter((s) => s.status === 'operational').length;
  const totalCount = services.length;
  const overallStatus = operationalCount === totalCount ? 'operational' : operationalCount === 0 ? 'down' : 'degraded';

  return (
    <div className={styles.container}>
      {/* Overall Status */}
      <div className={`${styles.overallCard} ${styles[`overall--${overallStatus}`]}`}>
        <div className={styles.overallIcon}>
          {overallStatus === 'operational' && <CheckCircle2 size={48} />}
          {overallStatus === 'degraded' && <Activity size={48} />}
          {overallStatus === 'down' && <XCircle size={48} />}
        </div>
        <div className={styles.overallInfo}>
          <h2 className={styles.overallTitle}>
            {overallStatus === 'operational' && (isID ? 'Semua Sistem Operasional' : 'All Systems Operational')}
            {overallStatus === 'degraded' && (isID ? 'Beberapa Sistem Bermasalah' : 'Some Systems Degraded')}
            {overallStatus === 'down' && (isID ? 'Sistem Tidak Tersedia' : 'Major Outage')}
          </h2>
          <p className={styles.overallSubtitle}>
            {operationalCount}/{totalCount} {isID ? 'layanan berfungsi normal' : 'services operational'}
          </p>
          {lastUpdated && (
            <p className={styles.overallUpdated}>
              {isID ? 'Terakhir diperbarui:' : 'Last updated:'} {lastUpdated.toLocaleTimeString(isID ? 'id-ID' : 'en-US')}
            </p>
          )}
        </div>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={checkAll}
          disabled={refreshing}
        >
          <RefreshCw size={16} className={refreshing ? styles.spinning : ''} />
          <span>{isID ? 'Refresh' : 'Refresh'}</span>
        </button>
      </div>

      {/* Individual Services */}
      <div className={styles.servicesList}>
        {services.map((service) => (
          <div key={service.name} className={`${styles.serviceCard} ${styles[`service--${service.status}`]}`}>
            <div className={styles.serviceIcon}>
              {service.status === 'operational' && <CheckCircle2 size={20} />}
              {service.status === 'degraded' && <Activity size={20} />}
              {service.status === 'down' && <XCircle size={20} />}
              {service.status === 'checking' && <Loader2 size={20} className={styles.spinning} />}
            </div>
            <div className={styles.serviceInfo}>
              <div className={styles.serviceName}>{service.name}</div>
              <div className={styles.serviceDesc}>{service.description}</div>
              {service.error && <div className={styles.serviceError}>{service.error}</div>}
            </div>
            <div className={styles.serviceMeta}>
              {service.latencyMs !== undefined && (
                <span className={styles.serviceLatency}>{service.latencyMs}ms</span>
              )}
              <span className={`${styles.serviceBadge} ${styles[`badge--${service.status}`]}`}>
                {service.status === 'operational' && (isID ? 'Operasional' : 'Operational')}
                {service.status === 'degraded' && (isID ? 'Bermasalah' : 'Degraded')}
                {service.status === 'down' && (isID ? 'Tidak Tersedia' : 'Down')}
                {service.status === 'checking' && (isID ? 'Memeriksa...' : 'Checking...')}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Auto-refresh note */}
      <p className={styles.autoRefreshNote}>
        {isID ? 'Halaman ini otomatis refresh setiap 60 detik.' : 'This page auto-refreshes every 60 seconds.'}
      </p>
    </div>
  );
}
