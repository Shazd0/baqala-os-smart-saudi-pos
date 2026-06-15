import React, { useMemo, useState } from 'react';
import { Activity, ChefHat, CreditCard, Database, MapPin, ReceiptText, Store } from 'lucide-react';
import { Language, RestaurantBranch, RestaurantOrder, Transaction } from '../types';
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

  const orders = StorageService.getRestaurantOrders();
  const transactions = StorageService.getTransactions();
  const kitchenTickets = StorageService.getKitchenTickets();
  const tables = StorageService.getTables();
  const menuItems = StorageService.getMenuItems();
  const ingredients = StorageService.getIngredients();
  const deliveryChannels = StorageService.getDeliveryChannels();
  const promotions = StorageService.getPromotions();
  const serviceCharges = StorageService.getServiceChargeConfigs();

  const inBranch = (branchId?: string) => branchFilter === 'all' || branchId === branchFilter;
  const menuInBranch = (branchIds?: string[]) => branchFilter === 'all' || !branchIds?.length || branchIds.includes(branchFilter);

  const filteredOrders = useMemo(() => orders.filter(order => inBranch(order.branchId)), [orders, branchFilter]);
  const filteredTransactions = useMemo(() => transactions.filter(transaction => inBranch(transaction.branchId)), [transactions, branchFilter]);
  const filteredTickets = useMemo(() => kitchenTickets.filter(ticket => inBranch(ticket.branchId)), [kitchenTickets, branchFilter]);
  const filteredTables = useMemo(() => tables.filter(table => inBranch(table.branchId)), [tables, branchFilter]);
  const filteredMenuItems = useMemo(() => menuItems.filter(item => menuInBranch(item.branchIds)), [menuItems, branchFilter]);
  const filteredIngredients = useMemo(() => ingredients.filter(item => inBranch(item.branchId)), [ingredients, branchFilter]);
  const filteredDelivery = useMemo(() => deliveryChannels.filter(item => inBranch(item.branchId)), [deliveryChannels, branchFilter]);
  const filteredServiceCharges = useMemo(() => serviceCharges.filter(item => inBranch(item.branchId)), [serviceCharges, branchFilter]);
  const filteredPromotions = useMemo(() => promotions.filter(item => branchFilter === 'all' || item.branchIds.includes(branchFilter)), [promotions, branchFilter]);

  const orderRevenue = filteredOrders.reduce((sum, order) => sum + order.total, 0);
  const transactionRevenue = filteredTransactions.reduce((sum, transaction) => sum + (transaction.isRefund ? -transaction.total : transaction.total), 0);

  const recentFinancialRows = [
    ...filteredTransactions.map(transaction => ({
      id: transaction.id,
      branchId: transaction.branchId,
      label: transaction.id,
      source: copy(lang, 'POS Invoice', 'فاتورة نقطة البيع'),
      total: transaction.isRefund ? -transaction.total : transaction.total,
      status: transaction.status,
      timestamp: transaction.timestamp,
      paymentMethod: transaction.paymentMethod,
    })),
    ...filteredOrders.map(order => ({
      id: order.id,
      branchId: order.branchId,
      label: order.orderNumber || order.id,
      source: copy(lang, 'Restaurant Order', 'طلب مطعم'),
      total: order.total,
      status: order.status,
      timestamp: order.createdAt,
      paymentMethod: order.paymentMethod || copy(lang, 'Not paid', 'غير مدفوع'),
    })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  const cards = [
    { label: copy(lang, 'Branches', 'الفروع'), value: branchFilter === 'all' ? branches.length : 1, icon: Store },
    { label: copy(lang, 'Restaurant revenue', 'إيراد المطعم'), value: `${orderRevenue.toFixed(2)} SAR`, icon: ReceiptText },
    { label: copy(lang, 'POS transactions', 'معاملات نقطة البيع'), value: filteredTransactions.length, icon: CreditCard },
    { label: copy(lang, 'Active KDS tickets', 'تذاكر المطبخ النشطة'), value: filteredTickets.filter(ticket => ticket.status !== 'served' && ticket.status !== 'voided').length, icon: ChefHat },
    { label: copy(lang, 'Tables', 'الطاولات'), value: filteredTables.length, icon: MapPin },
    { label: copy(lang, 'Menu items', 'أصناف القائمة'), value: filteredMenuItems.length, icon: Database },
    { label: copy(lang, 'Stock ingredients', 'مكونات المخزون'), value: filteredIngredients.length, icon: Activity },
  ];

  return (
    <div className="ios-page">
      <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ios-accent)]">
            {copy(lang, 'Enterprise admin portal', 'بوابة الإدارة المؤسسية')}
          </p>
          <h1 className="ios-title mt-2 text-4xl">{copy(lang, 'All Branch Operations', 'عمليات كل الفروع')}</h1>
          <p className="ios-subtitle mt-3 max-w-3xl text-sm">
            {copy(lang, 'View every branch, transaction, restaurant order, kitchen ticket, menu item, stock record, and operations module from one admin-only command center.', 'اعرض كل الفروع والمعاملات وطلبات المطعم وتذاكر المطبخ وأصناف القائمة والمخزون والوحدات التشغيلية من مركز تحكم مخصص للمدير فقط.')}
          </p>
        </div>
        <div className="ios-card-compact p-4">
          <label className="ios-label">{copy(lang, 'Branch filter', 'فلتر الفرع')}</label>
          <select value={branchFilter} onChange={event => setBranchFilter(event.target.value)} className="ios-input mt-2 min-w-[240px]">
            <option value="all">{copy(lang, 'All restaurants and branches', 'كل المطاعم والفروع')}</option>
            {branches.map(branch => (
              <option key={branch.id} value={branch.id}>{copy(lang, branch.nameEn, branch.nameAr)}</option>
            ))}
          </select>
          <p className="ios-help mt-2">{copy(lang, 'Admins can inspect one branch or the complete restaurant group.', 'يمكن للمدير مراجعة فرع واحد أو المجموعة كاملة.')}</p>
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="ios-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-2xl bg-[var(--ios-accent-soft)] p-3 text-[var(--ios-accent)]">
                  <Icon size={22} />
                </div>
                <span className="ios-badge">{copy(lang, 'Live', 'مباشر')}</span>
              </div>
              <p className="text-2xl font-black tracking-tight text-[var(--ios-text)]">{card.value}</p>
              <p className="ios-help mt-1">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <section className="ios-card overflow-hidden">
          <div className="border-b ios-divider px-5 py-4">
            <h2 className="ios-title text-2xl">{copy(lang, 'All Restaurant Transactions', 'كل معاملات المطاعم')}</h2>
            <p className="ios-help mt-1">{copy(lang, 'Includes POS invoices and restaurant orders across the selected branch scope.', 'تشمل فواتير نقطة البيع وطلبات المطعم ضمن نطاق الفرع المحدد.')}</p>
          </div>
          <div className="divide-y divide-[var(--ios-divider)]">
            {recentFinancialRows.length === 0 && (
              <div className="p-8 text-center">
                <ReceiptText className="mx-auto mb-3 text-[var(--ios-accent)]" size={34} />
                <p className="font-black text-[var(--ios-text)]">{copy(lang, 'No transactions in this scope.', 'لا توجد معاملات في هذا النطاق.')}</p>
                <p className="ios-help mt-1">{copy(lang, 'Transactions will appear here as branches sell or close restaurant orders.', 'ستظهر المعاملات هنا عند البيع أو إغلاق طلبات المطعم.')}</p>
              </div>
            )}
            {recentFinancialRows.slice(0, 60).map(row => (
              <div key={`${row.source}-${row.id}`} className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-[1fr_160px_130px_120px]">
                <div>
                  <p className="font-black text-[var(--ios-text)]">{row.label}</p>
                  <p className="ios-help">{row.source} / {branchName(lang, branches, row.branchId)}</p>
                </div>
                <p className="font-bold capitalize text-[var(--ios-secondary)]">{row.paymentMethod}</p>
                <p className="font-bold capitalize text-[var(--ios-secondary)]">{row.status}</p>
                <p className="text-right font-black text-[var(--ios-accent)]">{row.total.toFixed(2)} SAR</p>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-6">
          <div className="ios-card p-5">
            <h2 className="ios-title text-xl">{copy(lang, 'Branch Data Inventory', 'مخزون بيانات الفرع')}</h2>
            <div className="mt-4 space-y-3">
              {[
                [copy(lang, 'Delivery channels', 'قنوات التوصيل'), filteredDelivery.length],
                [copy(lang, 'Promotions', 'العروض'), filteredPromotions.length],
                [copy(lang, 'Service charge configs', 'إعدادات رسوم الخدمة'), filteredServiceCharges.length],
                [copy(lang, 'Ready kitchen tickets', 'تذاكر مطبخ جاهزة'), filteredTickets.filter(ticket => ticket.status === 'ready').length],
                [copy(lang, 'Open restaurant orders', 'طلبات مطعم مفتوحة'), filteredOrders.filter(order => order.status !== 'paid' && order.status !== 'cancelled').length],
                [copy(lang, 'Combined sales value', 'قيمة المبيعات الإجمالية'), `${(orderRevenue + transactionRevenue).toFixed(2)} SAR`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-2xl bg-[#F5F5F7] px-4 py-3">
                  <span className="text-sm font-semibold text-[var(--ios-secondary)]">{label}</span>
                  <span className="font-black text-[var(--ios-text)]">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ios-card p-5">
            <h2 className="ios-title text-xl">{copy(lang, 'Branch Access Model', 'نموذج صلاحيات الفروع')}</h2>
            <p className="ios-help mt-2">
              {copy(lang, 'Administrators can view all branches here. Staff screens remain scoped to their assigned branch through the active branch guard.', 'يمكن للمديرين عرض كل الفروع هنا. تبقى شاشات الموظفين محددة بالفروع المعينة لهم عبر حارس الفرع النشط.')}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default AdminPortal;
