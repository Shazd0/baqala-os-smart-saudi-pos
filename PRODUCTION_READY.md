# Baqala OS — Production Readiness Guide

> Written for the scenario where you sell this app to **many grocery store owners** across Saudi Arabia, each running it on their own Windows/Mac computer.

---

## 1. How Data is Stored — What "Local" Means

Baqala OS currently stores all data in **browser localStorage** inside whatever browser the user opens the app in. This means:

- Data lives on **that specific browser on that specific computer** — products, sales, customers, everything.
- If the user clears browser data, **all data is gone**.
- If the user opens the app in a different browser (Chrome vs Edge), they see **different data** — the stores are not shared.
- If the computer dies without a backup, **all data is gone permanently**.

### What you must do before selling

| # | Action | Why |
|---|--------|-----|
| 1 | **Switch to Electron** (wrap the app as a desktop `.exe`) | Data writes to a real SQLite file on disk, not browser memory. App works offline, installs like any Windows software, shows on the Start Menu. |
| 2 | **Or host a backend per tenant** (cloud SaaS model) | Each store gets a Firebase/Supabase project. Data is always safe, syncs between devices. More complex to operate but the right long-term model. |
| 3 | **Add automatic daily backup to a local folder** | Absolute minimum if staying with the browser. Export the entire store as a JSON file every day at app start, save to `Downloads`. |
| 4 | **Show users a clear "Last Backup" indicator** | Users must know their data is not automatically safe. |

**Current state:** Firebase mirroring is partially wired in `storageService.ts` (`mirrorToFirestore`) but there is no Firebase project configured for production. Until that is set up, Firebase does nothing and localStorage is the only store.

---

## 2. ZATCA Phase 2 — The Real Story

### What is ZATCA Phase 2?

Saudi Arabia's Zakat, Tax and Customs Authority (ZATCA) mandates that **every VAT-registered business** issue cryptographically signed e-invoices. Phase 2 (Fatoora) adds:
- A unique **Cryptographic Stamp Identifier (CSID)** issued by ZATCA per device.
- Every invoice signed with ECDSA and transmitted to ZATCA in real time (standard invoices) or reported within 24 hours (simplified invoices like grocery receipts).

### What Baqala OS has RIGHT NOW

| Feature | Status |
|---------|--------|
| Real SHA-256 hash chain (tamper-evident) | ✅ Done — verified against Node crypto |
| Real ECDSA P-256 signatures per invoice | ✅ Done — key persisted in localStorage |
| Invoice sequence numbers (ICV) | ✅ Done |
| Chain validation (detects any tampered invoice) | ✅ Done |
| Genesis PIH (`base64(hex(sha256("0")))`) | ✅ Correct |
| Compliance screen with honest status | ✅ Done |
| ZATCA onboarding / CSR generation | ❌ Not done |
| ZATCA-issued CSID per device | ❌ Not done |
| UBL 2.1 XML invoice format | ❌ Not done |
| XAdES enveloped signatures on XML | ❌ Not done |
| Reporting API (simplified invoices) | ❌ Not done |
| Clearance API (standard invoices) | ❌ Not done |
| ZATCA compliance test suite | ❌ Not run |
| QR TLV built from ZATCA certificate | ❌ Not done |

### What "not ZATCA-certified" means practically

The signing key in the app right now is **self-generated on the user's browser** — it is not issued by ZATCA and ZATCA does not know it exists. The hash format is this app's own design, not UBL 2.1 XML. So:

- The chain is a real internal audit trail and tamper detection system.
- It is **not legally valid** for ZATCA Phase 2 compliance.
- Selling the app claiming ZATCA Phase 2 compliance without completing the steps below would be legally problematic in Saudi Arabia.

---

## 3. How ZATCA Phase 2 Works — Per Customer

This is the key question. ZATCA does not license software — it registers **each business device separately**. Here is exactly how it works:

