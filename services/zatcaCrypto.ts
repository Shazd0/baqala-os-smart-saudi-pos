/*
 * ZATCA-STYLE INVOICE CRYPTOGRAPHY — WHAT THIS IS, AND WHAT IT IS NOT
 * ===================================================================
 *
 * WHAT IS REAL HERE:
 *   - Real SHA-256 digests via the Web Crypto API (crypto.subtle.digest).
 *   - A real tamper-evident hash chain: every invoice hash is computed over the
 *     previous invoice hash (PIH) plus a deterministic canonical form of the
 *     invoice, so editing or removing any earlier invoice breaks every later link.
 *   - Real ECDSA P-256 / SHA-256 signatures over each invoice hash
 *     (crypto.subtle.sign) with a persistent device key pair, verifiable via
 *     crypto.subtle.verify.
 *
 * WHAT IS **NOT** IMPLEMENTED — THIS IS NOT ZATCA-CERTIFIED:
 *   - No CSR onboarding against ZATCA's onboarding API.
 *   - No ZATCA-issued CSID / compliance or production certificate. The signing
 *     key here is self-generated on the device, not chained to any ZATCA CA.
 *   - No UBL 2.1 XML invoice generation, and therefore none of the XML
 *     canonicalisation / XAdES enveloped-signature structure ZATCA mandates.
 *   - No reporting (simplified) or clearance (standard) API calls, no QR/TLV
 *     payload built from a ZATCA certificate.
 *   - ZATCA's compliance test suite has not been run against this.
 *
 * In short: this gives a genuine offline integrity + signature chain suitable for
 * internal audit, and it is an honest foundation for Phase 2, but an accredited
 * ZATCA Phase 2 e-invoicing solution requires all of the above in addition.
 *
 * No external dependencies: Web Crypto API only.
 */

/**
 * ZATCA's genesis "previous invoice hash" (PIH) for the first invoice of a chain.
 * It is the base64 encoding of the *hex* SHA-256 digest of the single character "0":
 *   sha256("0") = 5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9
 *   base64(that hex text) = the constant below.
 */
export const ZATCA_GENESIS_PIH =
  'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

/** Marker prefix used when crypto.subtle is unavailable, so a fake digest can never pass as real. */
export const INSECURE_HASH_PREFIX = 'INSECURE:';

/**
 * IndexedDB database name and object-store for persisting the device signing key.
 * The CryptoKey object is stored directly — private key material NEVER leaves the
 * browser's secure key store as raw bytes or JWK.
 */
const IDB_NAME = 'baqala-zatca-v1';
const IDB_STORE = 'keys';
const IDB_KEY_RECORD = 'device-signing-key';

/** @deprecated Use IndexedDB storage instead. Only kept for one-time migration. */
export const SIGNING_KEY_STORAGE_KEY = 'baqala.zatca.signingKey.v1';

/** Version tag baked into the canonical string so a future format change is never silently mixed in. */
const CANONICAL_FORMAT = 'BAQALA-ZATCA-CANONICAL-V1';

const ECDSA_KEY_PARAMS = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const ECDSA_SIGN_PARAMS = { name: 'ECDSA', hash: 'SHA-256' } as const;

export interface HashableInvoiceItem {
  id?: string;
  quantity?: number;
  price?: number;
}

/** Structural subset of `Transaction` that participates in hashing. */
export interface HashableInvoice {
  id: string;
  timestamp: number;
  total: number;
  vat: number;
  items?: HashableInvoiceItem[];
}

export interface ZatcaSigningKey {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  /** SPKI DER, base64 — the raw exported public key. */
  publicKeyBase64: string;
  /** Same key wrapped as a PEM block, for display / export. */
  publicKeyPem: string;
  createdAt: number;
}

// ── Environment helpers ─────────────────────────────────────────────────────

type SubtleLike = Crypto['subtle'];

function getCrypto(): Crypto | null {
  const candidate = (globalThis as { crypto?: Crypto }).crypto;
  return candidate ?? null;
}

function getSubtle(): SubtleLike | null {
  const candidate = getCrypto();
  if (!candidate) return null;
  const subtle = candidate.subtle as SubtleLike | undefined;
  return subtle && typeof subtle.digest === 'function' ? subtle : null;
}

