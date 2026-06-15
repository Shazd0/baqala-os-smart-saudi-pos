/**
 * دفتر الدين — Credit Book
 * The most unique feature for Saudi baqala owners: track customer credit tabs.
 * Every neighbourhood baqala has customers who "run a tab". This replaces the
 * physical notebook with a digital, searchable, printable ledger.
 */

import React, { useMemo, useState } from 'react';
import {
  AlertCircle, BookOpen, CheckCircle2, ChevronRight, Loader2,
  MessageCircle, Plus, Search, Trash2, UserPlus, X, Banknote, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';
import { Language } from '../types';
import { CreditEntry, CreditTransaction } from '../types';
import { StorageService } from '../services/storageService';
import { useToast } from './Toast';
import { firstError, nonNegativeNumber, optionalSaudiPhone, positiveNumber, requiredText } from '../services/validationService';
import ConfirmDialog from './ConfirmDialog';

interface Props { lang: Language }

const fmt = (n: number) => `${n.toFixed(2)} ر.س`;

const CreditBook: React.FC<Props> = ({ lang }) => {
  const { toast } = useToast();
  const ar = lang === 'ar';

  const [entries, setEntries] = useState<CreditEntry[]>(() => StorageService.getCreditEntries());
  const [allTxs, setAllTxs] = useState<CreditTransaction[]>(() => StorageService.getCreditTransactions());

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showAddTx, setShowAddTx] = useState<'debt' | 'payment' | null>(null);
  const [txAmount, setTxAmount] = useState('');
  const [txNote, setTxNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const canDelete = StorageService.hasPermission('manage_settings');

  const [newEntry, setNewEntry] = useState({ name: '', phone: '', limit: '' });

  const refreshCreditData = () => {
    setEntries(StorageService.getCreditEntries());
    setAllTxs(StorageService.getCreditTransactions());
  };

  const filtered = useMemo(() =>
    entries.filter(e => e.customerName.toLowerCase().includes(search.toLowerCase()) || (e.customerPhone || '').includes(search)),
    [entries, search]
  );

  const selected = entries.find(e => e.id === selectedId) ?? null;
  const selectedTxs = useMemo(() =>
    allTxs.filter(t => t.creditEntryId === selectedId).sort((a, b) => b.createdAt - a.createdAt),
    [allTxs, selectedId]
  );

  const totalOutstanding = entries.reduce((s, e) => s + Math.max(0, e.totalDebt), 0);

  const handleAddEntry = () => {
    const error = firstError(
      requiredText(newEntry.name, 'Customer name'),
      requiredText(newEntry.phone, 'Phone'),
      optionalSaudiPhone(newEntry.phone),
      newEntry.limit ? nonNegativeNumber(newEntry.limit, 'Credit limit') : ''
    );
    if (error) { toast(ar ? `تحقق من البيانات: ${error}` : error, 'error'); return; }
    const entry: CreditEntry = {
      id: `CE-${Date.now()}`,
      customerName: newEntry.name.trim(),
      customerPhone: newEntry.phone.trim() || undefined,
      totalDebt: 0,
      creditLimit: newEntry.limit ? parseFloat(newEntry.limit) : undefined,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    const saved = StorageService.saveCreditEntry(entry);
    refreshCreditData();
    setShowAddEntry(false);
    setNewEntry({ name: '', phone: '', limit: '' });
    setSelectedId(saved.id);
    toast(ar ? `✓ تمت إضافة ${entry.customerName}` : `✓ ${entry.customerName} added`, 'success');
  };

  const handleAddTx = () => {
    if (!showAddTx || !selected) return;
    const amount = parseFloat(txAmount);
    const error = positiveNumber(amount, 'Amount');
    if (error) { toast(ar ? 'أدخل مبلغاً صحيحاً' : error, 'error'); return; }
    setSaving(true);
    StorageService.addCreditTransaction({
      creditEntryId: selected.id,
      type: showAddTx,
      amount,
      note: txNote.trim() || undefined,
    });
    refreshCreditData();
    setShowAddTx(null);
    setTxAmount('');
    setTxNote('');
    setSaving(false);
    if (showAddTx === 'debt') {
      toast(ar ? `➕ دين ${fmt(amount)} لـ ${selected.customerName}` : `➕ Debt ${fmt(amount)} added`, 'warning');
    } else {
      toast(ar ? `✓ استلام ${fmt(amount)} من ${selected.customerName}` : `✓ Payment ${fmt(amount)} recorded`, 'success');
    }
  };

  const handleDelete = (id: string) => {
    if (!canDelete) { toast(ar ? 'الحذف مسموح للمدير فقط' : 'Only administrator can delete.', 'error'); return; }
    StorageService.deleteCreditEntry(id);
    setEntries(prev => prev.filter(x => x.id !== id));
    setAllTxs(prev => prev.filter(t => t.creditEntryId !== id));
    if (selectedId === id) setSelectedId(null);
    setDeleteId(null);
    toast(ar ? 'تم حذف الحساب' : 'Account deleted', 'warning');
  };

  const sendWhatsApp = (entry: CreditEntry) => {
    if (!entry.customerPhone) { toast(ar ? 'لا يوجد رقم هاتف' : 'No phone number', 'warning'); return; }
    const msg = ar
      ? `السلام عليكم ${entry.customerName}،\nرصيد دينك لدى متجرنا: *${fmt(entry.totalDebt)}*\nشكراً لتعاملك معنا.`
      : `Hello ${entry.customerName},\nYour outstanding balance at our store is: *${fmt(entry.totalDebt)}*\nThank you for your business.`;
    const phone = entry.customerPhone.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden">

      {/* ── Left: Customer list ── */}
      <div className="w-80 flex-shrink-0 bg-white border-r border-slate-100 flex flex-col h-full">

        {/* Header */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="bg-emerald-100 p-2 rounded-xl">
                <BookOpen size={18} className="text-emerald-700" />
              </div>
              <div>
                <h2 className="font-black text-slate-800 text-sm">{ar ? 'دفتر الدين' : 'Credit Book'}</h2>
                <p className="text-xs text-slate-400">{ar ? 'متابعة ديون العملاء' : 'Customer tab tracker'}</p>
              </div>
            </div>
            <button
              onClick={() => setShowAddEntry(true)}
              className="bg-emerald-600 text-white p-2 rounded-xl btn-spring shadow-md shadow-emerald-600/25"
            >
              <UserPlus size={16} />
            </button>
          </div>

          {/* Total outstanding */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex justify-between items-center">
            <span className="text-xs text-amber-700 font-medium">{ar ? 'إجمالي الديون' : 'Total Outstanding'}</span>
            <span className="font-black text-amber-800">{fmt(totalOutstanding)}</span>
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={ar ? 'بحث...' : 'Search...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pe-9 ps-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              dir={ar ? 'rtl' : 'ltr'}
            />
          </div>
        </div>

        {/* Customer list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <BookOpen size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{ar ? 'لا توجد حسابات بعد' : 'No accounts yet'}</p>
            </div>
          )}
          {filtered.map(entry => {
            const overLimit = entry.creditLimit && entry.totalDebt > entry.creditLimit;
            return (
              <button
                key={entry.id}
                onClick={() => setSelectedId(entry.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-slate-50 text-start transition-colors ${selectedId === entry.id ? 'bg-emerald-50 border-l-2 border-l-emerald-500' : 'hover:bg-slate-50'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${entry.totalDebt > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {entry.customerName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="font-semibold text-slate-800 text-sm truncate">{entry.customerName}</p>
                    {overLimit && <AlertCircle size={12} className="text-red-500 flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-slate-400">{entry.customerPhone || (ar ? 'لا يوجد رقم' : 'No phone')}</p>
                </div>
                <div className="text-end flex-shrink-0">
                  <p className={`font-black text-sm ${entry.totalDebt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {fmt(Math.abs(entry.totalDebt))}
                  </p>
                  <p className="text-[10px] text-slate-400">{entry.totalDebt > 0 ? (ar ? 'مديون' : 'owes') : (ar ? 'نظيف' : 'clear')}</p>
                </div>
                <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right: Account detail ── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-3">
            <BookOpen size={64} className="opacity-20" />
            <p className="text-lg font-semibold">{ar ? 'اختر عميلاً' : 'Select a customer'}</p>
            <p className="text-sm opacity-60">{ar ? 'أو أضف حساباً جديداً' : 'or add a new account'}</p>
          </div>
        ) : (
          <>
            {/* Account header */}
            <div className="bg-white border-b border-slate-100 px-6 py-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl ${selected.totalDebt > 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {selected.customerName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800">{selected.customerName}</h3>
                    <p className="text-slate-400 text-sm">{selected.customerPhone || (ar ? 'لا يوجد رقم' : 'No phone')}</p>
                    {selected.creditLimit && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {ar ? `حد الائتمان: ${fmt(selected.creditLimit)}` : `Credit limit: ${fmt(selected.creditLimit)}`}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  {selected.customerPhone && (
                    <button
                      onClick={() => sendWhatsApp(selected)}
                      className="flex items-center gap-2 px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-semibold btn-spring shadow-md shadow-green-500/30"
                    >
                      <MessageCircle size={16} />
                      WhatsApp
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => setDeleteId(selected.id)}
                      className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Balance + actions */}
              <div className="flex items-center gap-3 mt-4">
                <div className={`flex-1 rounded-2xl p-4 ${selected.totalDebt > 0 ? 'bg-rose-50 border border-rose-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                  <p className="text-xs font-medium text-slate-500 mb-1">{ar ? 'الرصيد الحالي' : 'Current Balance'}</p>
                  <p className={`text-3xl font-black ${selected.totalDebt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {fmt(Math.abs(selected.totalDebt))}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {selected.totalDebt > 0 ? (ar ? 'مبلغ مستحق على العميل' : 'Amount owed by customer') : (ar ? 'لا يوجد دين' : 'No outstanding debt')}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setShowAddTx('debt')}
                    className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold text-sm btn-spring shadow-md shadow-rose-500/25"
                  >
                    <ArrowUpRight size={16} /> {ar ? 'إضافة دين' : 'Add Debt'}
                  </button>
                  <button
                    onClick={() => setShowAddTx('payment')}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm btn-spring shadow-md shadow-emerald-500/25"
                  >
                    <ArrowDownLeft size={16} /> {ar ? 'تسجيل دفعة' : 'Record Payment'}
                  </button>
                </div>
              </div>
            </div>

            {/* Transactions list */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
              <h4 className="font-bold text-slate-700 text-sm mb-3">{ar ? 'سجل المعاملات' : 'Transaction History'}</h4>
              {selectedTxs.length === 0 && (
                <div className="text-center py-12 text-slate-300">
                  <Banknote size={40} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{ar ? 'لا توجد معاملات بعد' : 'No transactions yet'}</p>
                </div>
              )}
              {selectedTxs.map(tx => (
                <div key={tx.id} className={`flex items-center gap-4 p-3 rounded-xl border ${tx.type === 'debt' ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${tx.type === 'debt' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {tx.type === 'debt' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm">
                      {tx.type === 'debt' ? (ar ? 'دين مضاف' : 'Debt added') : (ar ? 'دفعة مستلمة' : 'Payment received')}
                    </p>
                    {tx.note && <p className="text-xs text-slate-500 truncate">{tx.note}</p>}
                    <p className="text-xs text-slate-400">{new Date(tx.createdAt).toLocaleString(ar ? 'ar-SA' : 'en-US')}</p>
                  </div>
                  <p className={`font-black text-base flex-shrink-0 ${tx.type === 'debt' ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {tx.type === 'debt' ? '+' : '-'}{fmt(tx.amount)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Add Customer Modal ── */}
      {showAddEntry && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-black text-slate-800">{ar ? 'إضافة عميل جديد' : 'Add New Customer'}</h3>
              <button onClick={() => setShowAddEntry(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">{ar ? 'الاسم *' : 'Name *'}</label>
                <input type="text" value={newEntry.name} onChange={e => setNewEntry(p => ({ ...p, name: e.target.value }))}
                  placeholder={ar ? 'اسم العميل' : "Customer's name"}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 focus:border-emerald-500 focus:outline-none text-slate-900" dir={ar ? 'rtl' : 'ltr'} />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">{ar ? 'رقم الجوال' : 'Phone'}</label>
                <input type="tel" value={newEntry.phone} onChange={e => setNewEntry(p => ({ ...p, phone: e.target.value }))}
                  placeholder="05XXXXXXXX"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 focus:border-emerald-500 focus:outline-none text-slate-900" dir="ltr" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">{ar ? 'حد الائتمان (اختياري)' : 'Credit Limit (optional)'}</label>
                <input type="number" value={newEntry.limit} onChange={e => setNewEntry(p => ({ ...p, limit: e.target.value }))}
                  placeholder="e.g. 200"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 focus:border-emerald-500 focus:outline-none text-slate-900" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddEntry(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50">
                {ar ? 'إلغاء' : 'Cancel'}
              </button>
              <button onClick={handleAddEntry} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold btn-spring shadow-md shadow-emerald-500/25 flex items-center justify-center gap-2">
                <Plus size={16} /> {ar ? 'إضافة' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Transaction Modal ── */}
      {showAddTx && selected && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-black text-slate-800">
                {showAddTx === 'debt'
                  ? (ar ? 'إضافة دين' : 'Add Debt')
                  : (ar ? 'تسجيل دفعة' : 'Record Payment')}
              </h3>
              <button onClick={() => setShowAddTx(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <p className="text-slate-500 text-sm mb-5">{ar ? 'للعميل' : 'Customer'}: <strong>{selected.customerName}</strong></p>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">{ar ? 'المبلغ (ر.س) *' : 'Amount (SAR) *'}</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={txAmount}
                  onChange={e => setTxAmount(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:border-emerald-500 focus:outline-none text-slate-900 text-2xl font-black text-center"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">{ar ? 'ملاحظة (اختياري)' : 'Note (optional)'}</label>
                <input
                  type="text"
                  value={txNote}
                  onChange={e => setTxNote(e.target.value)}
                  placeholder={ar ? 'مثال: بقالة، سيجارة...' : 'e.g. groceries, cigarettes...'}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 focus:border-emerald-500 focus:outline-none text-slate-900"
                  dir={ar ? 'rtl' : 'ltr'}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddTx(null)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50">
                {ar ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleAddTx}
                disabled={saving}
                className={`flex-1 py-2.5 text-white rounded-xl text-sm font-bold btn-spring shadow-md flex items-center justify-center gap-2 ${showAddTx === 'debt' ? 'bg-rose-600 shadow-rose-500/25' : 'bg-emerald-600 shadow-emerald-500/25'}`}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {showAddTx === 'debt' ? (ar ? 'إضافة دين' : 'Add Debt') : (ar ? 'تسجيل دفعة' : 'Record Payment')}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!deleteId}
        title={ar ? 'حذف حساب الدين؟' : 'Delete credit account?'}
        message={ar ? `سيتم حذف الحساب وسجل المعاملات المرتبط به. هل تريد المتابعة؟` : 'This credit account and its transaction history will be deleted. Continue?'}
        confirmLabel={ar ? 'حذف' : 'Delete'}
        cancelLabel={ar ? 'إلغاء' : 'Cancel'}
        danger
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
};

export default CreditBook;