```
Your Customer (Store Owner)
        │
        ├── Has a VAT Registration Number (الرقم الضريبي)
        ├── Has a ZATCA Fatoora portal account
        │
        ▼
Step 1: Generate a CSR (Certificate Signing Request) on their device
        → The app generates an EC key pair and a ZATCA-format CSR
        → This CSR contains their VAT number, business name, device serial
        │
        ▼
Step 2: Submit the CSR to ZATCA Compliance API
        POST https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/compliance
        → ZATCA issues a Compliance CSID (a certificate)
        │
        ▼
Step 3: Run ZATCA Compliance Test Suite
        → Submit 6 sample invoices to ZATCA
        → ZATCA validates format, signatures, QR codes
        │
        ▼
Step 4: Get Production CSID
        POST https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/production/csids
        → ZATCA issues a Production certificate (valid 1 year, then renews)
        │
        ▼
Step 5: Every invoice at checkout
        → Generate UBL 2.1 XML for the invoice
        → Compute XAdES signature using the Production CSID private key
        → For simplified invoices (grocery): report to ZATCA within 24 hours
        → For standard invoices (B2B): get clearance in real time before printing
```

### What this means for selling to many stores

**Each store owner must complete steps 1–4 themselves** (or you do it as an onboarding service). There is no way to share one ZATCA certificate across multiple businesses — ZATCA ties each certificate to a specific VAT number.

The practical model that works at scale:

| Model | How it works | Best for |
|-------|-------------|----------|
| **Self-onboarding wizard** | The app walks the user through generating a CSR, submitting it to ZATCA, and pasting back the CSID. Fully automated inside the app. | Tech-comfortable users, SaaS |
| **You onboard for them** | You visit the store (or do a remote session), log in to their ZATCA portal, and complete onboarding. They just use the app. | Premium/local service tier |
| **Onboarding as a paid service** | Charge per store for ZATCA activation. Build an admin dashboard on your side to track which stores are compliant. | Scalable business model |

---

## 4. Complete Production Checklist

### App Infrastructure

- [x] Wrap in **Electron** — done, data now written to SQLite via `electron/db.cjs`
- [ ] Set up a real **Firebase project** with Firestore enabled
- [ ] Configure environment variables (`.env`) — do not hardcode any keys
- [ ] Set up **Firebase Security Rules** so each store can only read its own data
- [ ] Implement **automatic daily backup** (export JSON to disk or cloud storage)
- [ ] Add a **"Last backup" status indicator** visible on the main screen
- [ ] Enable **Firebase Authentication** (email/password per store owner)
- [ ] Set up **Firebase App Check** to block unauthorized API access
- [ ] Configure a **CDN / hosting** (Firebase Hosting, Vercel, or Cloudflare Pages)
- [ ] Set up **HTTPS** — required for camera scanning and Web Crypto (ZATCA hashing)

### ZATCA Phase 2 (per customer)

- [ ] Build a CSR generator inside the app using SubtleCrypto + ZATCA's required X.509 fields
- [ ] Implement the ZATCA Compliance API call (submit CSR, receive compliance CSID)
- [ ] Generate compliant **UBL 2.1 XML** for every invoice (this is the hardest part)
- [ ] Implement **XAdES-B-EPES** enveloped signature on the UBL XML
- [ ] Build the **QR code TLV** from the ZATCA certificate (not just seller name/VAT)
- [ ] Implement the **Reporting API** for simplified invoices (POST within 24h)
- [ ] Implement the **Clearance API** for standard B2B invoices (real-time)
- [ ] Implement **CSID renewal** (certificates expire — renew before the deadline)
- [ ] Run ZATCA's compliance test suite for each integration
- [ ] Register as a **Certified Solution Provider (CSP)** with ZATCA if selling to many businesses

### Security

- [ ] Signing private keys must **never leave the device** — use IndexedDB with non-extractable keys, not localStorage (localStorage can be read by any JS on the page)
- [ ] Audit all `localStorage` usage — move sensitive data to `indexedDB` with encryption
- [ ] Add **CSP headers** to prevent XSS
- [ ] Rotate all API keys and secrets before going live
- [ ] Enable **Firebase App Check**
- [ ] Do a security audit of the `StorageService` bridge pattern

