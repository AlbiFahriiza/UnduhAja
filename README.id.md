# 🎬 UnduhAja

> **Download Video Tanpa Ribet.** — Platform downloader video modern untuk YouTube & TikTok, dibuat untuk Indonesia.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

**Bahasa:** [English](./README.md) | [Bahasa Indonesia](./README.id.md) (Anda di sini)

---

## 📖 Apa itu UnduhAja?

UnduhAja adalah platform downloader video modern dengan fokus pada privasi yang mendukung YouTube (termasuk YouTube Shorts) dan TikTok. Dibangun dengan fokus pada kecepatan, kesederhanaan, dan privasi pengguna — tanpa iklan, tanpa tracking, tanpa penyimpanan riwayat unduhan.

Cukup tempel URL video, pilih kualitas yang diinginkan (hingga 1080p60 untuk video, MP3 320kbps untuk audio), dan unduh langsung ke perangkat Anda. Itu saja.

### Highlight Utama

- 🎥 **YouTube & TikTok** — Dukungan penuh untuk kedua platform
- 🎵 **Ekstrak audio** — Konversi video ke MP3 (320kbps) atau M4A
- 🌐 **Bilingual** — Dukungan penuh Bahasa Indonesia & English dengan URL prefix (/id/, /en/)
- 🌙 **Dark mode** — Toggle tema yang smooth
- 📱 **PWA** — Bisa di-install di perangkat mobile
- 🔐 **Privasi utama** — Tanpa tracking, tanpa analytics, tanpa riwayat unduhan
- ⚡ **Cepat** — Dibangun dengan Astro Islands untuk performa optimal (~144KB JS gzipped)
- 🎨 **UI modern** — Animasi custom RK4 analytical spring physics

---

## 🚀 Deploy Cepat

### Opsi A: Deploy ke Vercel (Rekomendasi)

