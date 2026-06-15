import { StoreConfig } from '../types';
import { APP_LOGO_DATA_URL } from './appLogo';

export interface PrintDocumentOptions {
  title: string;
  config?: StoreConfig;
  body: string;
  dir?: 'rtl' | 'ltr';
  width?: number;
  height?: number;
  autoPrint?: boolean;
  extraCss?: string;
  compact?: boolean;
}

export const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export const sar = (amount: number) => `${Number(amount || 0).toFixed(2)} ر.س`;

export function brandLogo(config?: StoreConfig) {
  if (config?.logoDataUrl) {
    return `<img src="${config.logoDataUrl}" class="brand-logo" alt="Store logo" />`;
  }
  return `<img src="${APP_LOGO_DATA_URL}" class="brand-logo" alt="Oasis Dine RMS logo" />`;
}

export function brandHeader(config: StoreConfig | undefined, titleAr: string, titleEn: string, meta = '') {
  const storeAr = escapeHtml(config?.nameAr || config?.nameEn || 'مطعم أواسس داين');
  const storeEn = escapeHtml(config?.nameEn || config?.nameAr || 'Oasis Dine');
  const vat = escapeHtml(config?.vatNumber || '—');
  const phone = escapeHtml(config?.phone || '');
  const address = escapeHtml(config?.address || '');
  return `
    <header class="doc-hero">
      <div class="doc-brand">
        ${brandLogo(config)}
        <div>
          <h1>${escapeHtml(titleAr)}</h1>
          <p class="doc-subtitle">${escapeHtml(titleEn)}</p>
        </div>
      </div>
      <div class="doc-store">
        <strong>${storeAr}</strong>
        <span dir="ltr">${storeEn}</span>
        <span>الرقم الضريبي: ${vat}</span>
        ${phone ? `<span>الجوال: ${phone}</span>` : ''}
        ${address ? `<span>${address}</span>` : ''}
        ${meta ? `<span class="doc-meta">${escapeHtml(meta)}</span>` : ''}
      </div>
    </header>
  `;
}

export function documentShell(options: PrintDocumentOptions) {
  const dir = options.dir || 'rtl';
  return `<!DOCTYPE html>
<html lang="${dir === 'rtl' ? 'ar' : 'en'}" dir="${dir}">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(options.title)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #f8fafc;
    color: #0f172a;
    font-family: Tahoma, Arial, sans-serif;
    font-size: ${options.compact ? '11px' : '12px'};
  }
  .print-action {
    position: fixed;
    top: 14px;
    left: 14px;
    z-index: 99;
    border: 0;
    border-radius: 12px;
    padding: 9px 18px;
    background: #0f172a;
    color: white;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 10px 30px rgba(15, 23, 42, .25);
  }
  .doc-page {
    max-width: ${options.compact ? '360px' : '980px'};
    margin: 22px auto;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 22px;
    overflow: hidden;
    box-shadow: 0 18px 55px rgba(15, 23, 42, .10);
  }
  .doc-hero {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    padding: ${options.compact ? '16px' : '22px 26px'};
    color: white;
    background: linear-gradient(135deg, #0f172a 0%, #164e63 48%, #059669 100%);
  }
  .doc-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .brand-logo {
    width: ${options.compact ? '54px' : '64px'};
    height: ${options.compact ? '54px' : '64px'};
    object-fit: contain;
    background: white;
    border-radius: 18px;
    padding: 7px;
    box-shadow: 0 10px 28px rgba(0,0,0,.22);
    flex: 0 0 auto;
  }
  .brand-logo-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #059669;
    font-size: 28px;
    font-weight: 900;
    padding: 0;
  }
  h1 { margin: 0 0 3px; font-size: ${options.compact ? '17px' : '22px'}; font-weight: 900; }
  .doc-subtitle { margin: 0; color: rgba(255,255,255,.78); font-size: ${options.compact ? '10px' : '12px'}; direction: ltr; }
  .doc-store { display: flex; flex-direction: column; gap: 3px; text-align: left; direction: rtl; color: rgba(255,255,255,.84); font-size: 10px; }
  .doc-store strong { color: white; font-size: 12px; }
  .doc-meta { color: #d1fae5; font-weight: 700; }
  .doc-content { padding: ${options.compact ? '16px' : '22px 24px 26px'}; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; }
  th { background: #0f172a; color: white; padding: 8px; text-align: start; font-weight: 800; }
  td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f8fafc; }
  .amount { direction: ltr; text-align: left; font-weight: 800; }
  .card { border: 1px solid #e2e8f0; border-radius: 16px; padding: 12px; background: #f8fafc; }
  .total-card { border: 1px solid #bbf7d0; border-radius: 18px; padding: 14px; background: linear-gradient(135deg, #f8fafc, #ecfdf5); }
  .muted { color: #64748b; }
  @media print {
    body { background: white; }
    .print-action { display: none !important; }
    .doc-page { margin: 0; max-width: none; border: 0; border-radius: 0; box-shadow: none; }
  }
  ${options.extraCss || ''}
</style>
</head>
<body>
  <button class="print-action" onclick="window.print()">طباعة / Save PDF</button>
  <main class="doc-page">
    ${options.config ? brandHeader(options.config, options.title, 'PRINT DOCUMENT') : ''}
    <section class="doc-content">
      ${options.body}
    </section>
  </main>
  ${options.autoPrint !== false ? '<script>window.setTimeout(() => window.print(), 450);</script>' : ''}
</body>
</html>`;
}

export function openPrintDocument(options: PrintDocumentOptions) {
  const win = window.open('', '_blank', `width=${options.width || 1000},height=${options.height || 800},scrollbars=yes`);
  if (!win) {
    window.dispatchEvent(new CustomEvent('baqala:toast', {
      detail: { message: 'Please allow pop-ups to generate the PDF/print document.', type: 'warning' }
    }));
    return false;
  }
  win.document.write(documentShell(options));
  win.document.close();
  return true;
}
