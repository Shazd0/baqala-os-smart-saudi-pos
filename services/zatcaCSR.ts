/**
 * ZATCA Phase 2 — PKCS#10 CSR Generator
 *
 * Generates a proper X.509 EC P-256 certificate request with ZATCA-required
 * fields using the Web Crypto API and a minimal inline ASN.1 DER encoder.
 * No external dependencies.
 */

// ── ASN.1 DER encoder ────────────────────────────────────────────────────────

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function encodeLength(len: number): Uint8Array {
  if (len < 0x80) return new Uint8Array([len]);
  if (len < 0x100) return new Uint8Array([0x81, len]);
  if (len < 0x10000) return new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
  throw new Error(`ASN.1 length ${len} exceeds 65535`);
}

function tlv(tag: number, content: Uint8Array): Uint8Array {
  return concat(new Uint8Array([tag]), encodeLength(content.length), content);
}

const asn1 = {
  seq:   (c: Uint8Array) => tlv(0x30, c),
  set_:  (c: Uint8Array) => tlv(0x31, c),
  ctx0:  (c: Uint8Array) => tlv(0xa0, c),  // [0] constructed
  ctx4:  (c: Uint8Array) => tlv(0xa4, c),  // [4] constructed (directoryName in GeneralName)
  int:   (n: number)     => { if (n < 128) return tlv(0x02, new Uint8Array([n])); const b: number[] = []; let v = n; while (v > 0) { b.unshift(v & 0xff); v >>>= 8; } if (b[0] & 0x80) b.unshift(0); return tlv(0x02, new Uint8Array(b)); },
  bits:  (data: Uint8Array, unused = 0) => tlv(0x03, concat(new Uint8Array([unused]), data)),
  octs:  (data: Uint8Array) => tlv(0x04, data),
  null_: () => new Uint8Array([0x05, 0x00]),
  bool:  (v: boolean) => tlv(0x01, new Uint8Array([v ? 0xff : 0x00])),
  utf8:  (s: string)  => tlv(0x0c, new TextEncoder().encode(s)),
  print: (s: string)  => tlv(0x13, new TextEncoder().encode(s)),
  ia5:   (s: string)  => tlv(0x16, new TextEncoder().encode(s)),
  oid:   (dotted: string): Uint8Array => {
    const parts = dotted.split('.').map(Number);
    const bytes: number[] = [parts[0] * 40 + parts[1]];
    for (let i = 2; i < parts.length; i++) {
      const v = parts[i];
      if (v < 128) { bytes.push(v); continue; }
      const enc: number[] = [];
      let n = v;
      while (n > 0) { enc.unshift(n & 0x7f); n >>>= 7; }
      for (let j = 0; j < enc.length - 1; j++) enc[j] |= 0x80;
      bytes.push(...enc);
    }
    return tlv(0x06, new Uint8Array(bytes));
  },
};

// ── OID registry ─────────────────────────────────────────────────────────────

const OID = {
  ecPublicKey:       '1.2.840.10045.2.1',
  prime256v1:        '1.2.840.10045.3.1.7',
  ecdsaWithSHA256:   '1.2.840.10045.4.3.2',
  CN:                '2.5.4.3',
  C:                 '2.5.4.6',
  O:                 '2.5.4.10',
  OU:                '2.5.4.11',
  serialNumber:      '2.5.4.5',
  registeredAddress: '2.5.4.26',
  businessCategory:  '2.5.4.15',
  uid:               '0.9.2342.19200300.100.1.1',
  subjectAltName:    '2.5.29.17',
  extensionRequest:  '1.2.840.113549.1.9.14',
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a single RDN: SET { SEQUENCE { OID, value } } */
function rdn(oidStr: string, value: Uint8Array): Uint8Array {
  return asn1.set_(asn1.seq(concat(asn1.oid(oidStr), value)));
}

/** Convert IEEE P1363 ECDSA signature (r||s, 64 bytes) to DER SEQUENCE { INTEGER r, INTEGER s } */
function p1363ToDer(raw: Uint8Array): Uint8Array {
  const encInt = (bytes: Uint8Array): Uint8Array => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    const trimmed = bytes.slice(start);
    const padded = (trimmed[0] & 0x80) ? concat(new Uint8Array([0x00]), trimmed) : trimmed;
    return tlv(0x02, padded);
  };
  return asn1.seq(concat(encInt(raw.slice(0, 32)), encInt(raw.slice(32, 64))));
}

