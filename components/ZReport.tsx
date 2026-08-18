import React, { useState, useEffect } from 'react';
import { Shift, Language } from '../types';
import { StorageService } from '../services/storageService';
import { PrinterService } from '../services/printerService';
import { useToast } from './Toast';
import { Printer, Clock } from 'lucide-react';

interface ZReportProps { lang: Language; }

function copy(lang: Language, en: string, ar: string) { return lang === 'ar' ? ar : en; }

function formatDuration(openedAt: number, closedAt?: number): string {
  const ms = (closedAt ?? Date.now()) - openedAt;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

const ZReport: React.FC<ZReportProps> = ({ lang }) => {
  const { toast } = useToast();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selected, setSelected] = useState<Shift | null>(null);

  useEffect(() => {
    const all = StorageService.getShifts().sort((a, b) => b.openedAt - a.openedAt);
    setShifts(all);
    if (all.length && !selected) setSelected(all[0]);
  }, []);

  const handlePrint = async () => {
    if (!selected) return;
    const result = await PrinterService.printReceipt({
      storeName: StorageService.getConfig().nameEn,
      date: new Date(selected.closedAt ?? selected.openedAt).toLocaleString(),
      invoiceId: `Z-REPORT ${selected.id.slice(-6).toUpperCase()}`,
      cashierName: selected.openedBy,
      items: [],
      subtotal: selected.totalSales ?? 0,
      discount: 0,
      vat: selected.totalVat ?? 0,
      total: selected.totalSales ?? 0,
      paid: selected.totalCashSales ?? 0,
      change: 0,
      paymentMethod: 'Z-Report',
    });
    if (result.success) toast(copy(lang, 'Z-Report printed', 'تمت طباعة التقرير'), 'success');
    else toast(result.error ?? 'Print failed', 'error');
  };

  return (
    <div className="ios-page space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--ios-accent)]">
            {copy(lang, 'Reporting', 'التقارير')}
          </p>
          <h1 className="ios-title mt-1.5">Z-Report</h1>
          <p className="ios-subtitle mt-1">{copy(lang, 'Shift summaries and daily reconciliation', 'ملخص الورديات والتسوية اليومية')}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Shift list */}
        <div className="space-y-2 lg:col-span-1">
          {shifts.length === 0 && (
            <div className="ios-card flex flex-col items-center gap-2 py-10 text-center text-[var(--ios-tertiary)]">
              <Clock size={32} />
              <p className="text-sm">{copy(lang, 'No shifts yet', 'لا ورديات بعد')}</p>
            </div>
          )}
          {shifts.map(shift => (
            <button key={shift.id} onClick={() => setSelected(shift)}
              className={`w-full rounded-2xl border p-4 text-left transition-all ${selected?.id === shift.id ? 'border-[var(--ios-accent)] bg-[var(--ios-accent-soft)]' : 'border-[var(--ios-border)] bg-[var(--ios-card)] hover:border-[var(--ios-accent)]'}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--ios-text)]">{shift.openedBy}</span>
                {shift.status === 'open'
                  ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">OPEN</span>
                  : <span className="rounded-full bg-[var(--ios-fill)] px-2 py-0.5 text-xs font-bold text-[var(--ios-secondary)]">CLOSED</span>}
              </div>
              <p className="mt-1 text-xs text-[var(--ios-secondary)]">
                {new Date(shift.openedAt).toLocaleDateString()} — {formatDuration(shift.openedAt, shift.closedAt)}
              </p>
              <p className="mt-1 text-sm font-bold text-[var(--ios-accent)]">
                {(shift.totalSales ?? 0).toFixed(2)} SAR
              </p>
            </button>
          ))}
        </div>

        {/* Shift detail */}
        {selected && (
          <div className="ios-card lg:col-span-2 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-[var(--ios-text)]">
                {copy(lang, 'Shift Detail', 'تفاصيل الوردية')}
              </h3>
              {selected.status === 'closed' && PrinterService.isAvailable() && (
                <button onClick={handlePrint}
                  className="flex items-center gap-2 rounded-xl bg-[var(--ios-accent)] px-4 py-2 text-sm font-bold text-white">
                  <Printer size={16} />
                  {copy(lang, 'Print Z-Report', 'طباعة التقرير')}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { lbl: copy(lang, 'Opened by', 'فُتحت بواسطة'), val: selected.openedBy },
                { lbl: copy(lang, 'Opened at', 'وقت الفتح'), val: new Date(selected.openedAt).toLocaleString() },
                { lbl: copy(lang, 'Closed at', 'وقت الإغلاق'), val: selected.closedAt ? new Date(selected.closedAt).toLocaleString() : '—' },
                { lbl: copy(lang, 'Duration', 'المدة'), val: formatDuration(selected.openedAt, selected.closedAt) },
              ].map(r => (
                <div key={r.lbl} className="rounded-xl bg-[var(--ios-fill)] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ios-tertiary)]">{r.lbl}</p>
                  <p className="mt-1 text-sm font-bold text-[var(--ios-text)]">{r.val}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-[var(--ios-fill)] p-4 space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--ios-tertiary)]">
                {copy(lang, 'Sales Breakdown', 'تفاصيل المبيعات')}
              </p>
              {([
                { lbl: copy(lang, 'Total Sales', 'إجمالي المبيعات'), val: selected.totalSales as number | undefined, accent: true, negative: false, isCurrency: undefined as false | undefined },
                { lbl: copy(lang, 'Cash Sales', 'مبيعات نقدية'), val: selected.totalCashSales as number | undefined, accent: false, negative: false, isCurrency: undefined as false | undefined },
                { lbl: copy(lang, 'Card Sales', 'مبيعات بطاقة'), val: selected.totalCardSales as number | undefined, accent: false, negative: false, isCurrency: undefined as false | undefined },
                { lbl: copy(lang, 'Total Refunds', 'إجمالي المرتجعات'), val: selected.totalRefunds as number | undefined, accent: false, negative: true, isCurrency: undefined as false | undefined },
                { lbl: copy(lang, 'VAT Collected', 'الضريبة المحصّلة'), val: selected.totalVat as number | undefined, accent: false, negative: false, isCurrency: undefined as false | undefined },
                { lbl: copy(lang, 'Invoices', 'عدد الفواتير'), val: selected.invoiceCount as number | undefined, accent: false, negative: false, isCurrency: false as false | undefined },
              ] as { lbl: string; val: number | undefined; accent: boolean; negative: boolean; isCurrency: false | undefined }[]).map(r => (
                <div key={r.lbl} className="flex justify-between">
                  <span className="text-sm text-[var(--ios-secondary)]">{r.lbl}</span>
                  <span className={`text-sm font-bold ${r.accent ? 'text-[var(--ios-accent)]' : r.negative ? 'text-red-600' : 'text-[var(--ios-text)]'}`}>
                    {r.isCurrency === false ? (r.val ?? 0) : `${((r as { val: number | undefined }).val ?? 0).toFixed(2)} SAR`}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-[var(--ios-fill)] p-4 space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--ios-tertiary)]">
                {copy(lang, 'Cash Reconciliation', 'تسوية النقدية')}
              </p>
              {[
                { lbl: copy(lang, 'Opening Cash', 'النقد الافتتاحي'), val: selected.openingCash },
                { lbl: copy(lang, 'Expected Cash', 'النقد المتوقع'), val: selected.expectedCash },
                { lbl: copy(lang, 'Closing Cash', 'النقد الختامي'), val: selected.closingCash },
              ].map(r => (
                <div key={r.lbl} className="flex justify-between">
                  <span className="text-sm text-[var(--ios-secondary)]">{r.lbl}</span>
                  <span className="text-sm font-bold text-[var(--ios-text)]">{((r.val ?? 0) as number).toFixed(2)} SAR</span>
                </div>
              ))}
              {selected.closedAt && (
                <div className={`flex justify-between rounded-xl px-3 py-2 ${Math.abs(selected.cashVariance ?? 0) < 0.01 ? 'bg-green-50' : (selected.cashVariance ?? 0) > 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
                  <span className="text-sm font-bold">{copy(lang, 'Variance', 'الفارق')}</span>
                  <span className={`text-sm font-black ${Math.abs(selected.cashVariance ?? 0) < 0.01 ? 'text-green-700' : (selected.cashVariance ?? 0) > 0 ? 'text-blue-700' : 'text-red-700'}`}>
                    {(selected.cashVariance ?? 0) >= 0 ? '+' : ''}{((selected.cashVariance ?? 0) as number).toFixed(2)} SAR
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ZReport;