1. **Fork repository ini** ke akun GitHub Anda
2. Buka [vercel.com/new](https://vercel.com/new)
3. Import repository yang sudah di-fork
4. Tambahkan environment variables (lihat [Panduan Setup](#-panduan-setup) di bawah)
5. Deploy — Vercel otomatis mendeteksi Astro

### Opsi B: Development Lokal

```bash
# Clone repository
git clone https://github.com/USERNAME_ANDA/unduhaja.git
cd unduhaja

# Install dependencies
npm install

# Copy template environment
cp .env.example .env
# Edit .env dengan credentials Anda

# Jalankan development server
npm run dev
```

Buka [http://localhost:4321](http://localhost:4321) di browser Anda.

---

## 📋 Panduan Setup

### Prerequisites

Anda membutuhkan akun gratis di layanan berikut:

| Layanan | Fungsi | Free Tier |
|---------|--------|-----------|
| [Vercel](https://vercel.com) | Hosting frontend | Unlimited static + 100GB bandwidth |
| [Supabase](https://supabase.com) | Auth + Database + Edge Functions | 500MB DB, 50k user bulanan |
| [Cloudflare](https://cloudflare.com) | Video API + Turnstile captcha | 100k request/hari |

### Langkah 1: Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com)
2. Buka **Project Settings → API** untuk mendapatkan:
   - `Project URL` → `PUBLIC_SUPABASE_URL`
   - `anon public` key → `PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
3. Jalankan SQL migration di SQL Editor:
   ```sql
   -- Copy & paste isi file supabase/migrations/20250718000000_init_schema.sql
   ```
4. Deploy Edge Functions (butuh Supabase CLI):
   ```bash
   npm install -g supabase
   supabase login
   supabase link --project-ref PROJECT_REF_ANDA
   supabase functions deploy extract --no-verify-jwt
   supabase functions deploy download --no-verify-jwt
   supabase functions deploy verify-turnstile --no-verify-jwt
   ```

### Langkah 2: Cloudflare Turnstile (Anti-bot)

1. Buka [Cloudflare Dashboard → Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile)
2. Klik **Add site** → masukkan domain Anda
3. Copy:
   - **Site Key** → `PUBLIC_TURNSTILE_SITE_KEY`
   - **Secret Key** → `TURNSTILE_SECRET_KEY`

### Langkah 3: Cloudflare Worker (Video API)

API ekstraksi video berjalan di Cloudflare Workers. Deploy punya Anda sendiri:

```bash
# Code Worker ada di folder /unduhaja-worker di repo ini
cd unduhaja-worker
npm install
npx wrangler login
npx wrangler deploy
```

Set URL Worker sebagai `COBALT_API_URL` di secrets Supabase Edge Function.

### Langkah 4: Environment Variables

Buat file `.env` di root project (atau set di dashboard Vercel):

```env
PUBLIC_SITE_URL=https://domain-anda.com
PUBLIC_SUPABASE_URL=https://project-anda.supabase.co
PUBLIC_SUPABASE_ANON_KEY=anon-key-anda
SUPABASE_SERVICE_ROLE_KEY=service-role-key-anda
PUBLIC_TURNSTILE_SITE_KEY=site-key-anda
TURNSTILE_SECRET_KEY=secret-key-anda
AUTH_SECRET=generate-string-random-32-karakter
```

### Langkah 5: Build & Deploy

```bash
# Build untuk production
npm run build

# Preview lokal
npm run preview

# Atau deploy ke Vercel
vercel --prod
```

---

## 🛠️ Tech Stack

| Layer | Teknologi | Alasan |
|-------|-----------|--------|
| Frontend | [Astro](https://astro.build) + React Islands | Performa optimal, ~0KB JS by default |
| Styling | CSS Modules + Design Tokens | Scoped, mudah maintain |
| Animation | Custom RK4 Analytical Spring | Motion frame-rate independent |
| Backend | [Supabase](https://supabase.com) | Auth, DB, Edge Functions dalam satu |
| Video API | [Cloudflare Workers](https://workers.cloudflare.com) | Edge-deployed, no cold start |
| Icons | [Lucide](https://lucide.dev) | Modern, ringan |
| Toasts | [Sonner](https://sonner.emilkowal.ski) | Notifikasi cantik |
| Fonts | Plus Jakarta Sans | Self-hosted untuk privasi |

---

## 📁 Struktur Project

```
unduhaja/
├── src/
│   ├── components/
│   │   ├── astro/           # Komponen server-rendered
│   │   └── react/           # React islands client-side
│   ├── layouts/             # Layout halaman
│   ├── lib/                 # Utility bersama
│   ├── pages/               # Routing file-based
│   │   ├── [lang]/          # Halaman bilingual (ID/EN)
│   │   └── api/             # API endpoints
│   ├── i18n/                # Translations
│   └── styles/              # Global styles + tokens
├── supabase/
│   ├── migrations/          # Schema database
│   └── functions/           # Edge Functions
├── public/                  # Static assets (icons, fonts, manifest)
├── unduhaja-worker/         # Cloudflare Worker (video API)
├── scripts/                 # Helper scripts
├── astro.config.mjs         # Konfigurasi Astro
├── vercel.json              # Security headers
└── package.json
```

---

## 🎨 Design System

- **Warna primary:** `#2563EB` (Biru)
- **Warna accent:** `#7C3AED` (Violet)
- **Background:** `#F8FAFC` (Light) / `#0B0F1A` (Dark)
- **Tipografi:** Plus Jakarta Sans (5 weights: 400, 500, 600, 700, 800)
- **Border radius:** 8px / 12px / 16px / 20px
- **Profil spring:** Bouncy iOS (stiffness 250, damping 22, mass 1.0)

---

## 🔒 Fitur Keamanan

- ✅ Content Security Policy (CSP) headers
- ✅ HSTS, X-Frame-Options, X-Content-Type-Options
- ✅ Cloudflare Turnstile captcha di endpoint auth
- ✅ Rate limiting (5/jam guest, 50/jam authenticated)
- ✅ Row Level Security (RLS) di semua tabel database
- ✅ httpOnly + Secure cookies
- ✅ Honeypot anti-bot field
- ✅ Tanpa tracking, tanpa analytics, tanpa script pihak ketiga

---

## 📊 Performa

- **Total JS bundle:** ~144KB gzipped
- **Target Lighthouse:** 95+ di semua kategori
- **Zero JS** di halaman konten statis
- **Code-split** React islands otomatis
- **Fonts:** Self-hosted woff2 (5 weights)

---

## 🆓 Biaya

**$0/bulan** di free tier:

| Layanan | Limit Free Tier | Penggunaan Typical |
|---------|----------------|-------------------|
| Vercel | Unlimited static, 100GB BW | ~1GB |
| Supabase | 500MB DB, 50k MAU | ~50MB, ~1k users |
| Cloudflare Workers | 100k req/hari | ~3k req/hari |

---

## 🌐 Halaman (28+ bilingual)

| Halaman | Deskripsi |
|---------|-----------|
| `/` | Auto-redirect berdasarkan bahasa browser |
| `/id/` `/en/` | Landing page |
| `/id/faq` `/en/faq` | Pertanyaan yang sering diajukan |
| `/id/blog` `/en/blog` | Blog dengan tutorial |
| `/id/blog/[slug]` | Detail blog post |
| `/id/docs` `/en/docs` | Dokumentasi |
| `/id/guides` `/en/guides` | Panduan step-by-step |
| `/id/changelog` `/en/changelog` | Riwayat rilis |
| `/id/api-docs` `/en/api-docs` | Referensi API |
| `/id/status` `/en/status` | Status layanan real-time |
| `/id/account` `/en/account` | Dashboard akun user |
| `/id/privacy` `/en/privacy` | Kebijakan privasi |
| `/id/terms` `/en/terms` | Ketentuan layanan |
| `/id/dmca` `/en/dmca` | Kebijakan DMCA |
| `/id/auth/reset-password` | Reset password |

---

## 🔍 Fitur SEO

- ✅ Auto sitemap dengan i18n (hreflang alternates)
- ✅ robots.txt dengan referensi sitemap
- ✅ Canonical URLs per halaman
- ✅ hreflang alternate links di HTML head
- ✅ Open Graph + Twitter Card meta tags
- ✅ JSON-LD structured data (Organization, FAQPage, Blog, BlogPosting)
- ✅ Enhanced sitemap (lastmod, priority, changefreq)
- ✅ Mobile-friendly responsive design
- ✅ HTTPS enforced
- ✅ LCP cepat (< 1s)

---

## 🤝 Kontribusi

Ini project personal, tapi saran sangat diterima! Buka issue untuk:

- Laporan bug
- Request fitur
- Perbaikan translation
- Koreksi dokumentasi

---

## 📝 Lisensi

All rights reserved. Source code disediakan untuk referensi saja.

---

## 👨‍💻 Author

**Albi Fahriza**
- Pembuat & maintainer project

---

## 🙏 Acknowledgments

Dibangun dengan project open-source keren berikut:
- [Astro](https://astro.build) — Web framework
- [Supabase](https://supabase.com) — Platform backend
- [Cloudflare Workers](https://workers.cloudflare.com) — Edge runtime
- [Lucide](https://lucide.dev) — Library icon
- [Sonner](https://sonner.emilkowal.ski) — Notifikasi toast
- [Plus Jakarta Sans](https://tokotype.github.io/plusjakartasans) — Tipografi

---

**Bahasa:** [English](./README.md) | [Bahasa Indonesia](./README.id.md) (Anda di sini)
