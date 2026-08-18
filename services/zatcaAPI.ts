/**
 * ZATCA Phase 2 — Fatoora API Client
 *
 * Implements the ZATCA e-Invoicing API endpoints for:
 *   - CSR compliance submission (onboarding Step 1)
 *   - Compliance check invoices (onboarding Step 2)
 *   - Production CSID issuance (onboarding Step 3)
 *   - Invoice reporting (simplified B2C, within 24h)
 *   - Invoice clearance (standard B2B, real-time)
 *
 * Endpoints from ZATCA Fatoora Developer Portal V3.
 */

// ── Base URLs ─────────────────────────────────────────────────────────────────

const SANDBOX_BASE = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal';
const PROD_BASE    = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core';

function base(env: 'sandbox' | 'production'): string {
  return env === 'production' ? PROD_BASE : SANDBOX_BASE;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

function buildAuthHeader(csid: string, secret: string): string {
  return 'Basic ' + btoa(`${csid}:${secret}`);
}

function commonHeaders(csid: string, secret: string): Record<string, string> {
  return {
    'Content-Type':   'application/json',
    'Accept-Version': 'V2',
    'Accept-Language': 'en',
    'Authorization': buildAuthHeader(csid, secret),
  };
}

// ── Error wrapper ─────────────────────────────────────────────────────────────

export interface ZatcaApiError {
  ok: false;
  statusCode: number;
  message: string;
  body?: unknown;
}

async function apiCall<T>(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: object,
): Promise<T | ZatcaApiError> {
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text().catch(() => '');
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    if (!res.ok) {
      return {
        ok: false,
        statusCode: res.status,
        message: `ZATCA API error ${res.status}: ${res.statusText}`,
        body: parsed,
      } satisfies ZatcaApiError;
    }

    return parsed as T;
  } catch (err) {
    return {
      ok: false,
      statusCode: 0,
      message: err instanceof Error ? err.message : 'Network error',
    } satisfies ZatcaApiError;
  }
}