/** base64-encode a Uint8Array (no external deps) */
function toBase64(bytes: Uint8Array): string {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += alpha[b0 >> 2];
    out += alpha[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : alpha[((b1 & 0xf) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : alpha[b2 & 0x3f];
  }
  return out;
}

function toPem(label: string, der: Uint8Array): string {
  const b64 = toBase64(der);
  const body = (b64.match(/.{1,64}/g) ?? []).join('\n');
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ZatcaCSRParams {
  vatNumber: string;
  organizationName: string;
  organizationIdentifier: string;
  commonName: string;
  address: string;
  invoiceType: 'simplified' | 'standard' | 'both';
  solutionName: string;
  environment: 'sandbox' | 'production';
}

export interface ZatcaCSRResult {
  csrPem: string;
  privateKeyPem: string;
  publicKeyPem: string;
  deviceSerial: string;
}

export async function generateZatcaCSR(params: ZatcaCSRParams): Promise<ZatcaCSRResult> {
  if (!crypto?.subtle) throw new Error('Web Crypto API not available. Serve over HTTPS or localhost.');

  // ── 1. Generate EC P-256 key pair ────────────────────────────────────────
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;

  // ── 2. Export SPKI (SubjectPublicKeyInfo) and PKCS#8 private key ─────────
  const [spkiDer, pkcs8Der] = await Promise.all([
    crypto.subtle.exportKey('spki', keyPair.publicKey),
    crypto.subtle.exportKey('pkcs8', keyPair.privateKey),
  ]);
  const spkiBytes  = new Uint8Array(spkiDer);
  const pkcs8Bytes = new Uint8Array(pkcs8Der);

  // ── 3. Device serial (CN) ─────────────────────────────────────────────────
  const timestamp  = Date.now().toString(36).toUpperCase();
  const random     = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const deviceSerial = params.organizationIdentifier?.trim()
    || `1-${params.solutionName.slice(0, 12).replace(/\s+/g, '')}|2-${timestamp}|3-${random}`;

  // ── 4. Subject Name (RDNSequence) ────────────────────────────────────────
  // ZATCA requires: C=SA, O=<business>, OU=<solution>, CN=<device serial>
  const subject = asn1.seq(concat(
    rdn(OID.C,  asn1.print('SA')),
    rdn(OID.O,  asn1.utf8(params.organizationName)),
    rdn(OID.OU, asn1.utf8(params.solutionName)),
    rdn(OID.CN, asn1.utf8(deviceSerial)),
  ));

  // ── 5. SubjectAltName extension with ZATCA-specific OIDs ─────────────────
  // Use directoryName [4] GeneralName entries for each ZATCA field.
  // businessCategory: "B2C" for simplified, "B2B" for standard, "B2C/B2B" for both
  const bizCategory = params.invoiceType === 'standard' ? 'B2B'
    : params.invoiceType === 'both' ? 'B2C B2B' : 'B2C';

  // Each directoryName GeneralName = CONTEXT [4] constructed { Name }
  // Name = SEQUENCE OF RelativeDistinguishedName
  const dirName = (oidStr: string, val: Uint8Array) =>
    asn1.ctx4(asn1.seq(rdn(oidStr, val)));

  const sanValue = asn1.seq(concat(
    dirName(OID.uid,               asn1.utf8(params.vatNumber)),
    dirName(OID.registeredAddress, asn1.utf8(params.address)),
    dirName(OID.businessCategory,  asn1.print(bizCategory)),
  ));

  // Extension ::= SEQUENCE { extnID OID, critical BOOLEAN DEFAULT FALSE, extnValue OCTET STRING }
  const sanExt = asn1.seq(concat(
    asn1.oid(OID.subjectAltName),
    asn1.octs(sanValue),
  ));

  // Extensions SEQUENCE (wrapper for PKCS#10 extensionRequest)
  const extensionsSeq = asn1.seq(sanExt);

  // extensionRequest Attribute = SEQUENCE { OID, SET { value } }
  const extReqAttr = asn1.seq(concat(
    asn1.oid(OID.extensionRequest),
    asn1.set_(extensionsSeq),
  ));

  // Attributes [0] IMPLICIT = context-0 constructed
  const attributes = asn1.ctx0(extReqAttr);

  // ── 6. CertificationRequestInfo ──────────────────────────────────────────
  const certReqInfo = asn1.seq(concat(
    asn1.int(0),  // version v1
    subject,
    spkiBytes,    // SubjectPublicKeyInfo (already DER-encoded from Web Crypto export)
    attributes,
  ));

  // ── 7. Sign with ECDSA P-256 / SHA-256 ───────────────────────────────────
  const rawSig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keyPair.privateKey,
    certReqInfo,
  );

  // Convert P1363 (r||s) → DER SEQUENCE { INTEGER r, INTEGER s }
  const derSig = p1363ToDer(new Uint8Array(rawSig));

  // ── 8. AlgorithmIdentifier for ecdsa-with-SHA256 (no parameters) ─────────
  const sigAlgId = asn1.seq(asn1.oid(OID.ecdsaWithSHA256));

  // ── 9. Assemble CertificationRequest ─────────────────────────────────────
  const csrDer = asn1.seq(concat(
    certReqInfo,
    sigAlgId,
    asn1.bits(derSig),
  ));

  return {
    csrPem:        toPem('CERTIFICATE REQUEST', csrDer),
    privateKeyPem: toPem('PRIVATE KEY', pkcs8Bytes),
    publicKeyPem:  toPem('PUBLIC KEY', spkiBytes),
    deviceSerial,
  };
}

/**
 * Import a PKCS#8 PEM private key for signing.
 * Returns a CryptoKey or throws on invalid input.
 */
export async function importPrivateKeyFromPem(pem: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der  = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}
