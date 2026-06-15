import React, { useMemo, useState, useEffect } from 'react';
import { Expense, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { StorageService } from '../services/storageService';
import { CalendarDays, FileText, Plus, TrendingDown, X } from 'lucide-react';
import { firstError, positiveNumber, requiredText } from '../services/validationService';
import { escapeHtml, openPrintDocument, sar } from '../services/printTemplates';
import { useToast } from './Toast';

interface ExpensesProps {
  lang: Language;
  onExpensesChange?: () => void;
}

const EXPENSE_CATEGORIES = [
  'Electricity bill',
  'Water bill',
  'Internet / phone',
  'Rent',
  'Staff salary',
  'Municipality / Baladiya',
  'Delivery / transport',
  'Maintenance',
  'Cleaning supplies',
  'Packaging / bags',
  'Bank / card machine fees',
  'ZATCA / accounting',
  'Government fees',
  'Other',
  'Custom category',
];

function localDateInput(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDateInput(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function endOfDateInput(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

const Expenses: React.FC<ExpensesProps> = ({ lang, onExpensesChange }) => {
  const t = TRANSLATIONS[lang];
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [fromDate, setFromDate] = useState(localDateInput());
  const [toDate, setToDate] = useState(localDateInput());
  const [customCategory, setCustomCategory] = useState('');
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({ category: 'Electricity bill' as any });

  useEffect(() => {
    setExpenses(StorageService.getExpenses());
  }, []);

  const fromMs = startOfDateInput(fromDate);
  const toMs = endOfDateInput(toDate);

  const filteredExpenses = useMemo(
    () => expenses.filter(expense => expense.date >= fromMs && expense.date <= toMs),
    [expenses, fromMs, toMs]
  );

  const categorySummary = useMemo(() => {
    const summary = new Map<string, { count: number; total: number }>();
    filteredExpenses.forEach(expense => {
      const key = String(expense.category || 'Other');
      const current = summary.get(key) || { count: 0, total: 0 };
      summary.set(key, { count: current.count + 1, total: current.total + expense.amount });
    });
    return Array.from(summary.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [filteredExpenses]);

  const totalExpense = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  const selectedCategory = String(newExpense.category || '');
  const resolvedCategory = selectedCategory === 'Custom category' ? customCategory.trim() : selectedCategory;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const error = firstError(
      requiredText(newExpense.description, 'Expense description'),
      requiredText(resolvedCategory, 'Expense category'),
      positiveNumber(newExpense.amount, 'Expense amount')
    );
    if (error) {
      toast(error, 'error');
      return;
    }
    const expense: Expense = {
      id: Date.now().toString(),
      description: newExpense.description!.trim(),
      amount: Number(newExpense.amount),
      category: resolvedCategory as Expense['category'],
      date: Date.now()
    };
    const updated = StorageService.addExpense(expense);
    setExpenses(updated);
    onExpensesChange?.();
    setIsAdding(false);
    setCustomCategory('');
    setNewExpense({ category: 'Electricity bill' as any });
  };

  const exportExpensePdf = () => {
    const config = StorageService.getConfig();
    const categoryRows = categorySummary.map(row => `
      <tr>
        <td>${escapeHtml(row.category)}</td>
        <td class="amount">${row.count}</td>
        <td class="amount">${sar(row.total)}</td>
      </tr>
    `).join('');
    const expenseRows = filteredExpenses.map(expense => `
      <tr>
        <td>${escapeHtml(new Date(expense.date).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US'))}</td>
        <td>${escapeHtml(expense.description)}</td>
        <td>${escapeHtml(expense.category)}</td>
        <td class="amount">${sar(expense.amount)}</td>
      </tr>
    `).join('');

    openPrintDocument({
      title: lang === 'ar' ? 'تقرير المصاريف' : 'Expense Report',
      config,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      autoPrint: true,
      body: `
        <div class="card" style="display:flex;justify-content:space-between;gap:14px;margin-bottom:14px">
          <div><span class="muted">Date range</span><br/><strong>${escapeHtml(fromDate)} - ${escapeHtml(toDate)}</strong></div>
          <div><span class="muted">Expense count</span><br/><strong>${filteredExpenses.length}</strong></div>
          <div><span class="muted">Total expense</span><br/><strong>${sar(totalExpense)}</strong></div>
        </div>
        <h3>Category summary</h3>
        <table style="margin-bottom:16px">
          <thead><tr><th>Category</th><th>Count</th><th>Total</th></tr></thead>
          <tbody>${categoryRows || '<tr><td colspan="3">No expenses in this period</td></tr>'}</tbody>
        </table>
        <h3>Expense details</h3>
        <table>
          <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th></tr></thead>
          <tbody>${expenseRows || '<tr><td colspan="4">No expenses in this period</td></tr>'}</tbody>
        </table>
      `,
      extraCss: `
        h3 { margin: 14px 0 8px; color:#0f172a; }
        .brand-logo { width: 52px; height: 52px; border-radius: 14px; padding: 5px; }
        .doc-store { text-align: end; }
      `,
    });
  };

  return (
    <div className="p-6 h-full flex flex-col bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,.10),transparent_30%),linear-gradient(180deg,#f8fafc,#eef2ff)]">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900">{t.expenses}</h2>
          <p className="text-sm text-slate-500 mt-1">Track restaurant operating costs and export professional reports.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-bold text-slate-500">
            From
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="block mt-1 border rounded-xl px-3 py-2 text-sm text-slate-900 bg-white" />
          </label>
          <label className="text-xs font-bold text-slate-500">
            Till
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="block mt-1 border rounded-xl px-3 py-2 text-sm text-slate-900 bg-white" />
          </label>
          <button onClick={exportExpensePdf} className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-bold btn-spring">
            <FileText size={17} /> Export PDF
          </button>
          <button onClick={() => setIsAdding(true)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-sm btn-spring">
            <Plus size={18} /> {t.addExpense}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 text-white p-5 shadow-xl shadow-red-500/20">
          <TrendingDown />
          <p className="text-red-100 text-xs uppercase font-black tracking-wide mt-4">Total Expense</p>
          <h3 className="text-3xl font-black">{totalExpense.toFixed(2)} SAR</h3>
        </div>
        <div className="rounded-2xl bg-white border border-white p-5 shadow-sm">
          <CalendarDays className="text-blue-600" />
          <p className="text-slate-400 text-xs uppercase font-black tracking-wide mt-4">Filtered records</p>
          <h3 className="text-3xl font-black text-slate-900">{filteredExpenses.length}</h3>
        </div>
        <div className="rounded-2xl bg-white border border-white p-5 shadow-sm">
          <FileText className="text-emerald-600" />
          <p className="text-slate-400 text-xs uppercase font-black tracking-wide mt-4">Categories</p>
          <h3 className="text-3xl font-black text-slate-900">{categorySummary.length}</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 flex-1 min-h-0">
        <div className="xl:col-span-2 bg-white rounded-2xl shadow-sm border border-white overflow-hidden flex flex-col">
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="p-4 font-bold text-slate-600">{t.date}</th>
                  <th className="p-4 font-bold text-slate-600">{t.expenseDescription}</th>
                  <th className="p-4 font-bold text-slate-600">{t.category}</th>
                  <th className="p-4 font-bold text-slate-600 text-end">{t.amount}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map(expense => (
                  <tr key={expense.id} className="hover:bg-slate-50">
                    <td className="p-4 text-sm text-slate-700">{new Date(expense.date).toLocaleDateString()}</td>
                    <td className="p-4 font-semibold text-slate-900">{expense.description}</td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 bg-slate-100 rounded-full text-xs font-bold text-slate-600">{expense.category}</span>
                    </td>
                    <td className="p-4 font-black text-red-600 text-end">-{expense.amount.toFixed(2)}</td>
                  </tr>
                ))}
                {filteredExpenses.length === 0 && (
                  <tr><td colSpan={4} className="p-10 text-center text-slate-400">No expenses in this date range</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-white p-5 overflow-y-auto">
          <h3 className="font-black text-slate-900 mb-3">Category Summary</h3>
          <div className="space-y-2">
            {categorySummary.map(row => (
              <div key={row.category} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex justify-between gap-3">
                  <span className="text-sm font-bold text-slate-700">{row.category}</span>
                  <span className="text-sm font-black text-red-600">{row.total.toFixed(2)}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">{row.count} records</p>
              </div>
            ))}
            {categorySummary.length === 0 && <p className="text-sm text-slate-400">No categories in this period.</p>}
          </div>
        </div>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-xl text-slate-900">{t.addExpense}</h3>
              <button onClick={() => setIsAdding(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-600">{t.expenseDescription}</label>
                <input required className="w-full border p-3 rounded-xl bg-white text-gray-900 mt-1" value={newExpense.description || ''} onChange={e => setNewExpense({ ...newExpense, description: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-600">{t.category}</label>
                <select className="w-full border p-3 rounded-xl bg-white text-gray-900 mt-1" value={selectedCategory} onChange={e => setNewExpense({ ...newExpense, category: e.target.value as any })}>
                  {EXPENSE_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              {selectedCategory === 'Custom category' && (
                <div>
                  <label className="text-sm font-bold text-slate-600">Custom category</label>
                  <input required className="w-full border p-3 rounded-xl bg-white text-gray-900 mt-1" value={customCategory} onChange={e => setCustomCategory(e.target.value)} placeholder="e.g. Freezer repair" />
                </div>
              )}
              <div>
                <label className="text-sm font-bold text-slate-600">{t.amount}</label>
                <input required type="number" step="0.01" className="w-full border p-3 rounded-xl bg-white text-gray-900 mt-1" value={newExpense.amount || ''} onChange={e => setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) })} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsAdding(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-800 rounded-xl font-bold">{t.cancel}</button>
                <button type="submit" className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black btn-spring">{t.save}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
