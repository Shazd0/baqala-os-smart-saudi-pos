import React, { useState } from 'react';
import { Shift, Language } from '../types';
import { StorageService } from '../services/storageService';
import { useToast } from './Toast';
import { X, Clock } from 'lucide-react';

interface ShiftManagerProps {
  lang: Language;
  onClose: () => void;
  onShiftOpened?: (shift: Shift) => void;
  onShiftClosed?: (shift: Shift) => void;
}

const DENOMINATIONS = [
  { value: 500, label: '500' },
  { value: 200, label: '200' },
  { value: 100, label: '100' },
  { value: 50, label: '50' },
  { value: 20, label: '20' },
  { value: 10, label: '10' },
  { value: 5, label: '5' },
  { value: 1, label: '1' },
  { value: 0.5, label: '0.50' },
  { value: 0.25, label: '0.25' },
];

function copy(lang: Language, en: string, ar: string) { return lang === 'ar' ? ar : en; }

interface DenomRowProps { d: { value: number; label: string }; value: number; onChange: (v: number) => void }
const DenomRow: React.FC<DenomRowProps> = ({ d, value, onChange }) => (
  <div className="flex items-center gap-3">
    <span className="w-16 text-right font-mono text-sm font-bold text-[var(--ios-text)]">{d.label} SAR</span>
    <input
      type="number" min={0} value={value || ''}
      onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0))}
      className="w-20 rounded-xl border border-[var(--ios-border)] bg-[var(--ios-fill)] px-3 py-2 text-center font-mono text-sm"
    />
    <span className="w-24 text-right text-sm text-[var(--ios-secondary)]">
      = {(d.value * value).toFixed(2)} SAR
    </span>
  </div>
);

interface SummaryRow { lbl: string; val: number | undefined; isCurrency?: false }

