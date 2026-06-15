import React, { useMemo, useState } from 'react';
import { CalendarDays, Download, Filter, PackageCheck, ReceiptText, RefreshCw, SaudiRiyal, ShoppingBag, Truck } from 'lucide-react';
import { ExternalDeliveryOrder, Language, RestaurantBranch, RestaurantOrder } from '../types';
import { StorageService } from '../services/storageService';
import { escapeHtml, openPrintDocument } from '../services/printTemplates';
import { useToast } from './Toast';

interface HungerStationReportProps {
  lang: Language;
}

type StatusFilter = 'all' | ExternalDeliveryOrder['status'] | RestaurantOrder['status'];

interface HungerStationRow {
  id: string;
  branchId?: string;
  externalOrderId: string;
  orderNumber: string;
  customer: string;
  phone: string;
  status: string;
  source: 'external' | 'restaurant';
  itemCount: number;
  subtotal: number;
  vat: number;
  total: number;
  createdAt: number;
  importedRestaurantOrderId?: string;
}

function copy(lang: Language, en: string, ar: string) {
  return lang === 'ar' ? ar : en;
}

function todayInput(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function startOfDate(value: string) {
  return new Date(`${value}T00:00:00`).getTime();
}

function endOfDate(value: string) {
  return new Date(`${value}T23:59:59.999`).getTime();
}

function branchName(lang: Language, branches: RestaurantBranch[], branchId?: string) {
  const branch = branches.find(item => item.id === branchId);
  if (!branch) return copy(lang, 'Unassigned branch', 'فرع غير محدد');
  return copy(lang, branch.nameEn, branch.nameAr);
}

function parseCustomer(note?: string) {
  const parts = String(note || '').split('/').map(item => item.trim());
  const customer = parts.find(item => item.toLowerCase().startsWith('customer:'))?.replace(/^customer:\s*/i, '');
  const mobile = parts.find(item => item.toLowerCase().startsWith('mobile:'))?.replace(/^mobile:\s*/i, '');
  return { customer: customer || 'HungerStation Guest', mobile: mobile || '' };
}

const HungerStationReport: React.FC<HungerStationReportProps> = ({ lang }) => {
  const { toast } = useToast();
  const branches = StorageService.getBranches();
  const [ordersVersion, setOrdersVersion] = useState(0);
  const [branchFilter, setBranchFilter] = useState<'all' | string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [fromDate, setFromDate] = useState(todayInput(-7));
  const [toDate, setToDate] = useState(todayInput());

  const externalOrders = useMemo(() => StorageService.getExternalDeliveryOrders(), [ordersVersion]);
  const restaurantOrders = useMemo(() => StorageService.getRestaurantOrders(), [ordersVersion]);
  const config = StorageService.getConfig();

  const rows = useMemo<HungerStationRow[]>(() => {
    const importedIds = new Set(externalOrders.map(order => order.importedRestaurantOrderId).filter(Boolean));
    const externalRows = externalOrders
      .filter(order => order.provider === 'hungerstation')
      .map(order => ({
        id: `external-${order.id}`,
        branchId: order.branchId,
        externalOrderId: order.externalOrderId,
        orderNumber: order.importedRestaurantOrderId || 'Not imported',
        customer: order.customerName || 'HungerStation Guest',
        phone: order.customerPhone || '',
        status: order.status,
        source: 'external' as const,
        itemCount: order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        subtotal: order.subtotal,
        vat: order.vat,
        total: order.total,
        createdAt: order.createdAt,
        importedRestaurantOrderId: order.importedRestaurantOrderId,
      }));

    const restaurantRows = restaurantOrders
      .filter(order => order.channel === 'hungerstation' || order.externalProvider === 'hungerstation')
      .filter(order => !importedIds.has(order.id))
      .map(order => {
        const customer = parseCustomer(order.note);
        return {
          id: `restaurant-${order.id}`,
          branchId: order.branchId,
          externalOrderId: order.externalOrderId || order.id,
          orderNumber: order.orderNumber || order.id,
          customer: customer.customer,
          phone: customer.mobile,
          status: order.status,
          source: 'restaurant' as const,
          itemCount: order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
          subtotal: order.subtotal,
          vat: order.vat,
          total: order.total,
          createdAt: order.createdAt,
          importedRestaurantOrderId: order.id,
        };
      });

    return [...externalRows, ...restaurantRows].sort((a, b) => b.createdAt - a.createdAt);
  }, [externalOrders, restaurantOrders]);

  const filteredRows = useMemo(() => {
    const fromMs = startOfDate(fromDate);
    const toMs = endOfDate(toDate);
    return rows
      .filter(row => row.createdAt >= fromMs && row.createdAt <= toMs)
      .filter(row => branchFilter === 'all' || row.branchId === branchFilter)
      .filter(row => statusFilter === 'all' || row.status === statusFilter);
  }, [rows, fromDate, toDate, branchFilter, statusFilter]);

  const importedCount = filteredRows.filter(row => row.importedRestaurantOrderId).length;
  const rejectedCount = filteredRows.filter(row => row.status === 'rejected' || row.status === 'cancelled').length;
  const totalAmount = filteredRows.reduce((sum, row) => sum + row.total, 0);
  const vatAmount = filteredRows.reduce((sum, row) => sum + row.vat, 0);
  const averageOrder = filteredRows.length ? totalAmount / filteredRows.length : 0;
  const activeStatuses = Array.from(new Set(rows.map(row => row.status))).sort();

  const refresh = () => {
    setOrdersVersion(version => version + 1);
    toast(copy(lang, 'HungerStation report refreshed.', 'تم تحديث تقرير هنقرستيشن.'), 'success');
  };

  const exportPdf = () => {
    const period = `${fromDate} to ${toDate}`;
    const tableRows = filteredRows.map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td dir="ltr">${escapeHtml(row.externalOrderId)}</td>
        <td dir="ltr">${escapeHtml(row.orderNumber)}</td>
        <td>${escapeHtml(branchName(lang, branches, row.branchId))}</td>
        <td>${escapeHtml(row.customer)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td class="amount">${row.itemCount}</td>
        <td class="amount">${row.subtotal.toFixed(2)}</td>
        <td class="amount">${row.vat.toFixed(2)}</td>
        <td class="amount total">${row.total.toFixed(2)}</td>
      </tr>
    `).join('');

    openPrintDocument({
      title: 'HungerStation Report',
      config,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      width: 1100,
      height: 820,
      autoPrint: false,
      body: `
        <div class="report-title">
          <p class="eyebrow">HungerStation Orders Report</p>
          <h2>${escapeHtml(copy(lang, 'HungerStation Transactions and Orders', 'معاملات وطلبات هنقرستيشن'))}</h2>
          <p class="muted">${escapeHtml(period)} / ${escapeHtml(branchFilter === 'all' ? copy(lang, 'All branches', 'كل الفروع') : branchName(lang, branches, branchFilter))}</p>
        </div>
        <div class="kpis">
          <div class="kpi"><span>${escapeHtml(copy(lang, 'Orders', 'الطلبات'))}</span><strong>${filteredRows.length}</strong></div>
          <div class="kpi"><span>${escapeHtml(copy(lang, 'Imported to KDS', 'مستوردة للمطبخ'))}</span><strong>${importedCount}</strong></div>
          <div class="kpi"><span>${escapeHtml(copy(lang, 'Amount', 'المبلغ'))}</span><strong>${totalAmount.toFixed(2)} SAR</strong></div>
          <div class="kpi"><span>${escapeHtml(copy(lang, 'VAT', 'الضريبة'))}</span><strong>${vatAmount.toFixed(2)} SAR</strong></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>External ID</th>
              <th>POS Order</th>
              <th>Branch</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Items</th>
              <th>Subtotal</th>
              <th>VAT</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || `<tr><td colspan="10" style="text-align:center;color:#64748b;padding:24px;">${escapeHtml(copy(lang, 'No HungerStation orders in this filter.', 'لا توجد طلبات هنقرستيشن ضمن هذا الفلتر.'))}</td></tr>`}
          </tbody>
        </table>
      `,
      extraCss: `
        .report-title { margin-bottom: 18px; }
        .eyebrow { margin:0 0 5px; color:#059669; font-size:10px; font-weight:900; letter-spacing:.16em; text-transform:uppercase; }
        .report-title h2 { margin:0; font-size:24px; font-weight:900; }
        .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:18px 0; }
        .kpi { border:1px solid #d1fae5; border-radius:18px; padding:14px; background:linear-gradient(135deg,#f8fafc,#ecfdf5); }
        .kpi span { color:#64748b; font-size:10px; font-weight:800; display:block; margin-bottom:5px; }
        .kpi strong { direction:ltr; font-size:18px; color:#064e3b; font-weight:900; }
        th { font-size:10px; }
        td { font-size:10px; }
        .total { color:#059669; font-weight:900; }
      `,
    });
  };

  const kpiCards = [
    { label: copy(lang, 'No. of orders', 'عدد الطلبات'), value: filteredRows.length, icon: ShoppingBag, tone: 'bg-[#EAF8EF] text-[#34C759]' },
    { label: copy(lang, 'Total amount', 'إجمالي المبلغ'), value: `${totalAmount.toFixed(2)} SAR`, icon: SaudiRiyal, tone: 'bg-[var(--ios-accent-soft)] text-[var(--ios-accent)]' },
    { label: copy(lang, 'Average order', 'متوسط الطلب'), value: `${averageOrder.toFixed(2)} SAR`, icon: ReceiptText, tone: 'bg-[#F2F2F7] text-[var(--ios-text)]' },
    { label: copy(lang, 'Rejected / Cancelled', 'مرفوض / ملغي'), value: rejectedCount, icon: PackageCheck, tone: 'bg-[#FFECEA] text-[#FF3B30]' },
  ];

  return (
    <div className="ios-page">
      <div className="mb-8 overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#111827] via-[#14532D] to-[#16A34A] p-6 text-white shadow-[0_18px_60px_rgba(20,83,45,0.24)]">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">Live Delivery Channel</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">{copy(lang, 'HungerStation Report', 'تقرير هنقرستيشن')}</h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold text-white/75">
              {copy(lang, 'Track HungerStation orders, imported kitchen tickets, status flow, revenue, VAT, and branch performance from one dedicated tab.', 'تابع طلبات هنقرستيشن وتذاكر المطبخ المستوردة وحالة الطلب والإيرادات والضريبة وأداء الفروع من تبويب واحد.')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={refresh} className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-3 text-sm font-black text-white backdrop-blur transition hover:bg-white/25">
              <RefreshCw size={17} /> {copy(lang, 'Refresh', 'تحديث')}
            </button>
            <button onClick={exportPdf} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#14532D] shadow-lg shadow-black/10">
              <Download size={17} /> {copy(lang, 'Export PDF', 'تصدير PDF')}
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        {kpiCards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="ios-card p-5">
              <div className={`mb-4 inline-flex rounded-2xl p-3 ${card.tone}`}>
                <Icon size={22} />
              </div>
              <p className="text-2xl font-black tracking-tight text-[var(--ios-text)]">{card.value}</p>
              <p className="ios-help mt-1">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="ios-card mb-6 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Filter className="text-[var(--ios-accent)]" size={20} />
          <h2 className="ios-title text-xl">{copy(lang, 'Filters', 'الفلاتر')}</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="ios-field">
            <label className="ios-label">{copy(lang, 'From date', 'من تاريخ')}</label>
            <input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className="ios-input" />
          </div>
          <div className="ios-field">
            <label className="ios-label">{copy(lang, 'To date', 'إلى تاريخ')}</label>
            <input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className="ios-input" />
          </div>
          <div className="ios-field">
            <label className="ios-label">{copy(lang, 'Branch', 'الفرع')}</label>
            <select value={branchFilter} onChange={event => setBranchFilter(event.target.value)} className="ios-input">
              <option value="all">{copy(lang, 'All branches', 'كل الفروع')}</option>
              {branches.map(branch => <option key={branch.id} value={branch.id}>{copy(lang, branch.nameEn, branch.nameAr)}</option>)}
            </select>
          </div>
          <div className="ios-field">
            <label className="ios-label">{copy(lang, 'Status', 'الحالة')}</label>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)} className="ios-input">
              <option value="all">{copy(lang, 'All statuses', 'كل الحالات')}</option>
              {activeStatuses.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="ios-card overflow-hidden">
          <div className="border-b ios-divider px-5 py-4">
            <h2 className="ios-title text-2xl">{copy(lang, 'HungerStation Orders', 'طلبات هنقرستيشن')}</h2>
            <p className="ios-help mt-1">{copy(lang, 'Filtered live orders and imported KDS orders for the selected period.', 'الطلبات المباشرة والمستوردة للمطبخ ضمن الفترة المحددة.')}</p>
          </div>
          <div className="divide-y divide-[var(--ios-divider)]">
            {filteredRows.length === 0 && (
              <div className="p-10 text-center">
                <Truck className="mx-auto mb-3 text-[var(--ios-accent)]" size={42} />
                <p className="font-black text-[var(--ios-text)]">{copy(lang, 'No HungerStation orders found.', 'لا توجد طلبات هنقرستيشن.')}</p>
                <p className="ios-help mt-1">{copy(lang, 'Adjust filters or pull orders from the live HungerStation integration card.', 'عدّل الفلاتر أو اسحب الطلبات من بطاقة تكامل هنقرستيشن المباشر.')}</p>
              </div>
            )}
            {filteredRows.map(row => (
              <div key={row.id} className="grid gap-3 px-5 py-4 text-sm lg:grid-cols-[1.2fr_1fr_120px_120px_130px]">
                <div>
                  <p className="font-black text-[var(--ios-text)]">#{row.externalOrderId}</p>
                  <p className="ios-help">{row.orderNumber} / {branchName(lang, branches, row.branchId)}</p>
                </div>
                <div>
                  <p className="font-bold text-[var(--ios-text)]">{row.customer}</p>
                  <p className="ios-help">{row.phone || copy(lang, 'No phone', 'لا يوجد رقم')}</p>
                </div>
                <div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${row.importedRestaurantOrderId ? 'bg-[#EAF8EF] text-[#34C759]' : 'bg-[#FFF4E5] text-[#C2410C]'}`}>
                    {row.importedRestaurantOrderId ? copy(lang, 'Imported', 'مستورد') : copy(lang, 'Pending', 'معلق')}
                  </span>
                </div>
                <p className="font-bold capitalize text-[var(--ios-secondary)]">{row.status}</p>
                <p className="text-right font-black text-[var(--ios-accent)]">{row.total.toFixed(2)} SAR</p>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-6">
          <div className="ios-card p-5">
            <h2 className="ios-title flex items-center gap-2 text-xl"><CalendarDays size={18} /> {copy(lang, 'Report Summary', 'ملخص التقرير')}</h2>
            <div className="mt-4 space-y-3">
              {[
                [copy(lang, 'Period', 'الفترة'), `${fromDate} - ${toDate}`],
                [copy(lang, 'Imported orders', 'طلبات مستوردة'), importedCount],
                [copy(lang, 'Total VAT', 'إجمالي الضريبة'), `${vatAmount.toFixed(2)} SAR`],
                [copy(lang, 'Total items', 'إجمالي الأصناف'), filteredRows.reduce((sum, row) => sum + row.itemCount, 0)],
                [copy(lang, 'Report rows', 'صفوف التقرير'), filteredRows.length],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-2xl bg-[#F5F5F7] px-4 py-3">
                  <span className="text-sm font-semibold text-[var(--ios-secondary)]">{label}</span>
                  <span className="text-right font-black text-[var(--ios-text)]">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ios-card p-5">
            <h2 className="ios-title text-xl">{copy(lang, 'PDF Export', 'تصدير PDF')}</h2>
            <p className="ios-help mt-2">
              {copy(lang, 'The PDF export uses the current date, branch, and status filters and opens a print-ready report window.', 'يعتمد تصدير PDF على فلاتر التاريخ والفرع والحالة الحالية ويفتح نافذة تقرير جاهزة للطباعة.')}
            </p>
            <button onClick={exportPdf} className="ios-button-primary mt-4 flex w-full items-center justify-center gap-2">
              <Download size={18} /> {copy(lang, 'Export Filtered PDF', 'تصدير PDF مفلتر')}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default HungerStationReport;
