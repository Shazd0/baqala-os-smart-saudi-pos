import React, { useMemo, useState } from 'react';
import { Transaction, Product, Language, PurchaseInvoice } from '../types';
import { TRANSLATIONS } from '../constants';
import { StorageService } from '../services/storageService';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  AlertCircle, ArrowDownRight, ArrowUpRight, Banknote, CalendarDays, CreditCard,
  Download, FileText, Package, ShoppingBag, TrendingUp, Wallet,
  X,
} from 'lucide-react';
import { buildExpiryReport, buildPurchaseVatReport, buildShiftReport } from '../services/reports';
import { openPrintDocument, sar } from '../services/printTemplates';
import { downloadCsv } from '../services/csvService';

interface DashboardProps {
  transactions: Transaction[];
  products: Product[];
  lang: Language;
  dataVersion?: number;
}

const PIE_COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur border border-slate-100 shadow-xl rounded-2xl px-4 py-3 text-sm">
      {label && <p className="text-slate-500 mb-1 font-medium">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-semibold">
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
        </p>
      ))}
    </div>
  );
};

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

function inRange(timestamp: number, fromMs: number, toMs: number) {
  return timestamp >= fromMs && timestamp <= toMs;
}

function toTimestamp(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function purchaseInvoiceTotal(invoice: PurchaseInvoice) {
  const storedTotal = Number(invoice.total);
  if (Number.isFinite(storedTotal) && storedTotal > 0) return storedTotal;
  const subtotal = Number(invoice.subtotal);
  const vat = Number(invoice.vat);
  if (Number.isFinite(subtotal) || Number.isFinite(vat)) {
    return (Number.isFinite(subtotal) ? subtotal : 0) + (Number.isFinite(vat) ? vat : 0);
  }
  return (invoice.lines || []).reduce((sum, line) => {
    const lineTotal = Number(line.total);
    if (Number.isFinite(lineTotal) && lineTotal > 0) return sum + lineTotal;
    const units = Number(line.totalUnits ?? (Number(line.quantity || 0) * Number(line.caseSize || 1)));
    const unitCost = Number(line.unitCost);
    return sum + (Number.isFinite(units) && Number.isFinite(unitCost) ? units * unitCost : 0);
  }, 0);
}

function currentWeekBounds() {
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(today.getDate() - today.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { weekStart: start.getTime(), weekEnd: end.getTime() };
}

function signedSaleValue(tx: Transaction, value: number) {
  return tx.isRefund ? -Math.abs(value) : value;
}

const Dashboard: React.FC<DashboardProps> = ({ transactions, products, lang, dataVersion = 0 }) => {
  const t = TRANSLATIONS[lang];
  const [fromDate, setFromDate] = useState(localDateInput());
  const [toDate, setToDate] = useState(localDateInput());
  const [listPanel, setListPanel] = useState<'lowStock' | 'expiry' | null>(null);

  const fromMs = useMemo(() => startOfDateInput(fromDate), [fromDate]);
  const toMs = useMemo(() => endOfDateInput(toDate), [toDate]);

  const stats = useMemo(() => {
    const expenses = StorageService.getExpenses().filter(expense => inRange(expense.date, fromMs, toMs));
    const allPurchaseInvoices = StorageService.getPurchaseInvoices();
    const purchaseInvoices = allPurchaseInvoices.filter(invoice => inRange(toTimestamp(invoice.date), fromMs, toMs));
    const filteredTxns = transactions.filter(tx => inRange(tx.timestamp, fromMs, toMs));
    const { weekStart, weekEnd } = currentWeekBounds();
    const weeklyTxns = transactions.filter(tx => inRange(tx.timestamp, weekStart, weekEnd));
    const weeklyPurchases = allPurchaseInvoices.filter(invoice => inRange(toTimestamp(invoice.date), weekStart, weekEnd));
    const weeklyExpenses = StorageService.getExpenses().filter(expense => inRange(expense.date, weekStart, weekEnd));
    const currentShift = StorageService.getCurrentShift();
    const config = StorageService.getConfig();
    const lowStockThreshold = config.lowStockThreshold ?? 5;
    const lowStockProducts = products
      .filter(product => product.stock <= lowStockThreshold)
      .sort((a, b) => a.stock - b.stock);

    const totalSales = filteredTxns.reduce((sum, tx) => sum + signedSaleValue(tx, tx.total), 0);
    const totalPurchase = purchaseInvoices.reduce((sum, invoice) => sum + purchaseInvoiceTotal(invoice), 0);
    const totalExpense = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const totalBalance = totalSales - totalPurchase - totalExpense;
    const totalCostOfSoldProducts = filteredTxns.reduce((sum, tx) => {
      const lineCost = tx.items.reduce((itemSum, item) => itemSum + Number(item.costPrice || 0) * item.quantity, 0);
      return sum + signedSaleValue(tx, lineCost);
    }, 0);
    const totalProfit = totalSales - totalCostOfSoldProducts;
    const netProfit = totalProfit - totalExpense;

    const vatReport = {
      invoiceCount: filteredTxns.filter(tx => !tx.isRefund).length,
      refundCount: filteredTxns.filter(tx => tx.isRefund).length,
      taxableSales: filteredTxns.reduce((sum, tx) => sum + signedSaleValue(tx, tx.subtotal), 0),
      vatCollected: filteredTxns.reduce((sum, tx) => sum + signedSaleValue(tx, tx.vat), 0),
      totalWithVat: totalSales,
    };

    const categorySales: Record<string, number> = {};
    filteredTxns.forEach(tx => {
      tx.items.forEach(item => {
        categorySales[item.category] = (categorySales[item.category] || 0) + signedSaleValue(tx, item.price * item.quantity);
      });
    });
    const pieData = Object.entries(categorySales)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);

    const trendData: { day: string; sales: number; purchases: number; expenses: number; txns: number }[] = [];
    const cursor = new Date(weekStart);
    cursor.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const dayStart = cursor.getTime();
      const dayEnd = dayStart + 86400000 - 1;
      const dayTxns = weeklyTxns.filter(tx => inRange(tx.timestamp, dayStart, dayEnd));
      const dayPurchases = weeklyPurchases.filter(invoice => inRange(toTimestamp(invoice.date), dayStart, dayEnd));
      const dayExpenses = weeklyExpenses.filter(expense => inRange(expense.date, dayStart, dayEnd));
      trendData.push({
        day: cursor.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'short' }),
        sales: Number(dayTxns.reduce((sum, tx) => sum + signedSaleValue(tx, tx.total), 0).toFixed(2)),
        purchases: Number(dayPurchases.reduce((sum, invoice) => sum + purchaseInvoiceTotal(invoice), 0).toFixed(2)),
        expenses: Number(dayExpenses.reduce((sum, expense) => sum + expense.amount, 0).toFixed(2)),
        txns: dayTxns.filter(tx => !tx.isRefund).length,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const paymentTotals = (['cash', 'card', 'credit'] as const).map(method => ({
      name: method === 'cash' ? 'Cash' : method === 'card' ? 'Card' : 'Credit',
      value: filteredTxns
        .filter(tx => tx.paymentMethod === method)
        .reduce((sum, tx) => sum + signedSaleValue(tx, tx.total), 0),
      fill: method === 'cash' ? '#10B981' : method === 'card' ? '#3B82F6' : '#F59E0B',
    }));

    const purchaseVatReport = buildPurchaseVatReport(
      StorageService.getPurchaseInvoices(),
      transactions,
      fromMs,
      toMs,
    );

    return {
      expenses,
      purchaseInvoices,
      filteredTxns,
      saleCount: filteredTxns.filter(tx => !tx.isRefund).length,
      refundCount: filteredTxns.filter(tx => tx.isRefund).length,
      totalSales,
      totalPurchase,
      totalExpense,
      totalBalance,
      totalCostOfSoldProducts,
      totalProfit,
      netProfit,
      vatReport,
      pieData,
      trendData,
      paymentTotals,
      purchaseVatReport,
      weekStart,
      weekEnd,
      expiryReport: buildExpiryReport(products),
      lowStockProducts,
      lowStockThreshold,
      shiftReport: buildShiftReport(transactions, currentShift),
    };
  }, [transactions, products, fromMs, toMs, lang, dataVersion]);

  const exportCSV = () => {
    const headers = ['ID', 'Date', 'Items', 'Subtotal', 'VAT', 'Total', 'Method', 'Cashier'];
    const rows = stats.filteredTxns.map(tx => [
      tx.id,
      new Date(tx.timestamp).toLocaleString(),
      tx.items.length,
      tx.subtotal.toFixed(2),
      tx.vat.toFixed(2),
      tx.total.toFixed(2),
      tx.paymentMethod,
      tx.cashierName || '',
    ]);
    downloadCsv(`baqala_dashboard_${fromDate}_${toDate}.csv`, headers, rows);
  };

  const printZReport = () => {
    const config = StorageService.getConfig();
    const body = `
      <div class="card" style="margin-bottom:14px">
        <strong>${fromDate} - ${toDate}</strong>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
        <div class="total-card"><span class="muted">Total Sales</span><h2>${sar(stats.totalSales)}</h2></div>
        <div class="total-card"><span class="muted">Total Purchase</span><h2>${sar(stats.totalPurchase)}</h2></div>
        <div class="total-card"><span class="muted">Total Expense</span><h2>${sar(stats.totalExpense)}</h2></div>
        <div class="total-card"><span class="muted">Balance</span><h2>${sar(stats.totalBalance)}</h2></div>
        <div class="total-card"><span class="muted">Cost Of Sold Products</span><h2>${sar(stats.totalCostOfSoldProducts)}</h2></div>
        <div class="total-card"><span class="muted">Net Profit</span><h2>${sar(stats.netProfit)}</h2></div>
      </div>
      <table>
        <tbody>
          <tr><td>Total Sales</td><td class="amount">${sar(stats.totalSales)}</td></tr>
          <tr><td>Total Purchase</td><td class="amount">${sar(stats.totalPurchase)}</td></tr>
          <tr><td>Total Expense</td><td class="amount">${sar(stats.totalExpense)}</td></tr>
          <tr><td>Total Balance</td><td class="amount">${sar(stats.totalBalance)}</td></tr>
          <tr><td>Total Cost Of Sold Products</td><td class="amount">${sar(stats.totalCostOfSoldProducts)}</td></tr>
          <tr><td>Total Profit</td><td class="amount">${sar(stats.totalProfit)}</td></tr>
          <tr><td>Net Profit</td><td class="amount">${sar(stats.netProfit)}</td></tr>
          <tr><td>Sales Invoices</td><td class="amount">${stats.saleCount}</td></tr>
          <tr><td>Purchase Invoices</td><td class="amount">${stats.purchaseInvoices.length}</td></tr>
          <tr><td>Output VAT</td><td class="amount">${sar(stats.vatReport.vatCollected)}</td></tr>
          <tr><td>Input VAT</td><td class="amount">${sar(stats.purchaseVatReport.totalInputVat)}</td></tr>
        </tbody>
      </table>
    `;
    openPrintDocument({
      title: lang === 'ar' ? 'تقرير Z المالي' : 'Financial Z Report',
      config,
      body,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      autoPrint: true,
    });
  };

  const IOS = {
    blue: '#1E6B48',
    indigo: '#3D5C4A',
    purple: '#6B756F',
    pink: '#C2412D',
    orange: '#C4A35A',
    green: '#1E6B48',
    red: '#C2412D',
    teal: '#2F7A5A',
    mint: '#4A8F6C',
    text: '#1A211C',
    secondary: '#6B756F',
  };
  const accent = IOS.blue;
  const cardStyle = {
    borderRadius: '16px',
    boxShadow: '0px 4px 24px rgba(0,0,0,0.03), 0px 1px 2px rgba(0,0,0,0.02)',
  };
  const formatMoney = (value: number) => `${value.toFixed(2)} SAR`;
  const rangeLabel = fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`;
  const weekLabel = `${new Date(stats.weekStart).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' })} - ${new Date(stats.weekEnd).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' })}`;
  const paymentMax = Math.max(...stats.paymentTotals.map(method => Math.abs(method.value)), 1);
  const categoryBarMax = Math.max(...stats.pieData.map(item => item.value), 1);

  const topCards = [
    { title: 'Total Sales', value: stats.totalSales, helper: `${stats.saleCount} invoices`, icon: TrendingUp, color: IOS.green, soft: 'rgba(52,199,89,0.12)' },
    { title: 'Total Purchase', value: stats.totalPurchase, helper: `${stats.purchaseInvoices.length} purchase bills`, icon: ShoppingBag, color: IOS.red, soft: 'rgba(255,59,48,0.10)' },
    { title: 'Total Expense', value: stats.totalExpense, helper: `${stats.expenses.length} expenses`, icon: ArrowDownRight, color: IOS.red, soft: 'rgba(255,59,48,0.10)' },
    { title: 'Total Balance', value: stats.totalBalance, helper: 'Sales - purchase - expense', icon: Wallet, color: IOS.indigo, soft: 'rgba(88,86,214,0.12)' },
  ];

  const operationalCards = [
    { title: 'Total Cost Of Sold Products', value: stats.totalCostOfSoldProducts, helper: 'Runtime cost of filtered sold items', icon: Package, color: IOS.red, soft: 'rgba(255,59,48,0.10)' },
    { title: 'Total Profit', value: stats.totalProfit, helper: 'Sales - cost of sold products', icon: ArrowUpRight, color: stats.totalProfit >= 0 ? IOS.green : IOS.red, soft: stats.totalProfit >= 0 ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.10)' },
    { title: 'Net Profit', value: stats.netProfit, helper: 'Total profit - expenses', icon: Banknote, color: stats.netProfit >= 0 ? IOS.green : IOS.red, soft: stats.netProfit >= 0 ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.10)' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-[#F2F2F7] pb-24">
      {/* Solid (not translucent) sticky header so scrolled card values can't bleed through it. */}
      <div className="sticky top-0 z-30 border-b border-[#E4E7E3] bg-[#F2F2F7] px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-bold text-[#8E8E93]" style={cardStyle}>
              <CalendarDays size={14} color={accent} /> {rangeLabel}
            </p>
            <h1 className="truncate text-2xl font-black tracking-tight text-[#1C1C1E] sm:text-3xl lg:text-4xl">{t.dashboard || 'Dashboard'}</h1>
            <p className="mt-1.5 max-w-2xl text-xs font-semibold text-[#8E8E93] sm:text-sm">
              {lang === 'ar'
                ? 'نظرة مالية مباشرة على المبيعات والمشتريات والمصاريف والضريبة والمخزون.'
                : 'Live financial overview for sales, purchases, expenses, VAT, and inventory risk.'}
            </p>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-[minmax(130px,1fr)_minmax(130px,1fr)_auto] xl:grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_auto_auto_auto]">
            <label className="text-[10px] font-bold uppercase tracking-wide text-[#8E8E93]">
              {lang === 'ar' ? 'من' : 'From'}
              <input
                type="date"
                value={fromDate}
                onChange={event => setFromDate(event.target.value)}
                className="mt-1 block h-11 w-full min-w-0 rounded-xl border border-transparent bg-white px-3 text-xs font-bold text-[#1C1C1E] shadow-sm outline-none transition focus:border-[#1E6B48]"
              />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wide text-[#8E8E93]">
              {lang === 'ar' ? 'إلى' : 'Till'}
              <input
                type="date"
                value={toDate}
                onChange={event => setToDate(event.target.value)}
                className="mt-1 block h-11 w-full min-w-0 rounded-xl border border-transparent bg-white px-3 text-xs font-bold text-[#1C1C1E] shadow-sm outline-none transition focus:border-[#1E6B48]"
              />
            </label>
            <div className="col-span-2 flex gap-2 sm:col-span-1 sm:self-end xl:contents">
              <button
                onClick={() => { setFromDate(localDateInput()); setToDate(localDateInput()); }}
                className="h-11 min-h-0 flex-1 rounded-xl bg-white px-4 text-xs font-black text-[#1C1C1E] shadow-sm sm:flex-none xl:self-end"
              >
                {lang === 'ar' ? 'اليوم' : 'Today'}
              </button>
              <button
                onClick={exportCSV}
                className="flex h-11 min-h-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-black sm:flex-none xl:self-end"
                style={{ background: 'rgba(30,107,72,0.10)', color: accent }}
              >
                <Download size={14} /> CSV
              </button>
              <button
                onClick={printZReport}
                className="flex h-11 min-h-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-black sm:flex-none xl:self-end"
                style={{ background: 'rgba(30,107,72,0.10)', color: accent }}
              >
                <FileText size={14} /> {t.zReport}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 sm:px-6">

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {topCards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="bg-white p-5" style={cardStyle}>
              <div className="mb-5 flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: card.soft, color: card.color }}>
                  <Icon size={21} />
                </div>
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8E8E93]">Filtered</span>
              </div>
              <p className="text-xs font-black uppercase tracking-wide text-[#8E8E93]">{card.title}</p>
              <h2 className="mt-2 text-3xl font-black leading-none tracking-tight" style={{ color: card.color }}>{formatMoney(card.value)}</h2>
              <p className="mt-3 text-sm font-semibold text-[#8E8E93]">{card.helper}</p>
            </div>
          );
        })}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {operationalCards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="bg-white p-5" style={cardStyle}>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: card.soft, color: card.color }}>
                  <Icon size={22} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-[#8E8E93]">{card.title}</p>
                  <h3 className="text-2xl font-black" style={{ color: card.color }}>{formatMoney(card.value)}</h3>
                </div>
              </div>
              <p className="mt-4 rounded-2xl px-3 py-2 text-xs font-bold text-[#8E8E93]" style={{ background: card.soft }}>{card.helper}</p>
            </div>
          );
        })}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="bg-white p-5 xl:col-span-2" style={cardStyle}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-black text-[#1C1C1E]">Sales, Purchases & Expenses Weekly Graph</h3>
              <p className="text-sm font-semibold text-[#8E8E93]">Current week graph</p>
            </div>
            <span className="rounded-full px-3 py-2 text-xs font-black" style={{ background: 'rgba(30,107,72,0.10)', color: accent }}>{weekLabel}</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={stats.trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={IOS.green} stopOpacity={0.28} />
                  <stop offset="95%" stopColor={IOS.green} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="purchaseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={IOS.red} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={IOS.red} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={IOS.orange} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={IOS.orange} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E9E9EB" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#8E8E93', fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#8E8E93', fontWeight: 700 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="sales" name="Sales" stroke={IOS.green} strokeWidth={3} fill="url(#salesGrad)" />
              <Area type="monotone" dataKey="purchases" name="Purchases" stroke={IOS.red} strokeWidth={2.5} fill="url(#purchaseGrad)" />
              <Area type="monotone" dataKey="expenses" name="Expenses" stroke={IOS.orange} strokeWidth={2.5} fill="url(#expenseGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-5" style={cardStyle}>
          <h3 className="mb-1 text-xl font-black text-[#1C1C1E]">Sales by Category</h3>
          <p className="mb-4 text-sm font-semibold text-[#8E8E93]">Includes Misc revenue tracking</p>
          {stats.pieData.length === 0 ? (
            <div className="flex h-52 items-center justify-center text-sm font-bold text-[#8E8E93]">No sales in this range</div>
          ) : (
            <div className="space-y-3">
              {stats.pieData.slice(0, 7).map(item => (
                <div key={item.name}>
                  <div className="mb-1 flex justify-between text-xs font-black">
                    <span className="text-[#1C1C1E]">{item.name}</span>
                    <span style={{ color: IOS.purple }}>{formatMoney(item.value)}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-[#E9E9EB]">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(4, (item.value / categoryBarMax) * 100)}%`, background: IOS.purple }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="bg-white p-5" style={cardStyle}>
          <h3 className="mb-4 text-xl font-black text-[#1C1C1E]">Daily Transaction Count</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.trendData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E9E9EB" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#8E8E93', fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#8E8E93', fontWeight: 700 }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="txns" name="Transactions" fill={IOS.blue} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-5" style={cardStyle}>
          <h3 className="mb-1 text-xl font-black text-[#1C1C1E]">Payment Methods</h3>
          <p className="mb-4 text-sm font-semibold text-[#8E8E93]">Cash, Card, and Credit breakdown</p>
          <div className="space-y-3">
            {stats.paymentTotals.map(method => {
              const Icon = method.name === 'Cash' ? Banknote : CreditCard;
              const pct = Math.max(0, (Math.abs(method.value) / paymentMax) * 100);
              return (
                <div key={method.name} className="rounded-2xl bg-[#F5F5F7] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon size={15} color={method.name === 'Cash' ? IOS.green : method.name === 'Card' ? IOS.teal : IOS.mint} />
                      <span className="font-bold text-[#1C1C1E]">{method.name}</span>
                    </div>
                    <span className="font-black text-[#1C1C1E]">{formatMoney(method.value)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: method.name === 'Cash' ? IOS.green : method.name === 'Card' ? IOS.teal : IOS.mint }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-5" style={cardStyle}>
          <h3 className="mb-4 flex items-center gap-2 text-xl font-black text-[#1C1C1E]">
            <span className="rounded-lg px-2 py-0.5 text-xs font-black" style={{ background: 'rgba(88,86,214,0.12)', color: IOS.indigo }}>ZATCA</span>
            VAT Position
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-[#F5F5F7] px-3 py-2.5">
              <span className="text-sm font-semibold text-[#8E8E93]">Output VAT</span>
              <span className="font-bold text-[#1C1C1E]">{formatMoney(stats.vatReport.vatCollected)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-[#F5F5F7] px-3 py-2.5">
              <span className="text-sm font-semibold text-[#8E8E93]">Input VAT</span>
              <span className="font-bold text-[#1C1C1E]">{formatMoney(stats.purchaseVatReport.totalInputVat)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl px-3 py-3" style={{ background: 'rgba(30,107,72,0.10)' }}>
              <span className="text-sm font-black text-[#1C1C1E]">Net VAT Due</span>
              <span className="text-lg font-black" style={{ color: IOS.indigo }}>
                {formatMoney(stats.purchaseVatReport.netVatPosition)}
              </span>
            </div>
            <p className="text-xs font-semibold text-[#8E8E93]">Taxable Sales {formatMoney(stats.vatReport.taxableSales)} · {stats.saleCount} invoices · {stats.refundCount} refunds</p>
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="bg-white p-4" style={cardStyle}>
          <p className="text-xs font-black uppercase tracking-wide text-[#8E8E93]">Shift Sales</p>
          <h4 className="mt-1 text-2xl font-black text-[#1C1C1E]">{formatMoney(stats.shiftReport.total)}</h4>
          <p className="mt-1 text-xs font-semibold text-[#8E8E93]">Cash {stats.shiftReport.cash.toFixed(2)} · Card {stats.shiftReport.card.toFixed(2)} · Credit {stats.shiftReport.credit.toFixed(2)}</p>
        </div>
        <button
          type="button"
          onClick={() => setListPanel('expiry')}
          className="min-h-[96px] bg-white p-4 text-start transition hover:-translate-y-0.5"
          style={cardStyle}
        >
          <p className="text-xs font-black uppercase tracking-wide text-[#8E8E93]">Expiring Products</p>
          <h4 className="mt-1 text-4xl font-black" style={{ color: IOS.red }}>{stats.expiryReport.length}</h4>
          <p className="mt-1 text-sm font-black" style={{ color: IOS.red }}>Click to view list</p>
        </button>
        <button
          type="button"
          onClick={() => setListPanel('lowStock')}
          className="min-h-[96px] bg-white p-4 text-start transition hover:-translate-y-0.5"
          style={cardStyle}
        >
          <p className="text-xs font-black uppercase tracking-wide text-[#8E8E93]">Low Stock</p>
          <h4 className="mt-1 text-4xl font-black" style={{ color: IOS.orange }}>{stats.lowStockProducts.length}</h4>
          <p className="mt-1 text-sm font-semibold text-[#8E8E93]">At or below {stats.lowStockThreshold}</p>
        </button>
        <div className="bg-white p-4" style={cardStyle}>
          <p className="text-xs font-black uppercase tracking-wide text-[#8E8E93]">Active Expiry Alerts</p>
          <h4 className="mt-1 text-xl font-black text-[#1C1C1E]">{stats.expiryReport[0]?.nameEn || 'No active alerts'}</h4>
          <p className="mt-1 text-sm font-semibold text-[#8E8E93]">{stats.expiryReport[0]?.expiryDate || 'Inventory is clear'}</p>
        </div>
      </div>

      {stats.expiryReport.length > 0 && (
        <div className="mt-4 bg-white p-5" style={cardStyle}>
          <h3 className="mb-3 flex items-center gap-2 font-black text-[#1C1C1E]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#FF9500]" />
            Expiry Alerts
          </h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
            {stats.expiryReport.slice(0, 8).map(product => {
              const expired = new Date(product.expiryDate!).getTime() < Date.now();
              return (
                <div key={product.id} className={`rounded-xl p-3 text-sm ${expired ? 'bg-[#FFECEA]' : 'bg-[#FFF4E5]'}`}>
                  <p className="truncate font-black text-[#1C1C1E]">{lang === 'ar' ? product.nameAr || product.nameEn : product.nameEn}</p>
                  <p className={`mt-0.5 text-xs font-bold ${expired ? 'text-[#FF3B30]' : 'text-[#C2410C]'}`}>
                    {expired ? (lang === 'ar' ? 'منتهي' : 'EXPIRED') : product.expiryDate}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>

      {listPanel && (
        <div className="fixed inset-0 z-[80] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[82vh] overflow-hidden rounded-3xl bg-white shadow-2xl border border-white/80">
            <div className={`p-5 text-white flex items-center justify-between ${listPanel === 'lowStock' ? 'bg-gradient-to-r from-red-700 to-rose-600' : 'bg-gradient-to-r from-amber-600 to-orange-500'}`}>
              <div>
                <h3 className="text-xl font-black">{listPanel === 'lowStock' ? 'Low Stock Products' : 'Expiring Soon Products'}</h3>
                <p className="text-white/80 text-xs mt-1">
                  {listPanel === 'lowStock'
                    ? `Products at or below ${stats.lowStockThreshold} units`
                    : 'Products expired or expiring in the next 30 days'}
                </p>
              </div>
              <button onClick={() => setListPanel(null)} className="p-2 hover:bg-white/15 rounded-xl">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[62vh]">
              {listPanel === 'lowStock' && (
                <div className="space-y-2">
                  {stats.lowStockProducts.map(product => (
                    <div key={product.id} className="rounded-2xl border border-red-100 bg-red-50/60 p-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-black text-slate-900">{lang === 'ar' ? product.nameAr || product.nameEn : product.nameEn}</p>
                        <p className="text-xs text-slate-500 font-mono">{product.barcode}</p>
                      </div>
                      <div className="text-end">
                        <p className="text-2xl font-black text-red-700">{product.stock}</p>
                        <p className="text-xs text-red-500">stock left</p>
                      </div>
                    </div>
                  ))}
                  {stats.lowStockProducts.length === 0 && (
                    <p className="text-center text-slate-400 py-10">No low stock products.</p>
                  )}
                </div>
              )}

              {listPanel === 'expiry' && (
                <div className="space-y-2">
                  {stats.expiryReport.map(product => {
                    const expired = new Date(product.expiryDate!).getTime() < Date.now();
                    return (
                      <div key={product.id} className={`rounded-2xl border p-4 flex items-center justify-between gap-4 ${expired ? 'border-red-100 bg-red-50' : 'border-amber-100 bg-amber-50'}`}>
                        <div>
                          <p className="font-black text-slate-900">{lang === 'ar' ? product.nameAr || product.nameEn : product.nameEn}</p>
                          <p className="text-xs text-slate-500 font-mono">{product.barcode}</p>
                        </div>
                        <div className="text-end">
                          <p className={`text-sm font-black ${expired ? 'text-red-700' : 'text-amber-700'}`}>{expired ? 'EXPIRED' : product.expiryDate}</p>
                          <p className="text-xs text-slate-500">stock {product.stock}</p>
                        </div>
                      </div>
                    );
                  })}
                  {stats.expiryReport.length === 0 && (
                    <p className="text-center text-slate-400 py-10">No expiring products.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