/**
 * True when genuine SHA-256 + ECDSA are available. False on insecure origins
 * (plain http on a non-localhost host), where `crypto.subtle` is not exposed.
 */
export function isRealCryptoAvailable(): boolean {
  return getSubtle() !== null;
}

// ── IndexedDB key persistence ────────────────────────────────────────────────

interface StoredKeyRecord {
  privateKey: CryptoKey;   // non-extractable — key material never leaves the browser
  publicKey: CryptoKey;    // extractable (public keys are safe to export)
  publicKeyBase64: string;
  publicKeyPem: string;
  createdAt: number;
}

function openKeyIDB(): Promise<IDBDatabase | null> {
  try {
    const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (!idb) return Promise.resolve(null);
    return new Promise(resolve => {
      const req = idb.open(IDB_NAME, 1);
      req.onupgradeneeded = e => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => resolve(null);
    });
  } catch {
    return Promise.resolve(null);
  }
}

async function readKeyRecord(): Promise<StoredKeyRecord | null> {
  const db = await openKeyIDB();
  if (!db) return null;
  return new Promise(resolve => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY_RECORD);
    req.onsuccess = () => resolve((req.result as StoredKeyRecord) ?? null);
    req.onerror   = () => resolve(null);
  });
}

async function writeKeyRecord(record: StoredKeyRecord): Promise<void> {
  const db = await openKeyIDB();
  if (!db) return;
  return new Promise(resolve => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(record, IDB_KEY_RECORD);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => resolve();
  });
}

/** One-time migration: import JWKs from localStorage into IndexedDB then delete. */
async function migrateFromLocalStorage(subtle: SubtleLike): Promise<StoredKeyRecord | null> {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (!ls) return null;
    const raw = ls.getItem(SIGNING_KEY_STORAGE_KEY);
    if (!raw) return null;
    const material = JSON.parse(raw) as { createdAt: number; privateKeyJwk: JsonWebKey; publicKeyJwk: JsonWebKey };
    if (!material?.privateKeyJwk || !material?.publicKeyJwk) return null;
    // Re-import as NON-EXTRACTABLE — key material finally locked inside the browser.
    const [privateKey, publicKey] = await Promise.all([
      subtle.importKey('jwk', material.privateKeyJwk, ECDSA_KEY_PARAMS, false, ['sign']),
      subtle.importKey('jwk', material.publicKeyJwk,  ECDSA_KEY_PARAMS, true,  ['verify']),
    ]);
    const spki = await subtle.exportKey('spki', publicKey);
    const publicKeyBase64 = bytesToBase64(new Uint8Array(spki));
    const record: StoredKeyRecord = {
      privateKey, publicKey, publicKeyBase64,
      publicKeyPem: toPem(publicKeyBase64),
      createdAt: material.createdAt ?? Date.now(),
    };
    await writeKeyRecord(record);
    ls.removeItem(SIGNING_KEY_STORAGE_KEY); // wipe the plaintext JWK
    return record;
  } catch {
    return null;
  }
}

// ── Encoding helpers (self-contained, no atob/btoa dependency) ──────────────

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : B64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : B64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

