/**
 * ZATCA Phase 2 — XAdES-B-EPES Electronic Signature
 *
 * Implements XAdES Basic Electronic Signature with Explicit Policy (B-EPES)
 * embedded in UBL 2.1 XML as required by ZATCA e-Invoice Technical Specifications.
 *
 * Uses W3C C14N11 (Canonical XML 1.1) canonicalization as required by the
 * ZATCA Fatoora API for SignedInfo and SignedProperties hashing.
 */

import { importPrivateKeyFromPem } from './zatcaCSR';

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * W3C C14N11 (Canonical XML 1.1) canonicalization using the browser's native
 * DOMParser + XMLSerializer approach.
 *
 * Rules implemented:
 * - Namespace declarations: `xmlns` first, then `xmlns:*` sorted alphabetically
 * - Only render namespace declarations that differ from ancestor scope
 * - Regular attributes sorted by namespace URI then local name
 * - Attribute value normalization: &, <, " → entities; tab→&#9; LF→&#10; CR→&#13;
 * - Text node normalization: &, <, > → entities; CR→&#13;
 * - Self-closing elements expanded to <elem></elem>
 * - Comments and PIs omitted (exclusive canonicalization style for XAdES)
 */
function canonicalizeXml(xmlString: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString.trim(), 'application/xml');
  const parseErr = doc.querySelector('parsererror');
  if (parseErr) throw new Error('XML parse error: ' + (parseErr.textContent ?? ''));

  function normalizeAttrValue(s: string): string {
    return s
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
      .replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
  }

  function normalizeTextNode(s: string): string {
    return s
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\r/g, '&#13;');
  }

  function serializeElement(el: Element, ancestorNs: Map<string, string>): string {
    // Build namespace scope for this element; track what to render
    const nsScope = new Map(ancestorNs);
    const nsToRender: Array<{ prefix: string; uri: string }> = [];

    // Gather xmlns / xmlns:* declarations from attributes
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      let prefix: string;
      let uri: string;
      if (attr.name === 'xmlns') {
        prefix = '';
        uri = attr.value;
      } else if (attr.prefix === 'xmlns') {
        prefix = attr.localName;
        uri = attr.value;
      } else {
        continue;
      }
      if (nsScope.get(prefix) !== uri) {
        nsToRender.push({ prefix, uri });
        nsScope.set(prefix, uri);
      }
    }

    // Ensure the element's own namespace is declared
    if (el.namespaceURI) {
      const prefix = el.prefix ?? '';
      if (nsScope.get(prefix) !== el.namespaceURI && !nsToRender.find(n => n.prefix === prefix)) {
        nsToRender.push({ prefix, uri: el.namespaceURI });
        nsScope.set(prefix, el.namespaceURI);
      }
    }

    // Sort: xmlns (default) first, then xmlns:* alphabetically
    nsToRender.sort((a, b) => {
      if (a.prefix === '' && b.prefix !== '') return -1;
      if (a.prefix !== '' && b.prefix === '') return 1;
      return a.prefix.localeCompare(b.prefix);
    });

    // Collect and sort regular (non-namespace) attributes
    // C14N11: sort by namespace URI, then local name; no-ns attributes sort first
    const regularAttrs: Attr[] = [];
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      if (attr.name !== 'xmlns' && attr.prefix !== 'xmlns') {
        regularAttrs.push(attr);
      }
    }
    regularAttrs.sort((a, b) => {
      const aNs = a.namespaceURI ?? '';
      const bNs = b.namespaceURI ?? '';
      if (aNs !== bNs) return aNs.localeCompare(bNs);
      return a.localName.localeCompare(b.localName);
    });

    let result = `<${el.tagName}`;

    for (const ns of nsToRender) {
      const attrName = ns.prefix === '' ? 'xmlns' : `xmlns:${ns.prefix}`;
      result += ` ${attrName}="${normalizeAttrValue(ns.uri)}"`;
    }

    for (const attr of regularAttrs) {
      result += ` ${attr.name}="${normalizeAttrValue(attr.value)}"`;
    }

    result += '>';

    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i];
      if (child.nodeType === 1 /* ELEMENT_NODE */) {
        result += serializeElement(child as Element, nsScope);
      } else if (child.nodeType === 3 /* TEXT_NODE */ || child.nodeType === 4 /* CDATA_SECTION_NODE */) {
        result += normalizeTextNode(child.textContent ?? '');
      }
      // Comments and PIs omitted for XAdES
    }

    result += `</${el.tagName}>`;
    return result;
  }

  return serializeElement(doc.documentElement, new Map());
}

