# ZATCA Phase 2 Real Setup And Implementation Guide

This guide explains what is needed to connect Baqala OS to real ZATCA Phase 2 e-invoicing for a Saudi baqala. It is written as an implementation and shop setup checklist.

Important: do not sell or advertise the system as ZATCA certified until the exact production implementation has passed ZATCA onboarding/compliance testing and has been reviewed with a Saudi VAT/e-invoicing specialist.

## 1. What ZATCA Connects To

ZATCA connects to the taxable business, not to a random device.

For each baqala installation you need:

- Legal business name.
- Arabic business name.
- 15-digit VAT number.
- Commercial registration details.
- National address/building/street/city/postal details.
- Access to the business account in the ZATCA/Fatoora portal.
- A POS device identity for that branch/register.
- Internet access for reporting when available.

The VAT number entered in Baqala OS must be the real registered VAT number for that shop/company.

## 2. ZATCA Environments

Use environments in this order:

1. Developer/sandbox environment.
2. Simulation/compliance environment if required for your onboarding flow.
3. Production environment.

Never start with production credentials. First prove that invoice XML, QR, hash, ICV, PIH, signatures, and API responses are correct in sandbox.

## 3. Data Baqala OS Must Store

For every device/register:

- Device/register identifier.
- Branch/store information.
- VAT number.
- ECDSA private key.
- Public key.
- CSR payload.
- Compliance CSID.
- Production CSID.
- Certificate.
- Secret/token/API credentials.
- Last ICV number.
- Last PIH value.
- ZATCA endpoint URLs.
- Invoice reporting response history.

Private keys and secrets must stay on the computer and must not be exported casually. Backups should be protected.

## 4. CSR Generation Checklist

The app must generate:

- ECDSA key pair.
- CSR containing the required ZATCA/device fields.
- CSR encoded in the format expected by ZATCA.
- Private key stored securely on the same POS device.

Typical CSR fields to confirm with official ZATCA documentation:

- Common name/device name.
- Organization identifier/VAT number.
- Organization unit/branch.
- Organization legal name.
- Country: SA.
- Invoice type support.
- Location/address.
- Industry/business category.

Current app status:

- Baqala OS can generate a local ECDSA key pair and CSR payload placeholder.
- The final CSR field format must be aligned with the latest official ZATCA requirements before live onboarding.

## 5. Sandbox Onboarding Steps

For each baqala:

1. Install Baqala OS on the register computer.
2. Complete first-run setup with real store details.
3. Go to Settings > ZATCA Phase 2.
4. Set mode to Sandbox.
5. Generate CSR payload.
6. Use the business ZATCA/Fatoora portal or onboarding API to submit CSR.
7. Receive compliance CSID/certificate/secret.
8. Enter the returned sandbox credentials into Baqala OS.
9. Save ZATCA settings.
10. Create test sales in Baqala OS.
11. Confirm every invoice has:
    - UUID.
    - ICV.
    - PIH.
    - Invoice hash.
    - ECDSA signature.
    - UBL XML.
    - TLV QR.
12. Send/report sandbox invoices to ZATCA.
13. Store and review API responses.
14. Fix any validation errors.
15. Repeat until all required test cases pass.

## 6. Production Onboarding Steps

Only after sandbox/compliance testing:

1. Request/activate production CSID through the official flow.
2. Store production CSID/certificate/secret in Baqala OS.
3. Change mode to Production.
4. Run a controlled first production invoice.
5. Confirm ZATCA accepted/reported it.
6. Train cashier/manager on offline queue and error handling.
7. Keep backups enabled.

## 7. Invoice Generation Requirements

Each invoice must be immutable after issue.

For simplified tax invoices, the app must generate and store:

- Invoice number.
- UUID.
- Issue date/time.
- Seller details.
- VAT number.
- Line items.
- VAT totals.
- Selective tax where applicable.
- Total payable amount.
- Payment method.
- ICV.
- PIH.
- Invoice hash.
- ECDSA signature.
- Signed UBL XML.
- QR code data.
- ZATCA status.
- API response payload.

Refunds must be credit notes linked to the original invoice.

## 8. Offline Queue Rules

When internet or ZATCA API is unavailable:

1. Still issue and sign the invoice locally.
2. Store invoice in an offline queue.
3. Do not edit issued invoice totals.
4. Retry reporting automatically when online.
5. Show manager-visible failures.
6. Preserve retry attempts and API errors in audit logs.

## 9. API Client Implementation Steps

The production API module should implement:

1. `generateCsr(store, device)` using official field format.
2. `onboardComplianceCsid(csr, otp)` if using API onboarding.
3. `validateComplianceInvoice(xml)`.
4. `activateProductionCsid(...)`.
5. `reportSimplifiedInvoice(xml, invoiceHash, uuid)`.
6. `clearStandardInvoice(xml, invoiceHash, uuid)` if standard invoices are supported.
7. `retryPendingInvoices()`.
8. `storeZatcaResponse(invoiceId, response)`.
9. `markInvoiceReported(invoiceId)`.
10. `markInvoiceFailed(invoiceId, error)`.

## 10. Shop Installation Checklist

At the baqala:

1. Install the app.
2. Connect barcode scanner as USB keyboard mode.
3. Connect receipt printer and install Windows/macOS driver.
4. Set printer as available in OS.
5. Connect cash drawer to receipt printer RJ11/RJ12 port if supported.
6. Configure printer name and receipt size in Settings.
7. Create administrator and cashier username/password accounts.
8. Enter real VAT/store details.
9. Configure ZATCA sandbox first.
10. Add/import products.
11. Run test sale.
12. Print receipt.
13. Check Compliance screen.
14. Create backup.
15. Train staff on open shift, sale, refund, close shift, and backup.

## 11. What Still Needs Official Verification

- Exact CSR schema and extensions.
- Official endpoints and auth headers for current ZATCA environment.
- QR fields required for the invoice type.
- UBL canonicalization/signature profile.
- Compliance test cases.
- Error/retry time limits.
- Production onboarding approval.

Keep this file updated whenever ZATCA changes requirements.
