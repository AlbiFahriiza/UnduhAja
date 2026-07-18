# 🎬 UnduhAja

> **Download Video Tanpa Ribet.** — Modern video downloader for YouTube & TikTok, built for Indonesia.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)
[![Live Demo](https://img.shields.io/badge/Live-Demo-2563EB?style=flat&logo=vercel&logoColor=white)](https://unduhaja.vercel.app)

**Languages:** [English](./README.en.md) | [Bahasa Indonesia](./README.id.md)

---

## ✨ Features

- 🎥 **YouTube & TikTok** — Download videos from both platforms
- 🎵 **Audio extraction** — Convert videos to MP3 (320kbps) or M4A
- 🌐 **Bilingual** — Full Indonesian & English support
- 🌙 **Dark mode** — Easy on the eyes
- 📱 **PWA** — Installable on mobile devices
- 🔐 **Privacy-first** — No tracking, no analytics, no download history
- ⚡ **Fast** — Built with Astro Islands for optimal performance
- 🎨 **Modern UI** — Spring physics animations, enterprise-grade design

## 🚀 Quick Deploy

### Option A: Deploy to Vercel (Recommended)

1. **Fork this repository** to your GitHub account
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import your forked repository
4. Add environment variables (see [Setup Guide](#-setup-guide) below)
5. Deploy — Vercel auto-detects Astro

### Option B: Local Development

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/unduhaja.git
cd unduhaja

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your credentials

# Start development server
npm run dev
```

Open [http://localhost:4321](http://localhost:4321) in your browser.

## 📋 Setup Guide

### Prerequisites

You'll need free accounts on these services:

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| [Vercel](https://vercel.com) | Frontend hosting | Unlimited static + 100GB bandwidth |
| [Supabase](https://supabase.com) | Auth + Database + Edge Functions | 500MB DB, 50k monthly users |
| [Cloudflare](https://cloudflare.com) | Video API + Turnstile captcha | 100k requests/day |

### Step 1: Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Project Settings → API** to get your:
   - `Project URL` → `PUBLIC_SUPABASE_URL`
   - `anon public` key → `PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
3. Run the SQL migration in SQL Editor:
   ```sql
   -- Copy & paste contents of supabase/migrations/20250718000000_init_schema.sql
   ```
4. Deploy Edge Functions (requires Supabase CLI):
   ```bash
   npm install -g supabase
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy extract --no-verify-jwt
   supabase functions deploy download --no-verify-jwt
   supabase functions deploy verify-turnstile --no-verify-jwt
   ```

### Step 2: Cloudflare Turnstile (Anti-bot)

1. Go to [Cloudflare Dashboard → Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile)
2. Click **Add site** → enter your domain
3. Copy:
   - **Site Key** → `PUBLIC_TURNSTILE_SITE_KEY`
   - **Secret Key** → `TURNSTILE_SECRET_KEY`

### Step 3: Cloudflare Worker (Video API)

The video extraction API runs on Cloudflare Workers. Deploy your own:

```bash
# Worker code is in the /unduhaja-worker folder of this repo
cd unduhaja-worker
npm install
npx wrangler login
npx wrangler deploy
```

Set the Worker URL as `COBALT_API_URL` in Supabase Edge Function secrets.

### Step 4: Environment Variables

Create `.env` file in project root (or set in Vercel dashboard):

```env
PUBLIC_SITE_URL=https://your-domain.com
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PUBLIC_TURNSTILE_SITE_KEY=your-site-key
TURNSTILE_SECRET_KEY=your-secret-key
AUTH_SECRET=generate-random-32-char-string
```

### Step 5: Build & Deploy

```bash
# Build for production
npm run build

# Preview locally
npm run preview

# Or deploy to Vercel
vercel --prod
```

## 🛠️ Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | [Astro](https://astro.build) + React Islands | Optimal performance, ~0KB JS by default |
| Styling | CSS Modules + Design Tokens | Scoped, maintainable styles |
| Animation | Custom RK4 Analytical Spring | Frame-rate independent motion |
| Backend | [Supabase](https://supabase.com) | Auth, DB, Edge Functions in one |
| Video API | [Cloudflare Workers](https://workers.cloudflare.com) | Edge-deployed, no cold start |
| Icons | [Lucide](https://lucide.dev) | Modern, lightweight |
| Toasts | [Sonner](https://sonner.emilkowal.ski) | Beautiful notifications |
| Fonts | Plus Jakarta Sans | Self-hosted for privacy |

## 📁 Project Structure

```
unduhaja/
├── src/
│   ├── components/
│   │   ├── astro/           # Server-rendered components
│   │   └── react/           # Client-side React islands
│   ├── layouts/             # Page layouts
│   ├── lib/                 # Shared utilities
│   ├── pages/               # File-based routes
│   │   ├── [lang]/          # Bilingual pages (ID/EN)
│   │   └── api/             # API endpoints
│   ├── i18n/                # Translations
│   └── styles/              # Global styles + tokens
├── supabase/
│   ├── migrations/          # Database schema
│   └── functions/           # Edge Functions
├── public/                  # Static assets (icons, fonts, manifest)
├── scripts/                 # Helper scripts
├── astro.config.mjs         # Astro configuration
├── vercel.json              # Security headers
└── package.json
```

## 🎨 Design System

- **Primary color:** `#2563EB` (Blue)
- **Accent color:** `#7C3AED` (Violet)
- **Background:** `#F8FAFC` (Light) / `#0B0F1A` (Dark)
- **Typography:** Plus Jakarta Sans (5 weights)
- **Border radius:** 8px / 12px / 16px / 20px
- **Spring profile:** Bouncy iOS (stiffness 250, damping 22)

## 🔒 Security

- ✅ Content Security Policy (CSP) headers
- ✅ HSTS, X-Frame-Options, X-Content-Type-Options
- ✅ Cloudflare Turnstile captcha on auth
- ✅ Rate limiting (5/hr guest, 50/hr authenticated)
- ✅ Row Level Security (RLS) on all database tables
- ✅ httpOnly + Secure cookies
- ✅ No tracking, no analytics, no third-party scripts

## 📊 Performance

- **Total JS bundle:** ~144KB gzipped
- **Lighthouse target:** 95+ across all categories
- **Zero JS** on static content pages
- **Code-split** React islands automatically

## 🆓 Cost

**$0/month** on free tiers:

| Service | Free Tier Limit | UnduhAja Usage |
|---------|----------------|----------------|
| Vercel | Unlimited static, 100GB BW | ~1GB typical |
| Supabase | 500MB DB, 50k MAU | ~50MB, ~1k users |
| Cloudflare Workers | 100k req/day | ~3k req/day |

## 🌐 Pages

- `/` — Auto-redirect based on browser language
- `/id/` — Landing page (Indonesian)
- `/en/` — Landing page (English)
- `/id/faq` — Frequently asked questions
- `/id/blog` — Blog with tutorials
- `/id/docs` — Documentation
- `/id/guides` — Step-by-step guides
- `/id/changelog` — Release history
- `/id/status` — Real-time service status
- `/id/account` — User account dashboard
- `/id/privacy` — Privacy policy
- `/id/terms` — Terms of service
- `/id/dmca` — DMCA policy

## 🤝 Contributing

This is a personal project, but suggestions are welcome! Open an issue for:

- Bug reports
- Feature requests
- Translation improvements
- Documentation corrections

## 📝 License

All rights reserved. Source code is provided for reference only.

## 👨‍💻 Author

**Albi Fahriza**
- Project creator & maintainer

## 🙏 Acknowledgments

Built with these amazing open-source projects:
- [Astro](https://astro.build) — Web framework
- [Supabase](https://supabase.com) — Backend platform
- [Cloudflare Workers](https://workers.cloudflare.com) — Edge runtime
- [Lucide](https://lucide.dev) — Icon library
- [Sonner](https://sonner.emilkowal.ski) — Toast notifications
- [Plus Jakarta Sans](https://tokotype.github.io/plusjakartasans) — Typography

---

**Languages:** [English](./README.en.md) | [Bahasa Indonesia](./README.id.md)
