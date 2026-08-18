# Baqala OS — License API (Cloudflare Worker)

## Setup

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. Create KV namespaces:
   ```bash
   wrangler kv:namespace create LICENSES
   wrangler kv:namespace create TRIALS
   ```
   Copy the IDs into `wrangler.toml`.

3. Set admin secret:
   ```bash
   wrangler secret put ADMIN_TOKEN
   # Enter a strong random token when prompted
   ```

4. Deploy:
   ```bash
   npm run deploy
   ```
   Note the deployed URL (e.g. `https://baqala-license-api.your-subdomain.workers.dev`).

5. Set in POS app:
   Create `.env.local` in the main project:
   ```
   VITE_LICENSE_API_URL=https://baqala-license-api.your-subdomain.workers.dev
   ```

6. Seed licenses:
   ```bash
   CLOUDFLARE_API_TOKEN=<your-token> \
   ACCOUNT_ID=<your-account-id> \
   KV_NAMESPACE_ID=<licenses-kv-id> \
   node scripts/seed-licenses.js 200
   ```

## Pricing

The API supports per-license expiry via the `expiresAt` field (Unix ms timestamp):
- Monthly subscription: set `expiresAt` to 30 days from now when creating license
- Annual: set to 365 days
- Perpetual: leave `expiresAt: null`

## Admin API

All admin endpoints require `Authorization: Bearer <ADMIN_TOKEN>` header.

- `GET /admin/licenses` — list all licenses and active trials
- `POST /admin/license` — create a new license
- `POST /admin/revoke` — deactivate a license (customer won't be able to use the app)
- `POST /admin/reset` — clear machine binding (transfer to new device)
