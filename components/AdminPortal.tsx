import React, { useMemo, useState } from 'react';
import { CreditCard, Package, ReceiptText, Store, Users, Wallet } from 'lucide-react';
import { Language, RestaurantBranch } from '../types';
import { StorageService } from '../services/storageService';

interface AdminPortalProps {
  lang: Language;
}

function copy(lang: Language, en: string, ar: string) {
  return lang === 'ar' ? ar : en;
}

function branchName(lang: Language, branches: RestaurantBranch[], branchId?: string) {
  const branch = branches.find(item => item.id === branchId);
  if (!branch) return copy(lang, 'Unassigned branch', 'فرع غير محدد');
  return copy(lang, branch.nameEn, branch.nameAr);
}

const AdminPortal: React.FC<AdminPortalProps> = ({ lang }) => {
  const branches = StorageService.getBranches();
  const [branchFilter, setBranchFilter] = useState<'all' | string>('all');

  const transactions = StorageService.getTransactions();
  const products = StorageService.getProducts();
  const customers = StorageService.getCustomers();
  const invoices = StorageService.getPurchaseInvoices();
  const expenses = StorageService.getExpenses();

  const inBranch = (branchId?: string) => branchFilter === 'all' || branchId === branchFilter;

  const filteredTransactions = useMemo(
    () => transactions.filter(transaction => inBranch(transaction.branchId)),
    [transactions, branchFilter]
  );

  // Refund transactions already store negative totals — just sum directly.
  const salesTotal = filteredTransactions.reduce((sum, transaction) => sum + transaction.total, 0);
  const lowStock = products.filter(product => Number(product.stock || 0) <= 5).length;
  const purchaseTotal = invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  const cards = [
    { label: copy(lang, 'Branches', 'الفروع'), value: branchFilter === 'all' ? branches.length : 1, icon: Store },
    { label: copy(lang, 'POS sales', 'مبيعات نقطة البيع'), value: `${salesTotal.toFixed(2)} SAR`, icon: ReceiptText },
    { label: copy(lang, 'Invoices', 'الفواتير'), value: filteredTransactions.length, icon: CreditCard },
    { label: copy(lang, 'Products', 'المنتجات'), value: products.length, icon: Package },
    { label: copy(lang, 'Customers', 'العملاء'), value: customers.length, icon: Users },
    { label: copy(lang, 'Low stock', 'مخزون منخفض'), value: lowStock, icon: Wallet },
  ];

  return (
    <div className="ios-page">
      <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ios-accent)]">
            {copy(lang, 'Admin portal', 'بوابة الإدارة')}
          </p>
          <h1 className="ios-title mt-2 text-4xl">{copy(lang, 'All branch sales', 'مبيعات كل الفروع')}</h1>
          <p className="ios-subtitle mt-3 max-w-3xl text-sm">
            {copy(lang, 'Review invoices, stock, and store performance across the baqala network.', 'راجع الفواتير والمخزون وأداء المتاجر عبر شبكة البقالة.')}
          </p>
        </div>
        <div className="ios-card-compact p-4">
          <label className="ios-label">{copy(lang, 'Branch filter', 'فلتر الفرع')}</label>
          <select value={branchFilter} onChange={event => setBranchFilter(event.target.value)} className="ios-input mt-2 min-w-[240px]">
            <option value="all">{copy(lang, 'All branches', 'كل الفروع')}</option>
            {branches.map(branch => (
              <option key={branch.id} value={branch.id}>{copy(lang, branch.nameEn, branch.nameAr)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="ios-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-2xl bg-[var(--ios-accent-soft)] p-3 text-[var(--ios-accent)]">
                  <Icon size={22} />
                </div>
              </div>
              <p className="text-2xl font-extrabold tracking-tight text-[var(--ios-text)]">{card.value}</p>
              <p className="ios-help mt-1">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="ios-card overflow-hidden">
          <div className="border-b border-[var(--ios-divider)] px-5 py-4">
            <h2 className="ios-title text-2xl">{copy(lang, 'Recent invoices', 'أحدث الفواتير')}</h2>
          </div>
          <div className="divide-y divide-[var(--ios-divider)]">
            {filteredTransactions.length === 0 && (
              <div className="p-8 text-center">
                <ReceiptText className="mx-auto mb-3 text-[var(--ios-accent)]" size={34} />
                <p className="font-bold text-[var(--ios-text)]">{copy(lang, 'No invoices in this scope.', 'لا توجد فواتير في هذا النطاق.')}</p>
              </div>
            )}
            {filteredTransactions.slice(0, 60).map(row => (
              <div key={row.id} className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-[1fr_140px_120px_120px]">
                <div>
                  <p className="font-bold text-[var(--ios-text)]">{row.id}</p>
                  <p className="ios-help">{branchName(lang, branches, row.branchId)}</p>
                </div>
                <p className="font-semibold capitalize text-[var(--ios-secondary)]">{row.paymentMethod}</p>
                <p className="font-semibold capitalize text-[var(--ios-secondary)]">{row.status}</p>
                <p className={`text-right font-extrabold ${row.isRefund ? 'text-red-600' : 'text-[var(--ios-accent)]'}`}>
                  {row.isRefund ? '−' : ''}{Math.abs(row.total).toFixed(2)} SAR
                  {row.isRefund && <span className="ml-1 text-[10px] font-bold bg-red-50 text-red-500 rounded px-1">Refund</span>}
                </p>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-6">
          <div className="ios-card p-5">
            <h2 className="ios-title text-xl">{copy(lang, 'Buying & costs', 'المشتريات والتكاليف')}</h2>
            <div className="mt-4 space-y-3">
              {[
                [copy(lang, 'Purchase invoices', 'فواتير الشراء'), invoices.length],
                [copy(lang, 'Purchase value', 'قيمة المشتريات'), `${purchaseTotal.toFixed(2)} SAR`],
                [copy(lang, 'Operating expenses', 'مصاريف التشغيل'), `${expenseTotal.toFixed(2)} SAR`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-2xl bg-[var(--ios-fill)] px-4 py-3">
                  <span className="text-sm font-semibold text-[var(--ios-secondary)]">{label}</span>
                  <span className="font-extrabold text-[var(--ios-text)]">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default AdminPortal;