### POS Core Features

- [ ] **Offline-first**: app must work when internet is down and sync when it comes back
- [ ] **Receipt printer** integration (ESC/POS over USB/Bluetooth) — thermal printers are standard in Saudi grocery stores
- [ ] **Cash drawer** integration (opens on cash sale)
- [ ] **Barcode scanner** hardware support (already works — verify with real USB scanner)
- [ ] **Customer-facing display** (second screen showing cart total)
- [ ] **Multi-device**: two cashiers on the same store data (requires cloud sync)
- [ ] **Shift opening/closing** with cash count (partially done in `ShiftManager.tsx`)
- [ ] **Daily Z-report** (end of day summary matching ZATCA requirements)

### Licensing / Business

- [x] Implement **license key per store** so you can deactivate non-paying customers — `Activation.tsx` + Cloudflare Worker API
- [x] The `Activation.tsx` component exists — wired to the Cloudflare Worker license validation API
- [x] Build a **vendor dashboard** — see `vendor-dashboard/index.html` (standalone HTML, open in any browser)
- [x] Add **in-app update mechanism** — `electron-updater` integrated in `electron/main.cjs` (GitHub Releases)
- [x] Decide on pricing model — see **Pricing Model** section below
- [x] Prepare **Arabic user documentation** — see `docs/GUIDE_AR.md`
- [ ] Get the app tested by real cashiers before selling (usability issues always appear in the field)

### Performance & Reliability

- [ ] Test with **10,000+ products** in inventory (localStorage struggles above ~5MB)
- [ ] Test with **12 months of transaction history** (chart queries may slow down)
- [ ] Add **error boundary** components so a crash in one tab doesn't kill the whole app
- [ ] Add **Sentry or similar** crash reporting so you know when users hit errors
- [ ] Set up a **staging environment** that mirrors production

---

## 5. Recommended Architecture for Scale

```
┌─────────────────────────────────────────────┐
│           Baqala OS Desktop App             │
│         (Electron wrapping the React app)   │
│                                             │
│  ┌─────────────┐    ┌─────────────────────┐ │
│  │  SQLite DB  │    │  Firebase SDK       │ │
│  │  (local,    │◄──►│  (cloud sync when   │ │
│  │   offline)  │    │   online)           │ │
│  └─────────────┘    └─────────────────────┘ │
│                              │              │
│  ┌─────────────────────────┐ │              │
│  │  ZATCA Crypto Module    │ │              │
│  │  - IndexedDB key store  │ │              │
│  │  - UBL XML generator    │ │              │
│  │  - Reporting API client │ │              │
│  └─────────────────────────┘ │              │
└─────────────────────────────┬───────────────┘
                              │ HTTPS
                ┌─────────────▼──────────────┐
                │       Firebase              │
                │  - Firestore (per tenant)   │
                │  - Auth                     │
                │  - App Check                │
                │  - Storage (receipts/logos) │
                └─────────────────────────────┘
                              │
                ┌─────────────▼──────────────┐
                │    Your Vendor Backend      │
                │  - License validation API   │
                │  - ZATCA onboarding proxy   │
                │  - Store management portal  │
                └─────────────────────────────┘
                              │
                ┌─────────────▼──────────────┐
                │    ZATCA Fatoora Portal     │
                │  (one connection per store) │
                └─────────────────────────────┘
```

---

## 6. Immediate Next Steps (Priority Order)

1. **Electron wrapper** — this single change makes data safe and the app feel professional
2. **Real Firebase project** — set up Firestore, Auth, Security Rules
3. **License activation API** — so you can monetize and control access
4. **ZATCA UBL XML + XAdES** — this is the hardest engineering task; consider using an existing Saudi ZATCA SDK or hiring a specialist for this piece
5. **ESC/POS receipt printer** — every Saudi grocery store has a thermal printer; without this you will get refund requests
6. **Arabic user guide** — document how to add products, do a sale, run end-of-day