export function base64ToBytes(value: string): Uint8Array {
  const clean = String(value || '').replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byteIndex = 0;
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const index = B64_ALPHABET.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[byteIndex++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes.subarray(0, byteIndex);
}

function utf8Bytes(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

// ── Canonical invoice form ──────────────────────────────────────────────────

function fixed(value: unknown, decimals: number): string {
  const numeric = Number(value);
  return (Number.isFinite(numeric) ? numeric : 0).toFixed(decimals);
}

function isoTimestamp(timestamp: unknown): string {
  const numeric = Number(timestamp);
  const date = new Date(Number.isFinite(numeric) ? numeric : 0);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

/**
 * Deterministic canonical text for an invoice. Pure: identical input always
 * yields identical output. Field order is fixed explicitly (never derived from
 * object key order) and line items are sorted, so array order cannot change the
 * digest. No clock, no randomness.
 */
export function canonicalInvoiceString(tx: HashableInvoice, sellerVat: string): string {
  const lines = (tx.items ?? []).map(item =>
    [String(item?.id ?? ''), fixed(item?.quantity, 3), fixed(item?.price, 2)].join('|')
  );
  lines.sort();

  const parts = [
    CANONICAL_FORMAT,
    `SELLER_VAT=${String(sellerVat ?? '').trim()}`,
    `INVOICE_ID=${String(tx?.id ?? '')}`,
    `ISSUED_AT=${isoTimestamp(tx?.timestamp)}`,
    `TOTAL=${fixed(tx?.total, 2)}`,
    `VAT=${fixed(tx?.vat, 2)}`,
    `LINE_COUNT=${lines.length}`,
  ];
  lines.forEach((line, index) => parts.push(`LINE[${index}]=${line}`));
  return parts.join('\n');
}

// ── Hashing ─────────────────────────────────────────────────────────────────

/**
 * Non-cryptographic 128-bit FNV-1a fallback. Only ever reached when
 * `crypto.subtle` is missing, and its output is always prefixed with
 * `INSECURE_HASH_PREFIX` so it cannot be mistaken for a SHA-256 digest.
 */
function insecureFallbackDigest(input: string): string {
  const seeds = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  const state = [...seeds];
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    for (let s = 0; s < state.length; s++) {
      state[s] = Math.imul(state[s] ^ (code + s * 31 + i), 0x01000193) >>> 0;
    }
  }
  return state.map(part => (part >>> 0).toString(16).padStart(8, '0')).join('');
}

/**
 * Real SHA-256, base64-encoded. If `crypto.subtle` is unavailable (insecure
 * origin), returns a clearly-marked `INSECURE:` placeholder instead of throwing,
 * so checkout can never fail because crypto is missing.
 */
export async function sha256Base64(input: string): Promise<string> {
  const subtle = getSubtle();
  if (!subtle) return `${INSECURE_HASH_PREFIX}${insecureFallbackDigest(input)}`;
  try {
    const digest = await subtle.digest('SHA-256', utf8Bytes(input));
    return bytesToBase64(new Uint8Array(digest));
  } catch {
    return `${INSECURE_HASH_PREFIX}${insecureFallbackDigest(input)}`;
  }
}

/** SHA-256 over `previousInvoiceHash + canonicalInvoiceString(...)` — this forms the PIH → hash chain. */
export function computeInvoiceHash(
  tx: HashableInvoice,
  sellerVat: string,
  previousInvoiceHash: string
): Promise<string> {
  const pih = previousInvoiceHash || ZATCA_GENESIS_PIH;
  return sha256Base64(`PIH=${pih}\n${canonicalInvoiceString(tx, sellerVat)}`);
}

// ── UUID ────────────────────────────────────────────────────────────────────

/** RFC 4122 v4 UUID. Uses crypto.randomUUID, then getRandomValues, then Math.random. */
export function generateInvoiceUuid(): string {
  const cryptoObj = getCrypto();
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    try {
      return cryptoObj.randomUUID();
    } catch {
      // fall through to the manual paths below
    }
  }
  const bytes = new Uint8Array(16);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ── Signing keys ────────────────────────────────────────────────────────────

function toPem(spkiBase64: string): string {
  const body = spkiBase64.replace(/(.{64})/g, '$1\n').trim();
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

/**
 * Generate a fresh device ECDSA P-256 key pair and persist it to IndexedDB.
 * The private key is NON-EXTRACTABLE — its raw bytes never exist in JavaScript
 * memory or any string/buffer. The public key is exported as SPKI for display.
 */
async function createAndPersistKey(subtle: SubtleLike): Promise<ZatcaSigningKey> {
  // generateKey with extractable=false means the private key material is locked
  // inside the browser's secure store and can only be used for signing operations.
  const pair = (await subtle.generateKey(ECDSA_KEY_PARAMS, false, ['sign', 'verify'])) as CryptoKeyPair;
  // Public key must remain extractable so we can derive its PEM for ZATCA submission.
  // Re-import it as extractable if the browser generated it non-extractable.
  let publicKey = pair.publicKey;
  if (!publicKey.extractable) {
    const spki = await subtle.exportKey('spki', pair.publicKey).catch(() => null);
    if (spki) publicKey = await subtle.importKey('spki', spki, ECDSA_KEY_PARAMS, true, ['verify']);
  }
  const spki = await subtle.exportKey('spki', publicKey);
  const publicKeyBase64 = bytesToBase64(new Uint8Array(spki));
  const record: StoredKeyRecord = {
    privateKey: pair.privateKey,
    publicKey,
    publicKeyBase64,
    publicKeyPem: toPem(publicKeyBase64),
    createdAt: Date.now(),
  };
  await writeKeyRecord(record);
  return { ...record };
}

let signingKeyPromise: Promise<ZatcaSigningKey | null> | null = null;

/**
 * Returns the device ECDSA P-256 signing key, generating and persisting one on
 * first use and reusing it across sessions. Returns `null` (never throws) when
 * Web Crypto is unavailable.
 *
 * Security model:
 *   - Key is persisted as a CryptoKey object in IndexedDB.
 *   - The private key is NON-EXTRACTABLE: its raw bytes never appear in JS.
 *   - On first run, if an old JWK exists in localStorage it is migrated once
 *     and the plaintext JWK is immediately erased.
 */
export function getOrCreateSigningKey(): Promise<ZatcaSigningKey | null> {
  if (signingKeyPromise) return signingKeyPromise;
  const subtle = getSubtle();
  if (!subtle || typeof subtle.generateKey !== 'function') return Promise.resolve(null);

  signingKeyPromise = (async (): Promise<ZatcaSigningKey | null> => {
    // 1. Try IndexedDB (fast path — subsequent runs).
    try {
      const record = await readKeyRecord();
      if (record) {
        return { privateKey: record.privateKey, publicKey: record.publicKey,
                 publicKeyBase64: record.publicKeyBase64, publicKeyPem: record.publicKeyPem,
                 createdAt: record.createdAt };
      }
    } catch { /* ignore — fall through */ }

    // 2. One-time migration from localStorage JWK (old installs).
    try {
      const migrated = await migrateFromLocalStorage(subtle);
      if (migrated) {
        return { privateKey: migrated.privateKey, publicKey: migrated.publicKey,
                 publicKeyBase64: migrated.publicKeyBase64, publicKeyPem: migrated.publicKeyPem,
                 createdAt: migrated.createdAt };
      }
    } catch { /* ignore */ }

    // 3. Generate a fresh key pair.
    try {
      return await createAndPersistKey(subtle);
    } catch (error) {
      console.warn('ZATCA signing key generation failed', error);
      return null;
    }
  })();

  // A failed attempt must not poison later calls.
  void signingKeyPromise.then(key => {
    if (!key) signingKeyPromise = null;
  });

  return signingKeyPromise;
}

/** Public key of the device signing key, PEM-encoded, or null when unavailable. */
export async function getSigningPublicKeyPem(): Promise<string | null> {
  const key = await getOrCreateSigningKey();
  return key?.publicKeyPem ?? null;
}

/**
 * ECDSA P-256 / SHA-256 signature over an invoice hash, base64-encoded.
 * Returns `null` instead of throwing when signing is not possible.
 */
export async function signInvoiceHash(
  hash: string,
  keyPair?: ZatcaSigningKey | null
): Promise<string | null> {
  const subtle = getSubtle();
  if (!subtle || typeof subtle.sign !== 'function') return null;
  const key = keyPair ?? (await getOrCreateSigningKey());
  if (!key) return null;
  try {
    const signature = await subtle.sign(ECDSA_SIGN_PARAMS, key.privateKey, utf8Bytes(hash));
    return bytesToBase64(new Uint8Array(signature));
  } catch (error) {
    console.warn('ZATCA invoice signing failed', error);
    return null;
  }
}

/** Real signature verification via crypto.subtle.verify. Defaults to the device public key. */
export async function verifyInvoiceSignature(
  hash: string,
  signatureB64: string,
  publicKey?: CryptoKey | null
): Promise<boolean> {
  const subtle = getSubtle();
  if (!subtle || typeof subtle.verify !== 'function') return false;
  if (!hash || !signatureB64) return false;
  const key = publicKey ?? (await getOrCreateSigningKey())?.publicKey;
  if (!key) return false;
  try {
    return await subtle.verify(
      ECDSA_SIGN_PARAMS,
      key,
      base64ToBytes(signatureB64) as unknown as ArrayBuffer,
      utf8Bytes(hash) as unknown as ArrayBuffer
    );
  } catch (error) {
    console.warn('ZATCA signature verification failed', error);
    return false;
  }
}
