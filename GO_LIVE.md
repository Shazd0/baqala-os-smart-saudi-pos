# Baqala OS — go-live notes

These are the live endpoints created on 18 Aug 2026. Secrets stay on this computer only.

## License API

- Worker URL: https://baqala-license-api.gofixsa.workers.dev
- POS env: `.env.local` → `VITE_LICENSE_API_URL` (gitignored)
- Admin token: `cf-worker/secrets.json` (gitignored)
- License keys: `LICENSE_KEYS.md` (gitignored, 200 keys)

Vendor dashboard: open `vendor-dashboard/index.html` in a browser, paste the Worker URL and admin token.

## Installer

Built locally as `dist-electron/Baqala OS Setup 1.0.2.exe` (unsigned Windows NSIS).
GitHub auto-update looks at releases on `Shazd0/baqala-os-smart-saudi-pos`.
