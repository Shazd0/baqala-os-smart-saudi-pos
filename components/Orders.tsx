import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, Printer, ReceiptText, RotateCcw, Search, TrendingDown, TrendingUp, WalletCards } from 'lucide-react';
import { Language, Transaction, User } from '../types';
import { TRANSLATIONS } from '../constants';
import { StorageService } from '../services/storageService';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';

interface OrdersProps {
  transactions: Transaction[];
  lang: Language;
  currentUser: User;
  onRefund: () => void;
  onReprint: (transaction: Transaction) => void;
}

type Preset = 'today' | 'week' | 'month';

function dateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function formatSar(value: number) {
  return `SAR ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function branchScopeForUser(user: User) {
  if (user.role === 'administrator') return null;
  return user.primaryBranchId || user.branchIds?.[0] || '';
}

const controlClass = 'h-11 rounded-xl border-0 bg-slate-100 px-4 text-sm font-bold text-[#1C1C1E] outline-none transition-all duration-200 ease-out focus:bg-white focus:shadow-[0_0_0_1.5px_#1E6B48] active:scale-[0.97]';

const Orders: React.FC<OrdersProps> = ({ transactions, lang, currentUser, onRefund, onReprint }) => {
  const t = TRANSLATIONS[lang];
  const { toast } = useToast();
  const branches = StorageService.getBranches();
  const isAdmin = currentUser.role === 'administrator';
  const staffBranchId = branchScopeForUser(currentUser);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<'all' | string>(isAdmin ? 'all' : staffBranchId);
  const [fromDate, setFromDate] = useState(dateInputValue(startOfDay(new Date())));
  const [toDate, setToDate] = useState(dateInputValue(endOfDay(new Date())));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<Transaction | null>(null);

  const branchFilter = isAdmin ? selectedBranchId : staffBranchId;

  const applyPreset = (preset: Preset) => {
    const now = new Date();
    if (preset === 'today') {
      setFromDate(dateInputValue(startOfDay(now)));
      setToDate(dateInputValue(endOfDay(now)));
      return;
    }
    if (preset === 'week') {
      const start = startOfDay(now);
      start.setDate(now.getDate() - now.getDay());
      setFromDate(dateInputValue(start));
      setToDate(dateInputValue(endOfDay(now)));
      return;
    }
    const monthStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    setFromDate(dateInputValue(monthStart));
    setToDate(dateInputValue(endOfDay(now)));
  };

  const filtered = useMemo(() => {
    const fromTime = fromDate ? startOfDay(new Date(fromDate)).getTime() : Number.NEGATIVE_INFINITY;
    const toTime = toDate ? endOfDay(new Date(toDate)).getTime() : Number.POSITIVE_INFINITY;
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return transactions
      .filter(transaction => {
        if (!isAdmin && !staffBranchId) return false;
        if (branchFilter && branchFilter !== 'all' && transaction.branchId !== branchFilter) return false;
        if (transaction.timestamp < fromTime || transaction.timestamp > toTime) return false;
        if (!normalizedSearch) return true;
        return [
          transaction.id,
          transaction.note || '',
          transaction.cashierName || '',
          transaction.paymentMethod,
        ].some(value => String(value).toLowerCase().includes(normalizedSearch));
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [branchFilter, fromDate, isAdmin, searchTerm, staffBranchId, toDate, transactions]);

  const metrics = useMemo(() => {
    const gross = filtered.filter(transaction => !transaction.isRefund).reduce((sum, transaction) => sum + transaction.total, 0);
    const vat = filtered.reduce((sum, transaction) => sum + transaction.vat, 0);
    const refunds = Math.abs(filtered.filter(transaction => transaction.isRefund).reduce((sum, transaction) => sum + transaction.total, 0));
    return { gross, vat, refunds, count: filtered.length };
  }, [filtered]);

  const handleRefund = (transaction: Transaction) => {
    if (!StorageService.hasPermission('refund')) {
      toast(lang === 'ar' ? 'ليست لديك صلاحية الاسترجاع' : 'You do not have permission to refund sales', 'error');
      return;
    }
    if (transactions.some(tx => tx.isRefund && tx.refundOf === transaction.id)) {
      toast(lang === 'ar' ? 'تم استرجاع هذه الفاتورة مسبقاً' : 'This invoice already has a linked refund', 'warning');
      return;
    }
    setRefundTarget(transaction);
  };

  const confirmRefund = () => {
    if (!refundTarget) return;
    const refundTx: Transaction = {
      ...refundTarget,
      id: `REF-${Date.now()}`,
      timestamp: Date.now(),
      isRefund: true,
      refundOf: refundTarget.id,
      total: -refundTarget.total,
      subtotal: -refundTarget.subtotal,
      vat: -refundTarget.vat,
      status: 'refunded',
      note: `Refund for #${refundTarget.id.slice(-6)}`,
    };
    StorageService.saveTransaction(refundTx);
    setRefundTarget(null);
    onRefund();
    toast(lang === 'ar' ? 'تم الاسترجاع بنجاح' : 'Refund processed successfully', 'success');
  };

  return (
    <div className="h-full overflow-hidden bg-[#F2F2F7] p-3 text-[#1C1C1E] sm:p-5">
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-4 shrink-0 sm:mb-5">
          <div className="mb-4 flex flex-col justify-between gap-3 xl:flex-row xl:items-end">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#1E6B48] sm:text-xs">
                {lang === 'ar' ? 'السجل المالي' : 'Financial Ledger'}
              </p>
              <h1 className="mt-1.5 text-4xl font-black tracking-tight text-[#1C1C1E]">{t.orders}</h1>
              <p className="mt-1.5 text-xs font-semibold text-[#8E8E93] sm:text-sm">
                {isAdmin
                  ? (lang === 'ar' ? 'عرض كل الفروع مع فلترة دقيقة حسب التاريخ.' : 'Owner visibility across all branches with strict date filtering.')
                  : (lang === 'ar' ? 'الفواتير معزولة تلقائياً للفرع المخصص لك فقط.' : 'Invoices are automatically isolated to your assigned branch.')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {isAdmin && (
                <select value={selectedBranchId} onChange={event => setSelectedBranchId(event.target.value)} className={`${controlClass} min-w-0 flex-1 sm:min-w-[210px] sm:flex-none`}>
                  <option value="all">{lang === 'ar' ? 'كل الفروع' : 'All branches'}</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{lang === 'ar' ? branch.nameAr : branch.nameEn}</option>
                  ))}
                </select>
              )}
              {!isAdmin && (
                <div className="flex h-11 items-center rounded-xl bg-white px-4 text-sm font-black text-[#1C1C1E] shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
                  {branches.find(branch => branch.id === staffBranchId)?.nameEn || (lang === 'ar' ? 'الفرع المخصص' : 'Assigned branch')}
                </div>
              )}
              <div className="relative min-w-0 flex-1 sm:flex-none">
                <Search className={`pointer-events-none absolute top-3 text-[#8E8E93] ${lang === 'ar' ? 'right-3' : 'left-3'}`} size={17} />
                <input
                  value={searchTerm}
                  onChange={event => setSearchTerm(event.target.value)}
                  placeholder={lang === 'ar' ? 'ابحث برقم الفاتورة أو الكاشير...' : 'Search invoice, note, cashier...'}
                  className={`${controlClass} w-full sm:w-[280px] ${lang === 'ar' ? 'pr-10' : 'pl-10'}`}
                />
              </div>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-[0_4px_24px_rgba(0,0,0,0.02)] sm:gap-3">
            <div className="flex items-center gap-2 text-[#1E6B48]">
              <CalendarDays size={16} />
              <span className="text-[10px] font-black uppercase tracking-wider sm:text-xs">
                {lang === 'ar' ? 'النطاق' : 'Date Range'}
              </span>
            </div>
            <input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className={`${controlClass} min-w-0 flex-1 sm:flex-none`} />
            <span className="text-[10px] font-black uppercase text-[#8E8E93] sm:text-xs">{lang === 'ar' ? 'إلى' : 'Till'}</span>
            <input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className={`${controlClass} min-w-0 flex-1 sm:flex-none`} />
            {[
              { key: 'today' as const, label: lang === 'ar' ? 'اليوم' : 'Today' },
              { key: 'week' as const, label: lang === 'ar' ? 'هذا الأسبوع' : 'This Week' },
              { key: 'month' as const, label: lang === 'ar' ? 'الشهر الحالي' : 'Current Month' },
            ].map(preset => (
              <button key={preset.key} type="button" onClick={() => applyPreset(preset.key)} className="h-10 rounded-full bg-slate-100 px-4 text-xs font-black text-[#1C1C1E] transition-all duration-200 ease-out active:scale-[0.97]">
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: lang === 'ar' ? 'إجمالي الإيراد' : 'Filtered Total Revenue', value: formatSar(metrics.gross), sub: `${metrics.count} ${lang === 'ar' ? 'فاتورة' : 'Invoices processed'}`, icon: TrendingUp, tone: 'text-[#1E6B48] bg-blue-50' },
              { label: lang === 'ar' ? 'ضريبة القيمة المضافة' : 'Filtered VAT Collected', value: formatSar(metrics.vat), sub: lang === 'ar' ? 'ضريبة المخرجات' : 'Output VAT in scope', icon: WalletCards, tone: 'text-emerald-700 bg-emerald-50' },
              { label: lang === 'ar' ? 'الاسترجاعات والتعديلات' : 'Refunds / Adjustments', value: formatSar(metrics.refunds), sub: lang === 'ar' ? 'رأس مال مرتجع' : 'Returned capital volume', icon: TrendingDown, tone: 'text-amber-700 bg-amber-50' },
            ].map(card => (
              <div key={card.label} className="rounded-2xl bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
                <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl ${card.tone}`}>
                  <card.icon size={22} />
                </div>
                <p className="text-2xl font-black tracking-tight text-[#1C1C1E]">{card.value}</p>
                <p className="mt-1 text-xs font-black uppercase tracking-wider text-[#8E8E93]">{card.label}</p>
                <p className="mt-2 text-sm font-semibold text-[#8E8E93]">{card.sub}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
          <div className="h-full overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-xl">
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-4 text-xs font-black uppercase tracking-wider text-[#8E8E93]">ID</th>
                  <th className="px-5 py-4 text-xs font-black uppercase tracking-wider text-[#8E8E93]">{t.date}</th>
                  <th className="px-5 py-4 text-xs font-black uppercase tracking-wider text-[#8E8E93]">Branch</th>
                  <th className="px-5 py-4 text-xs font-black uppercase tracking-wider text-[#8E8E93]">Method</th>
                  <th className="px-5 py-4 text-xs font-black uppercase tracking-wider text-[#8E8E93]">{t.total}</th>
                  <th className="px-5 py-4 text-end text-xs font-black uppercase tracking-wider text-[#8E8E93]">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(transaction => {
                  const branch = branches.find(item => item.id === transaction.branchId);
                  return (
                    <React.Fragment key={transaction.id}>
                      <tr className="border-b border-slate-100 transition-all duration-200 ease-out hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <button type="button" onClick={() => setExpandedId(expandedId === transaction.id ? null : transaction.id)} className="flex items-center gap-2 font-mono text-sm font-black text-[#1C1C1E] transition-all duration-200 ease-out active:scale-[0.97]">
                            {expandedId === transaction.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            {transaction.id.slice(-6)}
                          </button>
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-[#1C1C1E]">{new Date(transaction.timestamp).toLocaleString()}</td>
                        <td className="px-5 py-4 text-sm font-semibold text-[#8E8E93]">{branch ? (lang === 'ar' ? branch.nameAr : branch.nameEn) : '-'}</td>
                        <td className="px-5 py-4 text-xs font-black uppercase text-[#8E8E93]">{transaction.paymentMethod}</td>
                        <td className={`px-5 py-4 text-sm font-black ${transaction.isRefund ? 'text-red-600' : 'text-[#1C1C1E]'}`}>{formatSar(transaction.total)}</td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => onReprint(transaction)} className="icon-btn icon-btn-neutral h-9 w-9" title={t.print} aria-label={t.print}>
                              <Printer size={16} />
                            </button>
                            {!transaction.isRefund && (
                              <button onClick={() => handleRefund(transaction)} className="icon-btn icon-btn-danger h-9 w-9" title={t.refund} aria-label={t.refund}>
                                <RotateCcw size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedId === transaction.id && (
                        <tr className="bg-slate-50">
                          <td colSpan={6} className="px-5 py-4">
                            <div className="rounded-2xl bg-white p-4 shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
                              <div className="mb-3 flex items-center gap-2 text-sm font-black text-[#1C1C1E]">
                                <ReceiptText size={18} className="text-[#1E6B48]" />
                                Order Items
                              </div>
                              <div className="space-y-2">
                                {transaction.items.map((item, index) => (
                                  <div key={`${transaction.id}-${item.id}-${index}`} className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-[#1C1C1E]">
                                    <span>{item.quantity} x {lang === 'ar' ? item.nameAr : item.nameEn}</span>
                                    <span>{formatSar(item.price * item.quantity)}</span>
                                  </div>
                                ))}
                              </div>
                              {transaction.note && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">{transaction.note}</p>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-14 text-center text-sm font-bold text-[#8E8E93]">
                      {lang === 'ar' ? 'لا توجد فواتير ضمن هذا النطاق.' : 'No invoices found for this filter scope.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!refundTarget}
        title={lang === 'ar' ? 'تأكيد الاسترجاع' : 'Confirm refund'}
        message={refundTarget ? `${t.refund} ${refundTarget.id.slice(-6)}?` : ''}
        confirmLabel={lang === 'ar' ? 'استرجاع' : 'Refund'}
        cancelLabel={lang === 'ar' ? 'إلغاء' : 'Cancel'}
        danger
        onConfirm={confirmRefund}
        onCancel={() => setRefundTarget(null)}
      />
    </div>
  );
};

export default Orders;