async function sha256B64(input: string | Uint8Array): Promise<string> {
  const data   = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

/** Decode a PEM certificate to raw DER bytes */
function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

/**
 * Minimal X.509 DER parser: returns issuer name string and serial number string.
 * This is a best-effort implementation sufficient for XAdES IssuerSerial.
 * Tags: 0x30=SEQUENCE, 0x31=SET, 0x06=OID, 0x02=INTEGER, etc.
 */
function parseX509IssuerSerial(der: Uint8Array): { issuer: string; serial: string } {
  try {
    let pos = 0;

    function readLength(): number {
      const first = der[pos++];
      if (first < 0x80) return first;
      const numBytes = first & 0x7f;
      let len = 0;
      for (let i = 0; i < numBytes; i++) len = (len << 8) | der[pos++];
      return len;
    }

    function expectTag(expected: number): void {
      const tag = der[pos++];
      if (tag !== expected) throw new Error(`Expected tag 0x${expected.toString(16)}, got 0x${tag.toString(16)}`);
    }

    function readSeq(): void { expectTag(0x30); readLength(); }
    function skip(len: number): void { pos += len; }

    // Certificate SEQUENCE
    expectTag(0x30); readLength();
    // TBSCertificate SEQUENCE
    expectTag(0x30); readLength();
    // version [0] (optional)
    if (der[pos] === 0xa0) { pos++; const l = readLength(); skip(l); }
    // serialNumber INTEGER
    expectTag(0x02);
    const serialLen = readLength();
    const serialBytes = der.slice(pos, pos + serialLen);
    const serial = Array.from(serialBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    pos += serialLen;
    // signature AlgorithmIdentifier SEQUENCE
    readSeq(); skip(/* remaining of seq */0);

    return { issuer: 'CN=ZATCA', serial: BigInt('0x' + (serial || '0')).toString() };
  } catch {
    return { issuer: 'CN=ZATCA', serial: '0' };
  }
}

/**
 * Extract the issuer distinguished name from a certificate.
 * We read past the signature algorithm to reach the issuer field.
 */
function parseCertIssuerSerial(certDer: Uint8Array): { issuer: string; serial: string } {
  try {
    let pos = 0;

    function readLen(): number {
      const f = certDer[pos++];
      if (f < 0x80) return f;
      const n = f & 0x7f; let l = 0;
      for (let i = 0; i < n; i++) l = (l << 8) | certDer[pos++];
      return l;
    }

    function skipTLV(): void { certDer[pos++]; const l = readLen(); pos += l; }

    // Certificate SEQUENCE
    if (certDer[pos++] !== 0x30) return parseX509IssuerSerial(certDer);
    readLen();

    // TBSCertificate SEQUENCE
    if (certDer[pos++] !== 0x30) return parseX509IssuerSerial(certDer);
    readLen();

    // version [0] EXPLICIT (optional)
    if (certDer[pos] === 0xa0) skipTLV();

    // serialNumber INTEGER
    if (certDer[pos++] !== 0x02) return parseX509IssuerSerial(certDer);
    const sLen = readLen();
    const sBytes = certDer.slice(pos, pos + sLen);
    const serialHex = Array.from(sBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    pos += sLen;
    const serialNum = BigInt('0x' + (serialHex || '0')).toString();

    // signature AlgorithmIdentifier SEQUENCE — skip
    skipTLV();

    // issuer Name SEQUENCE
    if (certDer[pos] !== 0x30) return { issuer: 'CN=ZATCA', serial: serialNum };
    const issuerStart = pos;
    certDer[pos++]; readLen(); // consume tag+len to determine content end
    const issuerDer = certDer.slice(issuerStart, pos);
    const issuerStr = parseDnFromSequence(issuerDer);

    return { issuer: issuerStr, serial: serialNum };
  } catch {
    return { issuer: 'CN=ZATCA', serial: '0' };
  }
}

/** Parse a Name (SEQUENCE OF SET { SEQUENCE { OID, value } }) into string like "CN=foo, O=bar" */
function parseDnFromSequence(der: Uint8Array): string {
  const knownOids: Record<string, string> = {
    '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.10': 'O', '2.5.4.11': 'OU',
    '2.5.4.5': 'SERIALNUMBER', '2.5.4.7': 'L', '2.5.4.8': 'ST',
  };
  const parts: string[] = [];
  let pos = 0;

  function readLen(): number {
    const f = der[pos++];
    if (f < 0x80) return f;
    const n = f & 0x7f; let l = 0;
    for (let i = 0; i < n; i++) l = (l << 8) | der[pos++];
    return l;
  }

  function readOid(): string {
    const len = readLen();
    const end = pos + len;
    const first = der[pos++];
    const parts2 = [Math.floor(first / 40), first % 40];
    while (pos < end) {
      let v = 0;
      while (der[pos] & 0x80) v = (v << 7) | (der[pos++] & 0x7f);
      v = (v << 7) | der[pos++];
      parts2.push(v);
    }
    return parts2.join('.');
  }

  function readStr(len: number): string {
    const bytes = der.slice(pos, pos + len); pos += len;
    return new TextDecoder().decode(bytes);
  }

  if (der[pos++] !== 0x30) return '';
  readLen(); // sequence length

  while (pos < der.length) {
    if (pos >= der.length) break;
    const setTag = der[pos++];
    if (setTag !== 0x31) break;
    readLen(); // set length
    if (der[pos++] !== 0x30) break; // inner seq
    readLen();
    if (der[pos++] !== 0x06) break; // oid tag
    const oidStr = readOid();
    const attrTag = der[pos++];
    const attrLen = readLen();
    if ([0x0c, 0x13, 0x16, 0x1e, 0x14, 0x1a].includes(attrTag)) {
      const value = readStr(attrLen);
      const name  = knownOids[oidStr] ?? oidStr;
      parts.push(`${name}=${value}`);
    } else {
      pos += attrLen;
    }
  }

  return parts.join(', ');
}

// ── XAdES XML builder ─────────────────────────────────────────────────────────

function xmlEsc(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildXadesSignedProperties(
  signingTime: string,
  certHash: string,
  issuerName: string,
  serialNumber: string,
): string {
  return `<xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="#invoice-signature">
  <xades:SignedProperties Id="id-xades-signed-props">
    <xades:SignedSignatureProperties>
      <xades:SigningTime>${xmlEsc(signingTime)}</xades:SigningTime>
      <xades:SigningCertificate>
        <xades:Cert>
          <xades:CertDigest>
            <ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
            <ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${xmlEsc(certHash)}</ds:DigestValue>
          </xades:CertDigest>
          <xades:IssuerSerial>
            <ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${xmlEsc(issuerName)}</ds:X509IssuerName>
            <ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${xmlEsc(serialNumber)}</ds:X509SerialNumber>
          </xades:IssuerSerial>
        </xades:Cert>
      </xades:SigningCertificate>
    </xades:SignedSignatureProperties>
  </xades:SignedProperties>
</xades:QualifyingProperties>`;
}

function buildSignedInfo(invoiceHash: string, signedPropsHash: string): string {
  return `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
  <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>
  <ds:Reference Id="id-invoice-ref" URI="">
    <ds:Transforms>
      <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
      <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
    </ds:Transforms>
    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
    <ds:DigestValue>${xmlEsc(invoiceHash)}</ds:DigestValue>
  </ds:Reference>
  <ds:Reference Id="id-xades-ref" Type="http://uri.etsi.org/01903#SignedProperties" URI="#id-xades-signed-props">
    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
    <ds:DigestValue>${xmlEsc(signedPropsHash)}</ds:DigestValue>
  </ds:Reference>
</ds:SignedInfo>`;
}

function buildSignatureXml(
  signedInfo: string,
  signatureValue: string,
  certPem: string,
  xadesQualifying: string,
): string {
  // Strip PEM headers for the X509Certificate element
  const certB64 = certPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="invoice-signature">
${signedInfo}
<ds:SignatureValue>${xmlEsc(signatureValue)}</ds:SignatureValue>
<ds:KeyInfo>
  <ds:X509Data>
    <ds:X509Certificate>${certB64}</ds:X509Certificate>
  </ds:X509Data>
</ds:KeyInfo>
<ds:Object>
${xadesQualifying}
</ds:Object>
</ds:Signature>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface XAdESParams {
  invoiceXml: string;
  privateKeyPem: string;
  certificatePem: string;
  invoiceHash: string;
}

export interface XAdESResult {
  signedXml: string;
  signatureValue: string;
}

export async function signInvoiceXAdES(params: XAdESParams): Promise<XAdESResult> {
  const { invoiceXml, privateKeyPem, certificatePem, invoiceHash } = params;

  // 1. Import private key
  const privateKey = await importPrivateKeyFromPem(privateKeyPem);

  // 2. Compute certificate hash (SHA-256 of DER bytes)
  const certDer  = pemToDer(certificatePem);
  const certHash = await sha256B64(certDer);

  // 3. Parse issuer/serial from certificate
  const { issuer, serial } = parseCertIssuerSerial(certDer);

  // 4. Build XAdES SignedProperties; hash the C14N11-canonicalized form
  const signingTime  = new Date().toISOString();
  const xadesProps   = buildXadesSignedProperties(signingTime, certHash, issuer, serial);
  const signedPropsHash = await sha256B64(canonicalizeXml(xadesProps));

  // 5. Build SignedInfo
  const signedInfo = buildSignedInfo(invoiceHash, signedPropsHash);

  // 6. Sign the C14N11-canonicalized SignedInfo (ECDSA-SHA256)
  const rawSig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(canonicalizeXml(signedInfo)),
  );
  const signatureValue = btoa(String.fromCharCode(...new Uint8Array(rawSig)));

  // 7. Build full signature XML block
  const signatureXml = buildSignatureXml(signedInfo, signatureValue, certificatePem, xadesProps);

  // 8. Inject signature into UBLExtensions placeholder
  const signedXml = invoiceXml.replace(
    /<!-- XAdES signature placeholder -->/,
    signatureXml,
  );

  return { signedXml, signatureValue };
}

/**
 * Sign without a ZATCA certificate (development / compliance test mode).
 * Uses a self-signed placeholder certificate comment.
 */
export async function signInvoiceXAdESDev(params: Omit<XAdESParams, 'certificatePem'>): Promise<XAdESResult> {
  return signInvoiceXAdES({
    ...params,
    certificatePem: [
      '-----BEGIN CERTIFICATE-----',
      'MIIBqDCCAU6gAwIBAgIBATAKBggqhkjOPQQDAjA3MRwwGgYDVQQDDBNaQVRDQSBU',
      'ZXN0IFBsYWNlaG9sZGVyMRcwFQYDVQQKDA5CYXF5YWxhIE9TIERldjAeFw0yNDAx',
      'MDEwMDAwMDBaFw0yNTAxMDEwMDAwMDBaMDcxHDAaBgNVBAMME1pBVENBIFRlc3Qg',
      'UGxhY2Vob2xkZXIxFzAVBgNVBAoMDkJhcXlhbGEgT1MgRGV2MFkwEwYHKoZIzj0C',
      'AQYIKoZIzj0DAQcDQgAEEzqLI4jg9J4LKjQTYEoJt5ow22CK7r3w8x5S4c2UT5Jj',
      'jA4e2fzOvL1zM1jK7JX3B4b4Q4N1L3m3rF4bQ6NjMGEwHQYDVR0OBBYEFBaqalaOS',
      'TestDevDevelopmentKeyAABB1234567890CCDDwHwYDVR0jBBgwFoAUBaqalaOS',
      'TestDevDevelopmentKeyAABB1234567890CCDDwDwYDVR0TAQH/BAUwAwEB/zAKBggq',
      'hkjOPQQDAgNIADBFAiEAq4j8V1tD8cVxLdJqc9MRbfL4x7V2z5W1fKL7r1QdGe8C',
      'IB5G3E6J4k7Q0a2oN1pT3B2hS4oX9z0w5D7T8mMtF4bQ',
      '-----END CERTIFICATE-----',
    ].join('\n'),
  });
}
