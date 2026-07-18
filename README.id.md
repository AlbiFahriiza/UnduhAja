# 🎬 UnduhAja

> **Download Video Tanpa Ribet.** — Platform downloader video modern untuk YouTube & TikTok, dibuat untuk Indonesia.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)
[![Live Demo](https://img.shields.io/badge/Live-Demo-2563EB?style=flat&logo=vercel&logoColor=white)](https://unduhaja.vercel.app)

**Bahasa:** [English](./README.md) | [Bahasa Indonesia](./README.id.md) (Anda di sini)

---

## ✨ Fitur

- 🎥 **YouTube & TikTok** — Unduh video dari kedua platform
- 🎵 **Ekstrak audio** — Konversi video ke MP3 (320kbps) atau M4A
- 🌐 **Bilingual** — Dukungan penuh Bahasa Indonesia & English
- 🌙 **Dark mode** — Nyaman di mata
- 📱 **PWA** — Bisa di-install di HP
- 🔐 **Privasi utama** — Tanpa tracking, tanpa analytics, tanpa riwayat unduhan
- ⚡ **Cepat** — Dibangun dengan Astro Islands untuk performa optimal
- 🎨 **UI modern** — Animasi spring physics, desain kelas enterprise

## 🚀 Deploy Cepat

### Opsi A: Deploy ke Vercel (Rekomendasi)

1. **Fork repository ini** ke akun GitHub lo
2. Buka [vercel.com/new](https://vercel.com/new)
3. Import repository yang udah di-fork
4. Tambahkan environment variables (lihat [Panduan Setup](#-panduan-setup) di bawah)
5. Deploy — Vercel otomatis detect Astro

### Opsi B: Development Lokal

```bash
# Clone repository
git clone https://github.com/USERNAME_KAMU/unduhaja.git
cd unduhaja

# Install dependencies
npm install

# Copy template environment
cp .env.example .env
# Edit .env dengan credentials lo

# Jalankan development server
npm run dev
```

Buka [http://localhost:4321](http://localhost:4321) di browser.

## 📋 Panduan Setup

### Prerequisites

Lo butuh akun gratis di layanan berikut:

| Layanan | Fungsi | Free Tier |
|---------|--------|-----------|
| [Vercel](https://vercel.com) | Hosting frontend | Unlimited static + 100GB bandwidth |
| [Supabase](https://supabase.com) | Auth + Database + Edge Functions | 500MB DB, 50k user bulanan |
| [Cloudflare](https://cloudflare.com) | Video API + Turnstile captcha | 100k request/hari |

### Langkah 1: Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com)
2. Buka **Project Settings → API** untuk dapatkan:
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
   supabase link --project-ref PROJECT_REF_KAMU
   supabase functions deploy extract --no-verify-jwt
   supabase functions deploy download --no-verify-jwt
   supabase functions deploy verify-turnstile --no-verify-jwt
   ```

### Langkah 2: Cloudflare Turnstile (Anti-bot)

1. Buka [Cloudflare Dashboard → Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile)
2. Klik **Add site** → masukkan domain lo
3. Copy:
   - **Site Key** → `PUBLIC_TURNSTILE_SITE_KEY`
   - **Secret Key** → `TURNSTILE_SECRET_KEY`

### Langkah 3: Cloudflare Worker (Video API)

API ekstraksi video berjalan di Cloudflare Workers. Deploy punya lo sendiri:

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
PUBLIC_SITE_URL=https://domain-kamu.com
PUBLIC_SUPABASE_URL=https://project-kamu.supabase.co
PUBLIC_SUPABASE_ANON_KEY=anon-key-kamu
SUPABASE_SERVICE_ROLE_KEY=service-role-key-kamu
PUBLIC_TURNSTILE_SITE_KEY=site-key-kamu
TURNSTILE_SECRET_KEY=secret-key-kamu
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

## 🛠️ Tech Stack

| Layer | Teknologi | Alasan |
|-------|-----------|--------|
| Frontend | [Astro](https://astro.build) + React Islands | Performa optimal, ~0KB JS by default |
| Styling | CSS Modules + Design Tokens | Scoped, maintainable |
| Animation | Custom RK4 Analytical Spring | Motion frame-rate independent |
| Backend | [Supabase](https://supabase.com) | Auth, DB, Edge Functions dalam satu |
| Video API | [Cloudflare Workers](https://workers.cloudflare.com) | Edge-deployed, no cold start |
| Icons | [Lucide](https://lucide.dev) | Modern, ringan |
| Toasts | [Sonner](https://sonner.emilkowal.ski) | Notifikasi cantik |
| Fonts | Plus Jakarta Sans | Self-hosted untuk privasi |

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
├── scripts/                 # Helper scripts
├── astro.config.mjs         # Konfigurasi Astro
├── vercel.json              # Security headers
└── package.json
```

## 🎨 Design System

- **Warna primary:** `#2563EB` (Biru)
- **Warna accent:** `#7C3AED` (Violet)
- **Background:** `#F8FAFC` (Light) / `#0B0F1A` (Dark)
- **Tipografi:** Plus Jakarta Sans (5 weights)
- **Border radius:** 8px / 12px / 16px / 20px
- **Profil spring:** Bouncy iOS (stiffness 250, damping 22)

## 🔒 Keamanan

- ✅ Content Security Policy (CSP) headers
- ✅ HSTS, X-Frame-Options, X-Content-Type-Options
- ✅ Cloudflare Turnstile captcha di auth
- ✅ Rate limiting (5/jam guest, 50/jam authenticated)
- ✅ Row Level Security (RLS) di semua tabel database
- ✅ httpOnly + Secure cookies
- ✅ Tanpa tracking, tanpa analytics, tanpa script pihak ketiga

## 📊 Performa

- **Total JS bundle:** ~144KB gzipped
- **Target Lighthouse:** 95+ di semua kategori
- **Zero JS** di halaman konten statis
- **Code-split** React islands otomatis

## 🆓 Biaya

**$0/bulan** di free tier:

| Layanan | Limit Free Tier | Penggunaan UnduhAja |
|---------|----------------|---------------------|
| Vercel | Unlimited static, 100GB BW | ~1GB typical |
| Supabase | 500MB DB, 50k MAU | ~50MB, ~1k users |
| Cloudflare Workers | 100k req/hari | ~3k req/hari |

## 🌐 Halaman

- `/` — Auto-redirect berdasarkan bahasa browser
- `/id/` — Landing page (Bahasa Indonesia)
- `/en/` — Landing page (English)
- `/id/faq` — Pertanyaan yang sering diajukan
- `/id/blog` — Blog dengan tutorial
- `/id/docs` — Dokumentasi
- `/id/guides` — Panduan step-by-step
- `/id/changelog` — Riwayat rilis
- `/id/status` — Status layanan real-time
- `/id/account` — Dashboard akun user
- `/id/privacy` — Kebijakan privasi
- `/id/terms` — Ketentuan layanan
- `/id/dmca` — Kebijakan DMCA

## 🤝 Kontribusi

Ini project personal, tapi saran sangat diterima! Buka issue untuk:

- Laporan bug
- Request fitur
- Perbaikan translation
- Koreksi dokumentasi

## 📝 Lisensi

All rights reserved. Source code disediakan untuk referensi saja.

## 👨‍💻 Author

**Albi Fahriza**
- Pembuat & maintainer project

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
