import { Product, PurchaseInvoice, Shift, Transaction } from '../types';

function isSameDay(timestamp: number, day = Date.now()) {
  return new Date(timestamp).setHours(0, 0, 0, 0) === new Date(day).setHours(0, 0, 0, 0);
}

export function buildDailyVatReport(transactions: Transaction[], day = Date.now()) {
  const sales = transactions.filter(tx => isSameDay(tx.timestamp, day));
  return {
    invoiceCount: sales.filter(tx => !tx.isRefund).length,
    refundCount: sales.filter(tx => tx.isRefund).length,
    taxableSales: sales.reduce((sum, tx) => sum + tx.subtotal, 0),
    vatCollected: sales.reduce((sum, tx) => sum + tx.vat, 0),
    totalWithVat: sales.reduce((sum, tx) => sum + tx.total, 0)
  };
}

export function buildProfitReport(transactions: Transaction[]) {
  let revenue = 0;
  let cost = 0;
  for (const tx of transactions) {
    if (tx.isRefund) continue;
    for (const item of tx.items) {
      revenue += item.price * item.quantity;
      cost += (item.costPrice || 0) * item.quantity;
    }
  }
  const grossProfit = revenue - cost;
  return {
    revenue,
    cost,
    grossProfit,
    marginPercent: revenue > 0 ? (grossProfit / revenue) * 100 : 0
  };
}

export function buildExpiryReport(products: Product[], windowDays = 30) {
  const now = Date.now();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  return products
    .filter(product => product.expiryDate)
    .map(product => ({ ...product, expiryTime: new Date(product.expiryDate!).getTime() }))
    .filter(product => product.expiryTime <= now + windowMs)
    .sort((a, b) => a.expiryTime - b.expiryTime);
}

export function buildPurchaseVatReport(
  invoices: PurchaseInvoice[],
  transactions: Transaction[],
  dateFrom?: number,
  dateTo?: number
) {
  const fromMs = dateFrom ?? 0;
  const toMs = dateTo ?? Date.now();

  const invoiceTime = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) return numeric;
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  };

  const filteredInvoices = invoices.filter(inv => {
    const time = invoiceTime(inv.date);
    return time >= fromMs && time <= toMs;
  });
  const filteredSales = transactions.filter(
    tx => !tx.isRefund && tx.timestamp >= fromMs && tx.timestamp <= toMs
  );

  const totalPurchases = filteredInvoices.reduce((sum, inv) => sum + inv.subtotal, 0);
  const totalInputVat = filteredInvoices.reduce((sum, inv) => sum + inv.vat, 0);
  const totalSales = filteredSales.reduce((sum, tx) => sum + tx.subtotal, 0);
  const totalOutputVat = filteredSales.reduce((sum, tx) => sum + tx.vat, 0);
  const netVatPosition = totalOutputVat - totalInputVat;
  const grossProfit = totalSales - totalPurchases;

  return {
    totalPurchases,
    totalInputVat,
    totalSales,
    totalOutputVat,
    netVatPosition,
    grossProfit,
    invoiceCount: filteredInvoices.length,
    saleCount: filteredSales.length,
    rows: filteredInvoices,
  };
}

export function buildShiftReport(transactions: Transaction[], shift: Shift | null) {
  const shiftTransactions = shift
    ? transactions.filter(tx => tx.timestamp >= shift.startTime && (!shift.endTime || tx.timestamp <= shift.endTime))
    : transactions.filter(tx => isSameDay(tx.timestamp));
  const cash = shiftTransactions.filter(tx => tx.paymentMethod === 'cash').reduce((sum, tx) => sum + tx.total, 0);
  const card = shiftTransactions.filter(tx => tx.paymentMethod === 'card').reduce((sum, tx) => sum + tx.total, 0);
  const credit = shiftTransactions.filter(tx => tx.paymentMethod === 'credit').reduce((sum, tx) => sum + tx.total, 0);
  return {
    count: shiftTransactions.length,
    cash,
    card,
    credit,
    total: cash + card + credit,
    expectedCash: shift ? shift.startCash + cash : cash,
    variance: shift?.endCash !== undefined ? shift.endCash - (shift.startCash + cash) : undefined
  };
}