const ShiftManager: React.FC<ShiftManagerProps> = ({ lang, onClose, onShiftOpened, onShiftClosed }) => {
  const { toast } = useToast();
  const [currentShift, setCurrentShift] = useState<Shift | undefined>(StorageService.getCurrentShift());
  const [cashierName, setCashierName] = useState('');
  const [denominations, setDenominations] = useState<Record<number, number>>(
    Object.fromEntries(DENOMINATIONS.map(d => [d.value, 0]))
  );
  const [closingDenominations, setClosingDenominations] = useState<Record<number, number>>(
    Object.fromEntries(DENOMINATIONS.map(d => [d.value, 0]))
  );

  const openingTotal = DENOMINATIONS.reduce((sum, d) => sum + d.value * (denominations[d.value] || 0), 0);
  const closingTotal = DENOMINATIONS.reduce((sum, d) => sum + d.value * (closingDenominations[d.value] || 0), 0);

  const reconciliation = (() => {
    if (!currentShift) return null;
    const txs = StorageService.getTransactions().filter(
      t => t.timestamp >= currentShift.openedAt && (!currentShift.closedAt || t.timestamp <= currentShift.closedAt)
    );
    const cashSales = txs.filter(t => t.paymentMethod === 'cash' && !t.isRefund).reduce((s, t) => s + t.total, 0);
    const cashRefunds = txs.filter(t => t.paymentMethod === 'cash' && t.isRefund).reduce((s, t) => s + Math.abs(t.total), 0);
    const cardSales = txs.filter(t => t.paymentMethod === 'card' && !t.isRefund).reduce((s, t) => s + t.total, 0);
    const totalRefunds = txs.filter(t => t.isRefund).reduce((s, t) => s + Math.abs(t.total), 0);
    const totalVat = txs.filter(t => !t.isRefund).reduce((s, t) => s + (t.vat ?? 0), 0);
    const expectedCash = (currentShift.openingCash || 0) + cashSales - cashRefunds;
    return {
      totalSales: cashSales + cardSales,
      totalCashSales: cashSales,
      totalCardSales: cardSales,
      totalRefunds,
      totalVat,
      invoiceCount: txs.filter(t => !t.isRefund).length,
      expectedCash,
      cashVariance: closingTotal - expectedCash,
    };
  })();

  const handleOpenShift = () => {
    if (!cashierName.trim()) {
      toast(copy(lang, 'Enter cashier name', 'أدخل اسم الكاشير'), 'error');
      return;
    }
    const shift = StorageService.openShift({
      branchId: StorageService.getActiveBranchId?.() ?? 'default',
      openedBy: cashierName.trim(),
      openedAt: Date.now(),
      openingCash: openingTotal,
      openingDenominations: DENOMINATIONS.map(d => ({ value: d.value, count: denominations[d.value] || 0 })),
    });
    setCurrentShift(shift);
    toast(copy(lang, 'Shift opened', 'تم فتح الوردية'), 'success');
    onShiftOpened?.(shift);
  };

  const handleCloseShift = () => {
    if (!currentShift || !reconciliation) return;
    const closed = StorageService.closeShift(currentShift.id, {
      closingCash: closingTotal,
      closingDenominations: DENOMINATIONS.map(d => ({ value: d.value, count: closingDenominations[d.value] || 0 })),
      expectedCash: reconciliation.expectedCash,
      cashVariance: reconciliation.cashVariance,
      totalSales: reconciliation.totalSales,
      totalCashSales: reconciliation.totalCashSales,
      totalCardSales: reconciliation.totalCardSales,
      totalRefunds: reconciliation.totalRefunds,
      totalVat: reconciliation.totalVat,
      invoiceCount: reconciliation.invoiceCount,
    });
    if (closed) {
      toast(copy(lang, 'Shift closed', 'تم إغلاق الوردية'), 'success');
      onShiftClosed?.(closed);
      onClose();
    }
  };

  const summaryRows: SummaryRow[] = reconciliation ? [
    { lbl: copy(lang, 'Total Sales', 'إجمالي المبيعات'), val: reconciliation.totalSales },
    { lbl: copy(lang, 'Cash Sales', 'مبيعات نقدية'), val: reconciliation.totalCashSales },
    { lbl: copy(lang, 'Card Sales', 'مبيعات بطاقة'), val: reconciliation.totalCardSales },
    { lbl: copy(lang, 'Refunds', 'المرتجعات'), val: reconciliation.totalRefunds },
    { lbl: copy(lang, 'Total VAT', 'إجمالي الضريبة'), val: reconciliation.totalVat },
    { lbl: copy(lang, 'Invoices', 'عدد الفواتير'), val: reconciliation.invoiceCount, isCurrency: false },
    { lbl: copy(lang, 'Expected Cash', 'النقد المتوقع'), val: reconciliation.expectedCash },
  ] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--ios-bg)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--ios-border)] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ios-accent-soft)]">
              <Clock size={20} className="text-[var(--ios-accent)]" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[var(--ios-text)]">
                {currentShift ? copy(lang, 'Close Shift', 'إغلاق الوردية') : copy(lang, 'Open Shift', 'فتح الوردية')}
              </h2>
              {currentShift && (
                <p className="text-xs text-[var(--ios-secondary)]">
                  {copy(lang, 'Opened by', 'فُتحت بواسطة')} {currentShift.openedBy} — {new Date(currentShift.openedAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--ios-fill)] text-[var(--ios-secondary)]">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {!currentShift ? (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[var(--ios-tertiary)]">
                  {copy(lang, 'Cashier Name', 'اسم الكاشير')}
                </label>
                <input
                  value={cashierName} onChange={e => setCashierName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--ios-border)] bg-[var(--ios-fill)] px-4 py-3 text-sm"
                  placeholder={copy(lang, 'Your name', 'اسمك')}
                />
              </div>
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--ios-tertiary)]">
                  {copy(lang, 'Opening Cash Count', 'عد النقد الافتتاحي')}
                </p>
                <div className="space-y-2 rounded-xl bg-[var(--ios-fill)] p-4">
                  {DENOMINATIONS.map(d => (
                    <DenomRow key={d.value} d={d} value={denominations[d.value] || 0}
                      onChange={v => setDenominations(prev => ({ ...prev, [d.value]: v }))} />
                  ))}
                  <div className="mt-3 border-t border-[var(--ios-border)] pt-3 text-right font-bold text-[var(--ios-accent)]">
                    {copy(lang, 'Total', 'المجموع')}: {openingTotal.toFixed(2)} SAR
                  </div>
                </div>
              </div>
              <button onClick={handleOpenShift} className="w-full rounded-2xl bg-[var(--ios-accent)] py-3.5 font-bold text-white">
                {copy(lang, 'Open Shift', 'فتح الوردية')}
              </button>
            </>
          ) : (
            <>
              {reconciliation && summaryRows.length > 0 && (
                <div className="rounded-xl bg-[var(--ios-fill)] p-4 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--ios-tertiary)] mb-3">
                    {copy(lang, 'Shift Summary', 'ملخص الوردية')}
                  </p>
                  {summaryRows.map(row => (
                    <div key={row.lbl} className="flex justify-between text-sm">
                      <span className="text-[var(--ios-secondary)]">{row.lbl}</span>
                      <span className="font-bold text-[var(--ios-text)]">
                        {row.isCurrency === false ? (row.val ?? 0) : `${(row.val ?? 0).toFixed(2)} SAR`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--ios-tertiary)]">
                  {copy(lang, 'Closing Cash Count', 'عد النقد الختامي')}
                </p>
                <div className="space-y-2 rounded-xl bg-[var(--ios-fill)] p-4">
                  {DENOMINATIONS.map(d => (
                    <DenomRow key={d.value} d={d} value={closingDenominations[d.value] || 0}
                      onChange={v => setClosingDenominations(prev => ({ ...prev, [d.value]: v }))} />
                  ))}
                  <div className="mt-3 border-t border-[var(--ios-border)] pt-3 space-y-1">
                    <div className="flex justify-between text-sm font-bold">
                      <span>{copy(lang, 'Closing Cash', 'النقد الختامي')}</span>
                      <span className="text-[var(--ios-text)]">{closingTotal.toFixed(2)} SAR</span>
                    </div>
                    {reconciliation && (
                      <div className={`flex justify-between text-sm font-bold ${Math.abs(reconciliation.cashVariance) < 0.01 ? 'text-[var(--ios-accent)]' : reconciliation.cashVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <span>{copy(lang, 'Variance', 'الفارق')}</span>
                        <span>{reconciliation.cashVariance >= 0 ? '+' : ''}{reconciliation.cashVariance.toFixed(2)} SAR</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={handleCloseShift} className="w-full rounded-2xl bg-red-500 py-3.5 font-bold text-white">
                {copy(lang, 'Close Shift & Print Z-Report', 'إغلاق الوردية وطباعة التقرير')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShiftManager;
