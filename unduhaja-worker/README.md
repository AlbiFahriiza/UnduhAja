# UnduhAja API Worker

Cloudflare Worker for video extraction (YouTube + TikTok).

## Deploy

```bash
npm install
npx wrangler login
npx wrangler deploy
```

## Set API Key Secret

```bash
echo "your-random-api-key" | npx wrangler secret put API_KEY
```

## Endpoints

- `GET /api/health` — Health check (public)
- `POST /api/json` — Main API (requires `X-API-Key` header)

See main project [README](../README.md) for full setup guide.
