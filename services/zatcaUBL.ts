/**
 * ZATCA Phase 2 — UBL 2.1 XML Invoice Generator
 *
 * Produces OASIS UBL 2.1 simplified tax invoices for grocery receipts.
 * Reference: ZATCA e-Invoice Specifications V3.2 / UBL 2.1 schema.
 */

import { Transaction, StoreConfig, ZatcaState } from '../types';

// ── Date / time helpers ───────────────────────────────────────────────────────

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD
}

function isoTime(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19); // HH:MM:SS
}

function fixed(n: number, d = 2): string {
  return (Number.isFinite(n) ? n : 0).toFixed(d);
}

// ── Invoice type codes ────────────────────────────────────────────────────────
// 388 = Tax Invoice (standard or simplified)
// 381 = Credit Note (refund)
// name attribute: 0 = simplified (B2C), 1 = standard (B2B)
// 0200000 = simplified without advance payment
// 0100000 = standard without advance payment

function invoiceTypeCode(isRefund: boolean, simplified: boolean): { code: string; name: string } {
  if (isRefund) return { code: '381', name: simplified ? '0211010' : '0111010' };
  return { code: '388', name: simplified ? '0200000' : '0100000' };
}

// ── UBL line item ─────────────────────────────────────────────────────────────

function buildInvoiceLine(
  lineNumber: number,
  productId: string,
  nameEn: string,
  quantity: number,
  unitPrice: number,
  vatRate: number,
): string {
  const lineExtension = fixed(quantity * unitPrice);
  const vatAmount     = fixed(quantity * unitPrice * vatRate);

  return `  <cac:InvoiceLine>
    <cbc:ID>${lineNumber}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">${quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SAR">${lineExtension}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${escapeXml(nameEn)}</cbc:Name>
      <cbc:Description>${escapeXml(productId)}</cbc:Description>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${fixed(vatRate * 100, 2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="SAR">${fixed(unitPrice)}</cbc:PriceAmount>
    </cac:Price>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="SAR">${vatAmount}</cbc:TaxAmount>
    </cac:TaxTotal>
  </cac:InvoiceLine>`;
}

// ── XML escaping ─────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── QR TLV helpers ────────────────────────────────────────────────────────────

/** Build ZATCA QR TLV (tags 1–5) and return base64. */
export function buildQrTlv(
  sellerName: string,
  vatNumber: string,
  issueDateTime: string,
  total: string,
  vatAmount: string,
): string {
  const enc = new TextEncoder();
  function tlv(tag: number, value: string): Uint8Array {
    const val = enc.encode(value);
    const bytes = new Uint8Array(2 + val.length);
    bytes[0] = tag;
    bytes[1] = val.length;
    bytes.set(val, 2);
    return bytes;
  }
  const chunks = [
    tlv(1, sellerName),
    tlv(2, vatNumber),
    tlv(3, issueDateTime),
    tlv(4, total),
    tlv(5, vatAmount),
  ];
  const total_len = chunks.reduce((s, c) => s + c.length, 0);
  const merged = new Uint8Array(total_len);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.length; }

  // base64
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let b64 = '';
  for (let i = 0; i < merged.length; i += 3) {
    const b0 = merged[i], b1 = merged[i + 1], b2 = merged[i + 2];
    b64 += alpha[b0 >> 2];
    b64 += alpha[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    b64 += b1 === undefined ? '=' : alpha[((b1 & 0xf) << 2) | ((b2 ?? 0) >> 6)];
    b64 += b2 === undefined ? '=' : alpha[b2 & 0x3f];
  }
  return b64;
}

// ── SHA-256 helper ────────────────────────────────────────────────────────────

