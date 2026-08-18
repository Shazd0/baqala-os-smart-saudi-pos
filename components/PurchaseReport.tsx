import React, { useMemo, useState } from 'react';
import { Language, Product, PurchaseInvoice, Transaction } from '../types';
import { StorageService } from '../services/storageService';
import { buildPurchaseVatReport } from '../services/reports';
import { Download, Eye, FileText, TrendingDown, TrendingUp } from 'lucide-react';
import PurchaseInvoiceModal from './PurchaseInvoiceModal';
import { openVatReturnWindow } from '../services/vatReturnPdf';
import { downloadCsv } from '../services/csvService';

interface PurchaseReportProps {
  products: Product[];
  transactions: Transaction[];
  lang: Language;
  onInventoryChange: () => void;
}

type Period = 'this_month' | 'last_month' | 'this_year' | 'custom';

function periodBounds(period: Period, from: string, to: string): { dateFrom: number; dateTo: number } {
  const now = new Date();
  if (period === 'this_month') {
    return {
      dateFrom: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
      dateTo: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime(),
    };
  }
  if (period === 'last_month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { dateFrom: first.getTime(), dateTo: last.getTime() };
  }
  if (period === 'this_year') {
    return {
      dateFrom: new Date(now.getFullYear(), 0, 1).getTime(),
      dateTo: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime(),
    };
  }
  // Parse yyyy-mm-dd as local date (not UTC) to avoid timezone off-by-one
  const parseLocalDate = (s: string, endOfDay = false) => {
    const [y, m, d] = s.split('-').map(Number);
    return endOfDay
      ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
      : new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  };
  return {
    dateFrom: from ? parseLocalDate(from) : 0,
    dateTo: to ? parseLocalDate(to, true) : Date.now(),
  };
}

const formatSar = (n: number) => `${n.toFixed(2)} ر.س`;

