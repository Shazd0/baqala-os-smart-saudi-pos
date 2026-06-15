/**
 * Opens a dedicated print-ready window containing the ZATCA VAT Return
 * (Form 001 layout). The window has no app chrome — only the table.
 * The user clicks Print → Save as PDF from their OS dialog.
 */

import { PurchaseInvoice, StoreConfig, Transaction } from '../types';
import { openPrintDocument } from './printTemplates';

interface VatReportData {
  periodLabel: string;
  dateFrom: number;
  dateTo: number;
  totalSalesExVat: number;
  outputVat: number;
  totalPurchasesExVat: number;
  inputVat: number;
  netVat: number;
  invoices: PurchaseInvoice[];
  transactions: Transaction[];
  config: StoreConfig;
}

const sar = (n: number) => n.toFixed(2);
const d = (ts: number) => new Date(ts).toLocaleDateString('ar-SA');

export function openVatReturnWindow(data: VatReportData) {
  const {
    periodLabel, dateFrom, dateTo,
    totalSalesExVat, outputVat,
    totalPurchasesExVat, inputVat, netVat,
    invoices, transactions, config,
  } = data;

  const netPositive = netVat >= 0;
  const periodStr = `${d(dateFrom)} – ${d(dateTo)}`;

  /* ── purchase invoice rows ── */
  const purchaseRows = invoices.map((inv, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${new Date(inv.date).toLocaleDateString('ar-SA')}</td>
      <td>${inv.supplierName}</td>
      <td>${inv.supplierVatNumber ?? '—'}</td>
      <td dir="ltr">${inv.invoiceNumber}</td>
      <td>${sar(inv.subtotal)}</td>
      <td class="vat-col">${sar(inv.vat)}</td>
      <td class="total-col">${sar(inv.total)}</td>
    </tr>`).join('');

  /* ── sale summary rows (group by month if many) ── */
  const saleRows = transactions.map((tx, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${new Date(tx.timestamp).toLocaleDateString('ar-SA')}</td>
      <td dir="ltr">${tx.id}</td>
      <td>${tx.paymentMethod === 'cash' ? 'نقدي' : tx.paymentMethod === 'card' ? 'بطاقة' : 'آجل'}</td>
      <td>${sar(tx.subtotal - (tx.discount ?? 0))}</td>
      <td class="vat-col">${sar(tx.vat)}</td>
      <td class="total-col">${sar(tx.total)}</td>
    </tr>`).join('');

  const body = `
<p class="muted" dir="ltr">${periodLabel} | ${periodStr}</p>
<div class="store-block">
  <div>
    <strong>${config.nameAr || config.nameEn}</strong><br/>
    الرقم الضريبي: ${config.vatNumber || '—'}<br/>
    ${config.phone ? 'الجوال: ' + config.phone : ''}
  </div>
  <div style="text-align:left; direction:ltr;">
    <strong>${config.nameEn || config.nameAr}</strong><br/>
    CR No.: ${(config as any).crNumber || '—'}<br/>
    ${config.address || ''}
  </div>
</div>

<div class="kpis">
  <div class="kpi output"><span>ضريبة المخرجات / Output VAT</span><strong>${sar(outputVat)} ر.س</strong></div>
  <div class="kpi input"><span>ضريبة المدخلات / Input VAT</span><strong>${sar(inputVat)} ر.س</strong></div>
  <div class="kpi net"><span>${netPositive ? 'مستحق للدفع / Payable' : 'قابل للاسترداد / Refundable'}</span><strong>${sar(Math.abs(netVat))} ر.س</strong></div>
</div>

<!-- Form 001 Summary Table -->
<table class="form001">
  <thead>
    <tr>
      <th style="width:34px">رقم</th>
      <th>البيان</th>
      <th>Description</th>
      <th style="width:130px">المبلغ (ر.س)</th>
      <th style="width:130px">الضريبة (ر.س)</th>
    </tr>
  </thead>
  <tbody>
    <tr class="section-head">
      <td colspan="5">القسم الأول: المخرجات (المبيعات) — Section 1: Output (Sales)</td>
    </tr>
    <tr>
      <td class="box-num">1</td>
      <td>التوريدات الخاضعة للضريبة (15%)</td>
      <td>Standard-rated supplies (15%)</td>
      <td class="amount">${sar(totalSalesExVat)}</td>
      <td class="amount vat-col">${sar(outputVat)}</td>
    </tr>

    <tr class="section-head">
      <td colspan="5">القسم الثاني: المدخلات (المشتريات) — Section 2: Input (Purchases)</td>
    </tr>
    <tr>
      <td class="box-num">2</td>
      <td>المشتريات من موردين مسجلين (15%)</td>
      <td>Purchases from registered suppliers (15%)</td>
      <td class="amount">${sar(totalPurchasesExVat)}</td>
      <td class="amount">${sar(inputVat)}</td>
    </tr>

    <tr class="section-head">
      <td colspan="5">القسم الثالث: صافي الضريبة — Section 3: Net VAT</td>
    </tr>
    <tr class="net-row">
      <td class="box-num">3</td>
      <td colspan="2">
        ${netPositive ? 'صافي الضريبة المستحقة للدفع / Net VAT Payable' : 'صافي الضريبة القابلة للاسترداد / Net VAT Refundable'}
      </td>
      <td colspan="2" class="amount">${sar(Math.abs(netVat))}</td>
    </tr>
  </tbody>
</table>

<!-- Purchase Invoice Register -->
<div class="section-title">سجل فواتير الشراء — Purchase Invoice Register</div>
<table class="detail">
  <thead>
    <tr>
      <th>#</th>
      <th>التاريخ</th>
      <th>المورد</th>
      <th>الرقم الضريبي للمورد</th>
      <th>رقم الفاتورة</th>
      <th>المجموع (بدون ض.)</th>
      <th>الضريبة</th>
      <th>الإجمالي</th>
    </tr>
  </thead>
  <tbody>
    ${purchaseRows || '<tr><td colspan="8" style="text-align:center;color:#999">لا توجد فواتير</td></tr>'}
    <tr style="font-weight:900; background:#f1f5f9;">
      <td colspan="5">الإجمالي</td>
      <td>${sar(totalPurchasesExVat)}</td>
      <td class="vat-col">${sar(inputVat)}</td>
      <td class="total-col">${sar(totalPurchasesExVat + inputVat)}</td>
    </tr>
  </tbody>
</table>

<!-- Sales Register -->
<div class="section-title">سجل فواتير البيع — Sales Invoice Register</div>
<table class="detail">
  <thead>
    <tr>
      <th>#</th>
      <th>التاريخ</th>
      <th>رقم الفاتورة</th>
      <th>طريقة الدفع</th>
      <th>المجموع (بدون ض.)</th>
      <th>الضريبة</th>
      <th>الإجمالي</th>
    </tr>
  </thead>
  <tbody>
    ${saleRows || '<tr><td colspan="7" style="text-align:center;color:#999">لا توجد مبيعات</td></tr>'}
    <tr style="font-weight:900; background:#f1f5f9;">
      <td colspan="4">الإجمالي</td>
      <td>${sar(totalSalesExVat)}</td>
      <td class="vat-col">${sar(outputVat)}</td>
      <td class="total-col">${sar(totalSalesExVat + outputVat)}</td>
    </tr>
  </tbody>
</table>

<!-- Signature -->
<div class="sig-block">
  <div class="sig-field">توقيع المفوّض / Authorised Signature</div>
  <div class="sig-field">الختم / Stamp</div>
  <div class="sig-field">التاريخ / Date &nbsp; ${new Date().toLocaleDateString('ar-SA')}</div>
</div>
`;

  openPrintDocument({
    title: 'إقرار ضريبة القيمة المضافة',
    config,
    body,
    dir: 'rtl',
    width: 1000,
    height: 800,
    autoPrint: false,
    extraCss: `
      .store-block { display: flex; justify-content: space-between; border: 1px solid #dbeafe; border-radius: 16px; padding: 12px 16px; margin-bottom: 16px; font-size: 11px; background: linear-gradient(135deg,#f8fafc,#ecfdf5); }
      .store-block div { line-height: 1.7; }
      .store-block strong { font-size: 12px; }
      .kpis { display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
      .kpi { border-radius: 16px; padding: 12px; border: 1px solid #e2e8f0; background: #fff; }
      .kpi span { color:#64748b; font-size: 9px; display:block; margin-bottom: 5px; }
      .kpi strong { font-size: 17px; font-weight: 900; direction:ltr; display:block; }
      .kpi.output { background:#eff6ff; border-color:#bfdbfe; color:#1d4ed8; }
      .kpi.input { background:#fffbeb; border-color:#fde68a; color:#b45309; }
      .kpi.net { background:${netPositive ? '#fef2f2' : '#f0fdf4'}; border-color:${netPositive ? '#fecaca' : '#bbf7d0'}; color:${netPositive ? '#b91c1c' : '#15803d'}; }
      .form001 { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 22px; border: 1px solid #cbd5e1; border-radius: 14px; overflow: hidden; }
      .form001 th, .form001 td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; }
      .form001 tr:last-child td { border-bottom: 0; }
      .form001 thead th { background: #0f172a; color: #fff; font-size: 11px; }
      .form001 .section-head td { background: #f1f5f9; font-weight: 700; font-size: 11px; }
      .form001 .box-num { font-weight: 900; color: #059669; width: 30px; text-align: center; }
      .form001 .amount { text-align: left; font-weight: 600; direction: ltr; }
      .form001 .net-row td { background: ${netPositive ? '#fef2f2' : '#f0fdf4'}; font-weight: 900; font-size: 12px; color: ${netPositive ? '#b91c1c' : '#15803d'}; }
      .section-title { font-size: 13px; font-weight: 900; margin: 20px 0 8px; border-right: 5px solid #10b981; padding: 7px 10px; background:#f8fafc; border-radius: 10px; }
      table.detail { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 20px; font-size: 10px; border:1px solid #e2e8f0; border-radius: 13px; overflow:hidden; }
      table.detail th { background: #1e293b; color: #fff; padding: 7px 8px; text-align: right; }
      table.detail td { border-bottom: 1px solid #e5e7eb; padding: 6px 8px; text-align: right; }
      table.detail tr:nth-child(even) td { background: #f8fafc; }
      .vat-col { color: #92400e; font-weight: 700; }
      .total-col { font-weight: 800; }
      .sig-block { display: flex; gap: 40px; margin-top: 30px; }
      .sig-field { flex: 1; border-top: 1px solid #999; padding-top: 8px; font-size: 10px; color: #555; text-align: center; }
    `,
  });
}
