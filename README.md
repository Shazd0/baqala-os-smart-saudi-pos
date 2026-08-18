# Baqala OS

Grocery POS for Saudi baqalas — barcode checkout, inventory, credit book, and ZATCA-ready invoices.

## Development

```bash
npm install
npm run dev
```

For a production website build:

```bash
npm run build
```

## Live Code Sync

This repo includes a small Python helper that keeps local code and GitHub in sync by using normal Git commits, pulls, and pushes.

Run one sync:

```bash
python3 scripts/live_git_sync.py --once
```

Keep syncing every 30 seconds:

```bash
python3 scripts/live_git_sync.py
```

Preview what it would do without changing Git:

```bash
python3 scripts/live_git_sync.py --dry-run --once
```

## Data Storage

Oasis Dine RMS is a web-only Firebase application. Production data must be stored in Firebase/Firestore only; the app does not use a packaged EXE, SQLite database, local JSON server, or browser `localStorage` persistence.

## Production Notes

- The app starts with a first-run setup wizard for the store name, CR, VAT, and admin account.
- Users sign in with username/password and either Administrator or Cashier role before accessing the POS.
- Card payments use an external Mada/card terminal workflow. The cashier enters the approval, RRN, or reference number before saving the bill.
- ZATCA support prepares local invoice hashes, signatures, QR data, and UBL XML queue records. Official ZATCA onboarding, API reporting/clearance, sandbox validation, and compliance review are still required before marketing the app as certified.
- Production activation uses the configured web activation API. Do not persist activation or business records in device-local storage.