const PurchaseReport: React.FC<PurchaseReportProps> = ({ products, transactions, lang, onInventoryChange }) => {
  const [period, setPeriod] = useState<Period>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [viewInvoice, setViewInvoice] = useState<PurchaseInvoice | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>(() => StorageService.getPurchaseInvoices());

  const refreshPurchaseData = () => {
    setInvoices([...StorageService.getPurchaseInvoices()]);
    onInventoryChange();
  };

  const bounds = useMemo(() => periodBounds(period, customFrom, customTo), [period, customFrom, customTo]);

  const report = useMemo(
    () => buildPurchaseVatReport(invoices, transactions, bounds.dateFrom, bounds.dateTo),
    [invoices, transactions, bounds]
  );

  const periodLabel: Record<Period, string> = {
    this_month: lang === 'ar' ? 'هذا الشهر' : 'This Month',
    last_month: lang === 'ar' ? 'الشهر الماضي' : 'Last Month',
    this_year: lang === 'ar' ? 'هذا العام' : 'This Year',
    custom: lang === 'ar' ? 'فترة مخصصة' : 'Custom Range',
  };

  const exportCsv = () => {
    const headers = ['Date', 'Supplier', 'VAT No.', 'Invoice No.', 'Lines', 'Subtotal', 'VAT', 'Total'];
    const rows = report.rows.map(inv => [
      new Date(inv.date).toLocaleDateString(),
      inv.supplierName,
      inv.supplierVatNumber ?? '',
      inv.invoiceNumber,
      inv.lines.length,
      inv.subtotal.toFixed(2),
      inv.vat.toFixed(2),
      inv.total.toFixed(2),
    ]);
    downloadCsv(`purchase_report_${Date.now()}.csv`, headers, rows);
  };

  const printVatReturn = () => {
    openVatReturnWindow({
      periodLabel: periodLabel[period],
      dateFrom: bounds.dateFrom,
      dateTo: bounds.dateTo,
      totalSalesExVat: report.totalSales,
      outputVat: report.totalOutputVat,
      totalPurchasesExVat: report.totalPurchases,
      inputVat: report.totalInputVat,
      netVat: report.netVatPosition,
      invoices: report.rows,
      transactions: transactions.filter(tx => tx.timestamp >= bounds.dateFrom && tx.timestamp <= bounds.dateTo),
      config: StorageService.getConfig(),
    });
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 bg-gray-50">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {lang === 'ar' ? 'تقرير المشتريات وإقرار الضريبة' : 'Purchase & VAT Return Report'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {lang === 'ar' ? 'ملخص ضريبة المدخلات مقابل ضريبة المخرجات' : 'Input VAT vs Output VAT summary for ZATCA filing'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow text-sm"
          >
            + {lang === 'ar' ? 'فاتورة شراء جديدة' : 'New Purchase Invoice'}
          </button>
          <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 bg-white border text-gray-700 rounded-xl hover:bg-gray-50 text-sm">
            <Download size={16} /> CSV
          </button>
          <button onClick={printVatReturn} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold">
            <FileText size={16} /> {lang === 'ar' ? 'إقرار ضريبة PDF (نموذج 001)' : 'VAT Return PDF (Form 001)'}
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap gap-2 items-center">
        {(Object.keys(periodLabel) as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === p ? 'bg-slate-900 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
          >
            {periodLabel[p]}
          </button>
        ))}
        {period === 'custom' && (
          <>
            <input type="date" className="border rounded-lg p-1.5 text-sm" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            <span className="text-gray-400">—</span>
            <input type="date" className="border rounded-lg p-1.5 text-sm" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </>
        )}
      </div>

      {/* VAT Return Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="vat-return-summary">
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            {lang === 'ar' ? 'إجمالي المشتريات (بدون ضريبة)' : 'Total Purchases (excl. VAT)'}
          </p>
          <p className="text-2xl font-black text-gray-900">{report.totalPurchases.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{report.invoiceCount} {lang === 'ar' ? 'فاتورة' : 'invoices'}</p>
        </div>

        <div className="bg-amber-50 rounded-xl border border-amber-200 p-5 shadow-sm">
          <p className="text-xs text-amber-700 uppercase tracking-wide mb-1">
            {lang === 'ar' ? 'ضريبة المدخلات (مدفوعة للموردين)' : 'Input VAT Paid to Suppliers'}
          </p>
          <p className="text-2xl font-black text-amber-800">{report.totalInputVat.toFixed(2)} SAR</p>
          <p className="text-xs text-amber-600 mt-0.5">{lang === 'ar' ? 'قابلة للاسترداد من الزكاة والدخل' : 'Reclaimable from ZATCA'}</p>
        </div>

        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            {lang === 'ar' ? 'إجمالي المبيعات (بدون ضريبة)' : 'Total Sales (excl. VAT)'}
          </p>
          <p className="text-2xl font-black text-gray-900">{report.totalSales.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{report.saleCount} {lang === 'ar' ? 'فاتورة بيع' : 'sale invoices'}</p>
        </div>

        <div className="bg-blue-50 rounded-xl border border-blue-200 p-5 shadow-sm">
          <p className="text-xs text-blue-700 uppercase tracking-wide mb-1">
            {lang === 'ar' ? 'ضريبة المخرجات (محصّلة من العملاء)' : 'Output VAT Collected from Customers'}
          </p>
          <p className="text-2xl font-black text-blue-800">{report.totalOutputVat.toFixed(2)} SAR</p>
          <p className="text-xs text-blue-600 mt-0.5">{lang === 'ar' ? 'واجبة التسديد لهيئة الزكاة والضريبة' : 'Payable to ZATCA'}</p>
        </div>

        <div className={`rounded-xl border p-5 shadow-sm col-span-1 md:col-span-2 lg:col-span-1 ${report.netVatPosition >= 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          <p className={`text-xs uppercase tracking-wide mb-1 ${report.netVatPosition >= 0 ? 'text-red-700' : 'text-green-700'}`}>
            {lang === 'ar' ? 'صافي الضريبة المستحقة / المستردة' : 'Net VAT Payable / Refundable'}
          </p>
          <div className="flex items-center gap-2">
            {report.netVatPosition >= 0 ? (
              <TrendingUp size={20} className="text-red-600" />
            ) : (
              <TrendingDown size={20} className="text-green-600" />
            )}
            <p className={`text-3xl font-black ${report.netVatPosition >= 0 ? 'text-red-700' : 'text-green-700'}`}>
              {Math.abs(report.netVatPosition).toFixed(2)} SAR
            </p>
          </div>
          <p className={`text-xs mt-1 font-medium ${report.netVatPosition >= 0 ? 'text-red-600' : 'text-green-600'}`}>
            {report.netVatPosition >= 0
              ? (lang === 'ar' ? 'مستحقة الدفع لهيئة الزكاة والضريبة' : 'Due to ZATCA')
              : (lang === 'ar' ? 'مستردة من هيئة الزكاة والضريبة' : 'Refundable from ZATCA')}
          </p>
        </div>

        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            {lang === 'ar' ? 'مجمل الربح' : 'Gross Profit'}
          </p>
          <p className={`text-2xl font-black ${report.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {report.grossProfit.toFixed(2)} SAR
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {lang === 'ar' ? 'المبيعات — المشتريات' : 'Sales revenue − Purchase cost'}
          </p>
        </div>
      </div>

      {/* Printable VAT Return header (hidden on screen) */}
      <div className="hidden print:block text-center mb-6">
        <h1 className="text-2xl font-bold">إقرار ضريبة القيمة المضافة</h1>
        <h2 className="text-lg">VAT Return Summary</h2>
        <p className="text-sm text-gray-500">{new Date().toLocaleDateString('ar-SA')} — {periodLabel[period]}</p>
        <div className="mt-4 space-y-1 text-sm text-right" dir="rtl">
          <div className="flex justify-between"><span>إجمالي المشتريات:</span><strong>{report.totalPurchases.toFixed(2)} SAR</strong></div>
          <div className="flex justify-between"><span>ضريبة المدخلات:</span><strong>{report.totalInputVat.toFixed(2)} SAR</strong></div>
          <div className="flex justify-between"><span>إجمالي المبيعات:</span><strong>{report.totalSales.toFixed(2)} SAR</strong></div>
          <div className="flex justify-between"><span>ضريبة المخرجات:</span><strong>{report.totalOutputVat.toFixed(2)} SAR</strong></div>
          <div className="flex justify-between font-bold border-t pt-1"><span>صافي الضريبة:</span><strong>{report.netVatPosition.toFixed(2)} SAR</strong></div>
        </div>
      </div>

      {/* Purchase Invoice Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden print:hidden">
        <div className="p-4 border-b">
          <h3 className="font-bold text-gray-800">
            {lang === 'ar' ? 'سجل فواتير الشراء' : 'Purchase Invoice Register'}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-3 text-start text-gray-700 font-semibold">{lang === 'ar' ? 'التاريخ' : 'Date'}</th>
                <th className="p-3 text-start text-gray-700 font-semibold">{lang === 'ar' ? 'المورد' : 'Supplier'}</th>
                <th className="p-3 text-start text-gray-700 font-semibold">{lang === 'ar' ? 'رقم الفاتورة' : 'Invoice No.'}</th>
                <th className="p-3 text-center text-gray-700 font-semibold">{lang === 'ar' ? 'البنود' : 'Lines'}</th>
                <th className="p-3 text-end text-gray-700 font-semibold">{lang === 'ar' ? 'المجموع' : 'Subtotal'}</th>
                <th className="p-3 text-end text-gray-700 font-semibold">{lang === 'ar' ? 'الضريبة' : 'VAT'}</th>
                <th className="p-3 text-end text-gray-700 font-semibold">{lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
                <th className="p-3 text-center text-gray-700 font-semibold">{lang === 'ar' ? 'عرض' : 'View'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-400">
                    {lang === 'ar' ? 'لا توجد فواتير في هذه الفترة' : 'No invoices in this period'}
                  </td>
                </tr>
              )}
              {report.rows.map((inv, ri) => (
                <tr key={inv.id || `inv-${ri}`} className="hover:bg-gray-50 transition-colors">
                  <td className="p-3 text-gray-700">{new Date(inv.date).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB')}</td>
                  <td className="p-3">
                    <div className="font-medium text-gray-900">{inv.supplierName}</div>
                    {inv.supplierVatNumber && (
                      <div className="text-xs text-gray-400">{inv.supplierVatNumber}</div>
                    )}
                  </td>
                  <td className="p-3 font-mono text-gray-700">{inv.invoiceNumber}</td>
                  <td className="p-3 text-center text-gray-700">{inv.lines.length}</td>
                  <td className="p-3 text-end text-gray-800">{inv.subtotal.toFixed(2)}</td>
                  <td className="p-3 text-end text-amber-700 font-semibold">{inv.vat.toFixed(2)}</td>
                  <td className="p-3 text-end font-bold text-gray-900">{formatSar(inv.total)}</td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => setViewInvoice(inv)}
                      className="p-1.5 text-gray-400 hover:text-slate-800 hover:bg-gray-100 rounded-lg transition-colors"
                      title={lang === 'ar' ? 'عرض / طباعة' : 'View / Print'}
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {report.rows.length > 0 && (
              <tfoot className="bg-gray-50 border-t font-bold text-sm">
                <tr>
                  <td colSpan={4} className="p-3 text-gray-700">
                    {lang === 'ar' ? `المجموع (${report.invoiceCount} فاتورة)` : `Totals (${report.invoiceCount} invoices)`}
                  </td>
                  <td className="p-3 text-end">{report.totalPurchases.toFixed(2)}</td>
                  <td className="p-3 text-end text-amber-700">{report.totalInputVat.toFixed(2)}</td>
                  <td className="p-3 text-end">{formatSar(report.totalPurchases + report.totalInputVat)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modals */}
      {showNew && (
        <PurchaseInvoiceModal
          products={products}
          lang={lang}
          onSaved={() => { refreshPurchaseData(); setShowNew(false); }}
          onClose={() => setShowNew(false)}
        />
      )}

      {viewInvoice && (
        <PurchaseInvoiceModal
          products={products}
          lang={lang}
          editInvoice={viewInvoice}
          onSaved={() => { refreshPurchaseData(); setViewInvoice(null); }}
          onClose={() => setViewInvoice(null)}
        />
      )}
    </div>
  );
};

export default PurchaseReport;