async function sha256B64(input: string): Promise<string> {
  const data   = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes  = new Uint8Array(digest);
  const alpha  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let b64 = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    b64 += alpha[b0 >> 2];
    b64 += alpha[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    b64 += b1 === undefined ? '=' : alpha[((b1 & 0xf) << 2) | ((b2 ?? 0) >> 6)];
    b64 += b2 === undefined ? '=' : alpha[b2 & 0x3f];
  }
  return b64;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ZatcaInvoiceParams {
  transaction: Transaction;
  config: StoreConfig;
  zatcaState: ZatcaState;
  sellerVatNumber: string;
  icv: number;
  pih: string;
}

export interface UBLInvoiceResult {
  xml: string;
  xmlHash: string;
}

export async function generateUBLInvoice(params: ZatcaInvoiceParams): Promise<UBLInvoiceResult> {
  const { transaction: tx, config, sellerVatNumber, icv, pih } = params;
  const isRefund    = Boolean(tx.isRefund);
  const isSimplified = true; // grocery B2C is always simplified
  const vatRate     = (config.vatRate ?? 0.15);

  const typeInfo    = invoiceTypeCode(isRefund, isSimplified);
  const issueDate   = isoDate(tx.timestamp);
  const issueTime   = isoTime(tx.timestamp);
  const issueDateTime = `${issueDate}T${issueTime}`;

  // Subtotal (tax-exclusive): tx.subtotal already excludes VAT in the POS
  const subtotal    = fixed(tx.subtotal - (tx.discount ?? 0));
  const vatAmount   = fixed(tx.vat);
  const totalAmount = fixed(tx.total);

  const qrTlv = buildQrTlv(
    config.nameEn,
    sellerVatNumber,
    issueDateTime,
    totalAmount,
    vatAmount,
  );

  const linesXml = (tx.items ?? []).map((item, idx) =>
    buildInvoiceLine(
      idx + 1,
      item.id,
      item.nameEn,
      item.quantity,
      item.price,
      vatRate,
    )
  ).join('\n');

  // PIH placeholder element (hash of previous invoice, base64)
  const pihElement = `    <cac:AdditionalDocumentReference>
      <cbc:ID>PIH</cbc:ID>
      <cac:Attachment>
        <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${escapeXml(pih)}</cbc:EmbeddedDocumentBinaryObject>
      </cac:Attachment>
    </cac:AdditionalDocumentReference>`;

  const qrElement = `    <cac:AdditionalDocumentReference>
      <cbc:ID>QR</cbc:ID>
      <cac:Attachment>
        <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${qrTlv}</cbc:EmbeddedDocumentBinaryObject>
      </cac:Attachment>
    </cac:AdditionalDocumentReference>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:ext:ECDSA</ext:ExtensionURI>
      <ext:ExtensionContent>
        <!-- XAdES signature placeholder -->
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:ProfileID>${isSimplified ? 'reporting:1.0' : 'standard:1.0'}</cbc:ProfileID>
  <cbc:ID>${escapeXml(tx.id)}</cbc:ID>
  <cbc:UUID>${escapeXml(tx.uuid ?? crypto.randomUUID())}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${typeInfo.name}">${typeInfo.code}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${icv}</cbc:UUID>
  </cac:AdditionalDocumentReference>
${pihElement}
${qrElement}
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">${escapeXml(config.crNumber ?? '')}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(config.address ?? '')}</cbc:StreetName>
        <cbc:CityName>Riyadh</cbc:CityName>
        <cbc:CountrySubentity>SA-01</cbc:CountrySubentity>
        <cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(sellerVatNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(config.nameEn)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${vatAmount}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${subtotal}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${vatAmount}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${fixed(vatRate * 100, 2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${subtotal}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${subtotal}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${totalAmount}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="SAR">${fixed(tx.discount ?? 0)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="SAR">${totalAmount}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${linesXml}
</Invoice>`;

  const xmlHash = await sha256B64(xml);
  return { xml, xmlHash };
}

/**
 * Generate a sample test invoice for ZATCA compliance testing.
 * icv should be an incrementing counter; pih is the previous invoice hash.
 * Pass `{ isB2B: true }` to generate a standard (B2B) invoice or credit note.
 */
export async function generateTestInvoice(
  config: StoreConfig,
  vatNumber: string,
  icv: number,
  pih: string,
  isRefund = false,
  options?: { isB2B?: boolean },
): Promise<UBLInvoiceResult> {
  const isB2B = options?.isB2B === true;
  const now   = Date.now();

  const fakeTx: Transaction = {
    id:        `TEST-${icv}-${now}`,
    uuid:      crypto.randomUUID(),
    timestamp: now,
    items: [
      {
        id: 'TEST-PROD-001', nameEn: 'Test Product', nameAr: 'منتج تجريبي',
        barcode: '6290000000001', price: 10.00, quantity: 2,
        category: 'Misc' as import('../types').Category,
        stock: 100,
      },
    ],
    subtotal:      18.97,
    discount:      1.03,
    vat:           2.85,
    total:         21.82,
    paymentMethod: 'cash',
    status:        'completed',
    isRefund,
    invoiceSeqNum: icv,
    previousInvoiceHash: pih,
  };

  if (!isB2B) {
    return generateUBLInvoice({
      transaction:    fakeTx,
      config,
      zatcaState:     { mode: 'sandbox', onboardingStatus: 'sandbox_ready', reportingEndpoint: '', complianceCsid: '', productionCsid: '' },
      sellerVatNumber: vatNumber,
      icv,
      pih,
    });
  }

  // ── Standard (B2B) invoice XML ──────────────────────────────────────────────
  // B2B uses invoice type code 380 (commercial invoice) instead of 388,
  // profile standard:1.0, and includes an AccountingCustomerParty block.
  const issueDate     = isoDate(now);
  const issueTime     = isoTime(now);
  const subtotal      = fixed(fakeTx.subtotal - (fakeTx.discount ?? 0));
  const vatAmount     = fixed(fakeTx.vat);
  const totalAmount   = fixed(fakeTx.total);
  const typeCode      = isRefund ? '381' : '380';
  const typeNameAttr  = isRefund ? '0111010' : '0100000';
  const profileId     = 'standard:1.0';

  const qrTlv = buildQrTlv(
    config.nameEn, vatNumber, `${issueDate}T${issueTime}`, totalAmount, vatAmount,
  );

  const pihElement = `    <cac:AdditionalDocumentReference>
      <cbc:ID>PIH</cbc:ID>
      <cac:Attachment>
        <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${escapeXml(pih)}</cbc:EmbeddedDocumentBinaryObject>
      </cac:Attachment>
    </cac:AdditionalDocumentReference>`;

  const qrElement = `    <cac:AdditionalDocumentReference>
      <cbc:ID>QR</cbc:ID>
      <cac:Attachment>
        <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${qrTlv}</cbc:EmbeddedDocumentBinaryObject>
      </cac:Attachment>
    </cac:AdditionalDocumentReference>`;

  const linesXml = buildInvoiceLine(1, 'TEST-PROD-001', 'Test Product', 2, 10.00, config.vatRate ?? 0.15);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:ext:ECDSA</ext:ExtensionURI>
      <ext:ExtensionContent>
        <!-- XAdES signature placeholder -->
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:ProfileID>${profileId}</cbc:ProfileID>
  <cbc:ID>${escapeXml(fakeTx.id)}</cbc:ID>
  <cbc:UUID>${escapeXml(fakeTx.uuid ?? crypto.randomUUID())}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${typeNameAttr}">${typeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${icv}</cbc:UUID>
  </cac:AdditionalDocumentReference>
${pihElement}
${qrElement}
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">${escapeXml(config.crNumber ?? '')}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(config.address ?? '')}</cbc:StreetName>
        <cbc:CityName>Riyadh</cbc:CityName>
        <cbc:CountrySubentity>SA-01</cbc:CountrySubentity>
        <cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(vatNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(config.nameEn)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">1234567890</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>Test Buyer Street</cbc:StreetName>
        <cbc:CityName>Riyadh</cbc:CityName>
        <cbc:CountrySubentity>SA-01</cbc:CountrySubentity>
        <cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>300000000000003</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Test Buyer Company</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${vatAmount}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${subtotal}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${vatAmount}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${fixed((config.vatRate ?? 0.15) * 100, 2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${subtotal}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${subtotal}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${totalAmount}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="SAR">${fixed(fakeTx.discount ?? 0)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="SAR">${totalAmount}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${linesXml}
</Invoice>`;

  const xmlHash = await sha256B64(xml);
  return { xml, xmlHash };
}