---

---

## 7. Pricing Model

Recommended pricing for Baqala OS sold to Saudi grocery stores:

| الخطة (Plan) | السعر (Price) | التفاصيل |
|-------------|-------------|---------|
| **اشتراك شهري** Monthly | **149 SAR / month** | Cancel anytime. Includes all updates + WhatsApp support. |
| **اشتراك سنوي** Annual | **999 SAR / year** | Save 43% vs monthly. Billed once per year. |
| **ترخيص دائم** Lifetime | **2,500 SAR** one-time + **500 SAR/year** support | Own it forever. Annual support renewal optional. |

**Recommended model:** Start with **monthly subscriptions** for cash flow predictability and lower barrier to entry. Offer the annual plan as an upsell after the first month.

### Revenue Projections

| Stores | Monthly | Annual |
|--------|---------|--------|
| 50 | 7,450 SAR | 89,400 SAR |
| 200 | 29,800 SAR | 357,600 SAR |
| 500 | 74,500 SAR | 894,000 SAR |

### Payment Collection Options

- **STC Pay** / **Mada** — direct bank transfer with payment reference = License ID
- **Moyasar** or **Tap Payments** — embed a payment link; webhook auto-provisions the license via the Cloudflare Worker
- **Manual** — customer pays via bank transfer, you create the license in `vendor-dashboard/index.html`

---

## 8. Go-Live Deployment Checklist

Complete these steps **in order** before distributing to customers:

### Step 1 — Deploy Cloudflare Worker

```bash
cd cf-worker
npm install
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

Note the deployed URL (e.g. `https://baqala-license.YOUR.workers.dev`).
See `cf-worker/README.md` for full instructions.

### Step 2 — Configure Environment

Create `.env.local` in the project root:

```
VITE_LICENSE_API_URL=https://baqala-license.YOUR.workers.dev
```

### Step 3 — Seed Initial Licenses

Open `vendor-dashboard/index.html` in your browser:
1. Enter your Worker URL and admin token
2. Use **Create License** to provision the first batch of licenses
3. Recommended: pre-create 200 licenses (e.g. `BQ-2026-0001` through `BQ-2026-0200`)
4. Store the license IDs and keys in a spreadsheet — hand them to customers one by one

### Step 4 — Build the Installer

```bash
npm run build          # builds the React app into /dist
npm run electron:build # packages as Windows .exe installer
```

Output: `dist-electron/BaqalaOS Setup X.X.X.exe`

### Step 5 — Set Up GitHub Releases (for auto-update)

1. Push your code to a GitHub repo named `baqala-os`
2. Update `electron-builder.yml` → replace `YOUR_GITHUB_USERNAME` with your actual username
3. Create a GitHub release tagged `vX.X.X` and upload the installer
4. `electron-updater` will automatically detect new releases and notify users

### Step 6 — Distribute to Customers

1. Send the installer `.exe` to the customer (via WhatsApp, Google Drive, etc.)
2. Customer installs and opens the app
3. Customer enters their **License ID** and **License Key** on the activation screen
4. Activation calls your Cloudflare Worker — on success, the app unlocks

### Step 7 — Ongoing Operations

| Task | Frequency | Tool |
|------|-----------|------|
| Check active licenses | Weekly | `vendor-dashboard/index.html` |
| Revoke non-paying customers | Monthly | Dashboard → Revoke button |
| Push app update | As needed | GitHub Release + electron-updater auto-notifies users |
| ZATCA CSID renewal | Annually | Customer does it in-app, or you assist remotely |
| Support requests | On demand | WhatsApp +966 570 030 313 |

---

*Last updated: August 2026. ZATCA regulations are updated frequently — always verify against the latest Fatoora developer documentation at [zatca.gov.sa](https://zatca.gov.sa).*