export function isApiError(v: unknown): v is ZatcaApiError {
  return typeof v === 'object' && v !== null && (v as ZatcaApiError).ok === false;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ZatcaOnboardingResult {
  binarySecurityToken: string;    // base64 PEM certificate
  secret: string;                 // base64 HMAC secret
  tokenType: string;
  disposedIndicator?: string;
  complianceRequestId?: string;
  requestID?: string;
}

export interface ZatcaValidationResults {
  status: string;
  errorMessages:   { type: string; code: string; category: string; message: string; status: string }[];
  warningMessages: { type: string; code: string; category: string; message: string; status: string }[];
}

export interface ZatcaReportResult {
  reportingStatus?: string;
  clearedInvoice?:  string;
  validationResults: ZatcaValidationResults;
}

export interface ZatcaProductionCsidResult {
  issuedToPartyNumber?: string;
  issuedRequestID?:     string;
  binarySecurityToken:  string;
  secret:               string;
  tokenType:            string;
}

// ── Step 1: Submit CSR → get Compliance CSID ─────────────────────────────────

/**
 * Submit a PKCS#10 CSR to ZATCA and receive a compliance CSID.
 * @param csrPem  PEM-encoded CSR (-----BEGIN CERTIFICATE REQUEST-----)
 * @param otp     6-digit OTP from the Fatoora portal
 */
export async function submitCSRForCompliance(
  csrPem: string,
  otp: string,
  environment: 'sandbox' | 'production',
): Promise<ZatcaOnboardingResult | ZatcaApiError> {
  // Strip PEM headers — ZATCA expects bare base64
  const csrBase64 = csrPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');

  return apiCall<ZatcaOnboardingResult>(
    `${base(environment)}/compliance`,
    'POST',
    {
      'Content-Type':   'application/json',
      'Accept-Version': 'V2',
      'Accept-Language': 'en',
      'OTP': otp,
    },
    { csr: csrBase64 },
  );
}

// ── Step 2: Compliance Check ─────────────────────────────────────────────────

/**
 * Send a test invoice to the ZATCA compliance-check endpoint.
 * Must be called 6 times with different invoice types for full compliance.
 */
export async function runComplianceCheck(
  signedXml:        string,
  invoiceHash:      string,
  uuid:             string,
  complianceCsid:   string,
  complianceSecret: string,
  environment:      'sandbox' | 'production',
): Promise<ZatcaReportResult | ZatcaApiError> {
  const xmlB64 = btoa(unescape(encodeURIComponent(signedXml)));

  return apiCall<ZatcaReportResult>(
    `${base(environment)}/compliance/invoices`,
    'POST',
    commonHeaders(complianceCsid, complianceSecret),
    {
      invoiceHash,
      uuid,
      invoice: xmlB64,
    },
  );
}

// ── Step 3: Production CSID ───────────────────────────────────────────────────

/**
 * Exchange the compliance CSID for a production CSID.
 * Call only after all 6 compliance invoices pass.
 */
export async function getProductionCsid(
  complianceCsid:     string,
  complianceSecret:   string,
  complianceRequestId: string,
  environment:        'sandbox' | 'production',
): Promise<ZatcaProductionCsidResult | ZatcaApiError> {
  return apiCall<ZatcaProductionCsidResult>(
    `${base(environment)}/production/csids`,
    'POST',
    commonHeaders(complianceCsid, complianceSecret),
    { compliance_request_id: complianceRequestId },
  );
}

// ── Step 4a: Report simplified invoice ───────────────────────────────────────

/**
 * Report a simplified (B2C) invoice to ZATCA within 24 hours of issuance.
 * No real-time clearance required for simplified invoices < 1,000 SAR.
 */
export async function reportInvoice(
  signedXml:        string,
  invoiceHash:      string,
  uuid:             string,
  productionCsid:   string,
  productionSecret: string,
  environment:      'sandbox' | 'production',
): Promise<ZatcaReportResult | ZatcaApiError> {
  const xmlB64 = btoa(unescape(encodeURIComponent(signedXml)));

  return apiCall<ZatcaReportResult>(
    `${base(environment)}/invoices/reporting/single`,
    'POST',
    commonHeaders(productionCsid, productionSecret),
    {
      invoiceHash,
      uuid,
      invoice: xmlB64,
    },
  );
}

// ── Step 4b: Clear standard invoice ──────────────────────────────────────────

/**
 * Submit a standard (B2B) invoice for real-time clearance.
 * Required for all B2B invoices before issuing to buyer.
 */
export async function clearInvoice(
  signedXml:        string,
  invoiceHash:      string,
  uuid:             string,
  productionCsid:   string,
  productionSecret: string,
  environment:      'sandbox' | 'production',
): Promise<ZatcaReportResult | ZatcaApiError> {
  const xmlB64 = btoa(unescape(encodeURIComponent(signedXml)));

  return apiCall<ZatcaReportResult>(
    `${base(environment)}/invoices/clearance/single`,
    'POST',
    {
      ...commonHeaders(productionCsid, productionSecret),
      'Clearance-Status': '1',
    },
    {
      invoiceHash,
      uuid,
      invoice: xmlB64,
    },
  );
}

// ── Certificate PEM decoder ───────────────────────────────────────────────────

/**
 * Decode a ZATCA binarySecurityToken (base64 of PEM) into a usable PEM string.
 * ZATCA returns certificates as base64(PEM), not base64(DER).
 */
export function decodeZatcaCertificate(binarySecurityToken: string): string {
  try {
    const decoded = atob(binarySecurityToken);
    // If the decoded string already contains PEM markers, use as-is
    if (decoded.includes('-----BEGIN')) return decoded;
    // Otherwise wrap in PEM headers
    const body = (binarySecurityToken.match(/.{1,64}/g) ?? []).join('\n');
    return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`;
  } catch {
    return `-----BEGIN CERTIFICATE-----\n${binarySecurityToken}\n-----END CERTIFICATE-----`;
  }
}

/**
 * Parse the notAfter date from a PEM-encoded X.509 certificate by walking
 * the DER structure:
 *   SEQUENCE (Certificate)
 *     SEQUENCE (TBSCertificate)
 *       [0] version (optional)
 *       INTEGER  serialNumber
 *       SEQUENCE signature
 *       SEQUENCE issuer
 *       SEQUENCE Validity
 *         UTCTime | GeneralizedTime  notBefore  (skip)
 *         UTCTime | GeneralizedTime  notAfter   <-- parse this
 */
export function parseCertExpiry(certPem: string): Date | null {
  try {
    const b64 = certPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const der  = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    let pos = 0;

    function readLen(): number {
      const f = der[pos++];
      if (f < 0x80) return f;
      const n = f & 0x7f;
      let l = 0;
      for (let i = 0; i < n; i++) l = (l << 8) | der[pos++];
      return l;
    }

    function expectTag(tag: number): void {
      const got = der[pos++];
      if (got !== tag) throw new Error(`Expected 0x${tag.toString(16)}, got 0x${got.toString(16)} at ${pos - 1}`);
    }

    function skipTLV(): void {
      pos++;           // tag
      pos += readLen(); // skip content
    }

    function parseDateBytes(tag: number, len: number): Date {
      const str = new TextDecoder('ascii').decode(der.slice(pos, pos + len));
      pos += len;
      if (tag === 0x17) {
        // UTCTime: YYMMDDHHMMSSZ  (2-digit year: ≥50 → 19xx, <50 → 20xx)
        const yy   = parseInt(str.slice(0, 2), 10);
        return new Date(Date.UTC(
          yy >= 50 ? 1900 + yy : 2000 + yy,
          parseInt(str.slice(2,  4), 10) - 1,
          parseInt(str.slice(4,  6), 10),
          parseInt(str.slice(6,  8), 10),
          parseInt(str.slice(8,  10), 10),
          parseInt(str.slice(10, 12), 10),
        ));
      }
      // GeneralizedTime: YYYYMMDDHHMMSSZ
      return new Date(Date.UTC(
        parseInt(str.slice(0, 4),  10),
        parseInt(str.slice(4, 6),  10) - 1,
        parseInt(str.slice(6, 8),  10),
        parseInt(str.slice(8, 10), 10),
        parseInt(str.slice(10, 12), 10),
        parseInt(str.slice(12, 14), 10),
      ));
    }

    // Certificate SEQUENCE
    expectTag(0x30); readLen();
    // TBSCertificate SEQUENCE
    expectTag(0x30); readLen();
    // version [0] EXPLICIT OPTIONAL
    if (der[pos] === 0xa0) skipTLV();
    // serialNumber INTEGER
    skipTLV();
    // signature AlgorithmIdentifier SEQUENCE
    skipTLV();
    // issuer Name SEQUENCE
    skipTLV();

    // Validity SEQUENCE
    expectTag(0x30); readLen();

    // notBefore — skip
    const nbTag = der[pos++];
    const nbLen = readLen();
    if (nbTag !== 0x17 && nbTag !== 0x18) throw new Error('Invalid notBefore tag');
    pos += nbLen;

    // notAfter — parse
    const naTag = der[pos++];
    const naLen = readLen();
    if (naTag !== 0x17 && naTag !== 0x18) throw new Error('Invalid notAfter tag');
    return parseDateBytes(naTag, naLen);
  } catch {
    return null;
  }
}
