import React, { useMemo, useState } from 'react';
import { CreditCard, Merge, QrCode, Save, Split, Table2, Users } from 'lucide-react';
import { GuestTab, Language, RestaurantOrder, RestaurantOrderItem } from '../types';
import { StorageService } from '../services/storageService';

interface TabOrderingProps {
  lang: Language;
  onChange?: () => void;
}

function txt(lang: Language, en: string, ar: string) {
  return lang === 'ar' ? ar : en;
}

const IOS = {
  blue: '#007AFF',
  indigo: '#5856D6',
  pink: '#FF2D55',
  orange: '#FF9500',
  green: '#34C759',
  red: '#FF3B30',
  teal: '#30B0C7',
};

const TAB_MENU_COLORS = [IOS.indigo, IOS.teal, IOS.orange, IOS.pink, IOS.green, IOS.blue];

function softColor(hex: string, alpha = 0.1) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function menuColor(item: RestaurantOrderItem | { station?: string; categoryId?: string }, index: number) {
  const key = `${item.station || ''} ${'categoryId' in item ? item.categoryId || '' : ''}`.toLowerCase();
  if (/drink|beverage|juice|coffee/.test(key)) return IOS.teal;
  if (/dessert|sweet|cake/.test(key)) return IOS.pink;
  if (/grill|shawarma|main|meat/.test(key)) return IOS.orange;
  return TAB_MENU_COLORS[index % TAB_MENU_COLORS.length];
}

function totals(items: RestaurantOrderItem[], discount = 0, serviceCharge = 0, tips = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity + item.modifiers.reduce((modSum, modifier) => modSum + modifier.priceDelta * item.quantity, 0), 0);
  const taxable = Math.max(0, subtotal - discount + serviceCharge);
  const vat = Number((taxable * 0.15).toFixed(2));
  return { subtotal, discount, serviceCharge, tips, vat, total: Number((taxable + vat + tips).toFixed(2)) };
}

const TabOrdering: React.FC<TabOrderingProps> = ({ lang, onChange }) => {
  const activeBranchId = StorageService.getActiveBranchId();
  const tables = StorageService.getTables().filter(table => !table.branchId || table.branchId === activeBranchId);
  const menuItems = StorageService.getMenuItems().filter(item => item.active);
  const [tabs, setTabs] = useState<GuestTab[]>(() => StorageService.getGuestTabs());
  const [selectedId, setSelectedId] = useState<string>('');
  const selected = tabs.find(tab => tab.id === selectedId && tab.branchId === activeBranchId) || tabs.find(tab => tab.branchId === activeBranchId);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [tableId, setTableId] = useState(tables[0]?.id || '');
  const [splitAmount, setSplitAmount] = useState('');

  const branchTabs = useMemo(() => tabs.filter(tab => tab.branchId === activeBranchId), [tabs, activeBranchId]);

  const refresh = () => {
    setTabs(StorageService.getGuestTabs());
    onChange?.();
  };

  const createTab = () => {
    const table = tables.find(item => item.id === tableId);
    const calculated = totals([]);
    const tab: GuestTab = {
      id: `TAB-${Date.now()}`,
      branchId: activeBranchId,
      tableId,
      tabNumber: `TAB-${String(branchTabs.length + 1).padStart(3, '0')}`,
      guestName,
      guestPhone,
      status: 'open',
      items: [],
      splitPayments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...calculated,
    };
    const savedTabs = StorageService.saveGuestTab(tab);
    if (table) StorageService.saveTable({ ...table, state: 'ordering', updatedAt: Date.now() });
    setTabs(savedTabs);
    setSelectedId(tab.id);
    setGuestName('');
    setGuestPhone('');
    onChange?.();
  };

  const saveSelected = (next: GuestTab) => {
    const updated = { ...next, updatedAt: Date.now() };
    setTabs(current => current.map(tab => tab.id === updated.id ? updated : tab));
    const savedTabs = StorageService.saveGuestTab(updated);
    setTabs(savedTabs);
    onChange?.();
  };

  const addItem = (menuItemId: string) => {
    if (!selected) return;
    const item = menuItems.find(menuItem => menuItem.id === menuItemId);
    if (!item) return;
    const existing = selected.items.find(orderItem => orderItem.menuItemId === item.id && orderItem.status !== 'voided');
    const items = existing
      ? selected.items.map(orderItem => orderItem.id === existing.id ? { ...orderItem, quantity: orderItem.quantity + 1 } : orderItem)
      : [...selected.items, {
        id: `TI-${Date.now()}`,
        menuItemId: item.id,
        nameEn: item.nameEn,
        nameAr: item.nameAr,
        quantity: 1,
        unitPrice: item.basePrice,
        modifiers: [],
        station: item.station,
        status: 'draft' as const,
      }];
    saveSelected({ ...selected, ...totals(items, selected.discount, selected.serviceCharge, selected.tips), items });
  };

  const moveToTable = (nextTableId: string) => {
    if (!selected) return;
    saveSelected({ ...selected, tableId: nextTableId });
  };

  const mergeIntoSelected = (sourceId: string) => {
    if (!selected || sourceId === selected.id) return;
    const source = tabs.find(tab => tab.id === sourceId);
    if (!source) return;
    const items = [...selected.items, ...source.items];
    saveSelected({ ...selected, ...totals(items, selected.discount + source.discount, selected.serviceCharge + source.serviceCharge, selected.tips + source.tips), items });
    const cancelledSource = { ...source, status: 'cancelled' as const, closedAt: Date.now(), updatedAt: Date.now() };
    setTabs(current => current.map(tab => tab.id === cancelledSource.id ? cancelledSource : tab));
    const savedTabs = StorageService.saveGuestTab(cancelledSource);
    setTabs(savedTabs);
    onChange?.();
  };

  const addSplitPayment = () => {
    if (!selected) return;
    const amount = Number(splitAmount);
    if (!amount || amount <= 0) return;
    const splitPayments = [...selected.splitPayments, { id: `PAY-${Date.now()}`, amount, method: 'card' as const, paidAt: Date.now() }];
    const paid = splitPayments.reduce((sum, payment) => sum + payment.amount, 0);
    saveSelected({ ...selected, splitPayments, status: paid >= selected.total ? 'closed' : 'partially_paid', closedAt: paid >= selected.total ? Date.now() : selected.closedAt });
    setSplitAmount('');
  };

  const sendToKitchen = () => {
    if (!selected) return;
    const firedItems = selected.items.map(item => ({ ...item, status: 'fired' as const, firedAt: item.firedAt || Date.now() }));
    if (!firedItems.length) return;
    const calculated = totals(firedItems, selected.discount, selected.serviceCharge, selected.tips);
    const kitchenOrder: RestaurantOrder = {
      id: `ORD-TAB-${selected.id}`,
      branchId: selected.branchId,
      orderNumber: '',
      orderType: 'dine_in',
      status: 'fired',
      tableId: selected.tableId,
      tableLabel: tables.find(table => table.id === selected.tableId)?.label,
      channel: 'pos',
      items: firedItems,
      subtotal: calculated.subtotal,
      discount: calculated.discount,
      vat: calculated.vat,
      total: calculated.total,
      createdAt: selected.createdAt,
      updatedAt: Date.now(),
      note: [
        'Staff tablet order',
        selected.tabNumber,
        selected.guestName ? `Guest: ${selected.guestName}` : '',
        selected.guestPhone ? `Mobile: ${selected.guestPhone}` : '',
      ].filter(Boolean).join(' / '),
    };
    StorageService.saveRestaurantOrder(kitchenOrder);
    saveSelected({
      ...selected,
      status: 'sent_to_kitchen',
      items: firedItems,
      ...calculated,
    });
  };

  const paidAmount = selected?.splitPayments.reduce((sum, payment) => sum + payment.amount, 0) || 0;
  const remainingAmount = selected ? Math.max(0, selected.total - paidAmount) : 0;
  const selectedTableLabel = tables.find(table => table.id === selected?.tableId)?.label || txt(lang, 'No table', 'بدون طاولة');
  const statusBadgeStyle = (status: GuestTab['status']) => {
    const color = status === 'open'
      ? IOS.blue
      : status === 'closed'
        ? IOS.green
        : status === 'cancelled'
          ? IOS.red
          : status === 'sent_to_kitchen'
            ? IOS.orange
            : IOS.indigo;
    return { background: color, color: '#FFFFFF' };
  };

  return (
    <div className="grid h-full max-h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden bg-[#F2F2F7] text-[#1C1C1E] lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-1 2xl:grid-cols-[380px_minmax(0,1fr)]">
      <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-[#E5E5EA] bg-[#F5F5F7]">
        <div className="flex-shrink-0 p-4 pb-3">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--ios-accent)]">Staff Tablet Ordering</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-[#1C1C1E] 2xl:text-3xl">{txt(lang, 'Tablet Order Taking', 'أخذ الطلبات بالتابلت')}</h1>
          <p className="mt-1 text-sm font-semibold text-[#8E8E93]">{txt(lang, 'Waiters take table orders here and send them directly to the kitchen.', 'يأخذ النادل طلب الطاولة هنا ويرسله مباشرة إلى المطبخ.')}</p>
        </div>

        <div className="mx-4 flex-shrink-0 rounded-2xl bg-white p-4 shadow-[0px_4px_24px_rgba(0,0,0,0.03),0px_1px_2px_rgba(0,0,0,0.02)]">
          <input value={guestName} onChange={event => setGuestName(event.target.value)} placeholder="Guest name" className="mb-2 min-h-[44px] w-full rounded-xl border-0 bg-[#E9E9EB] px-3 text-sm font-semibold text-[#1C1C1E] outline-none focus:ring-2 focus:ring-[var(--ios-accent)]" />
          <input value={guestPhone} onChange={event => setGuestPhone(event.target.value)} placeholder="Guest phone" className="mb-3 min-h-[44px] w-full rounded-xl border-0 bg-[#E9E9EB] px-3 text-sm font-semibold text-[#1C1C1E] outline-none focus:ring-2 focus:ring-[var(--ios-accent)]" />
          <div className="mb-3 flex gap-2 overflow-x-auto whitespace-nowrap pb-1">
            {tables.map(table => (
              <button
                key={table.id}
                onClick={() => setTableId(table.id)}
                className={`min-h-[44px] shrink-0 rounded-xl px-4 text-sm font-black transition ${tableId === table.id ? 'bg-[#007AFF] text-white shadow-[0_8px_24px_rgba(0,122,255,0.25)]' : 'bg-[#E9E9EB] text-[#1C1C1E]'}`}
              >
                {table.label}
              </button>
            ))}
          </div>
          <button onClick={createTab} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[var(--ios-accent)] px-4 text-sm font-black text-white">
            <QrCode size={17} /> {txt(lang, 'Start Table Order', 'بدء طلب الطاولة')}
          </button>
        </div>

        {selected && (
          <div className="mx-4 mt-3 flex-shrink-0 rounded-2xl bg-white p-4 shadow-[0px_4px_24px_rgba(0,0,0,0.03),0px_1px_2px_rgba(0,0,0,0.02)]">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--ios-accent)]">{selected.status.replace(/_/g, ' ')}</p>
                <h2 className="truncate text-xl font-black tracking-tight text-[#1C1C1E]">{selected.tabNumber} - {selected.guestName || txt(lang, 'Guest', 'ضيف')}</h2>
                <p className="mt-1 truncate text-sm font-semibold text-[#8E8E93]">{selectedTableLabel}</p>
              </div>
              <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black" style={statusBadgeStyle(selected.status)}>{selected.status.replace(/_/g, ' ')}</span>
            </div>
          </div>
        )}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="space-y-3">
            <section className="rounded-2xl bg-white p-4 shadow-[0px_4px_24px_rgba(0,0,0,0.03),0px_1px_2px_rgba(0,0,0,0.02)]">
              <h3 className="mb-3 flex items-center gap-2 text-base font-black text-[#1C1C1E]"><Users size={17} /> {txt(lang, 'Active Tabs', 'التابات النشطة')}</h3>
              <div className="space-y-2">
                {branchTabs.map(tab => {
                  const active = selected?.id === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setSelectedId(tab.id)}
                      className={`w-full rounded-xl bg-[#F5F5F7] p-3 text-left transition ${active ? 'ring-2 ring-[var(--ios-accent)]' : 'hover:bg-[#FAFAFC]'}`}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-sm font-black text-[#1C1C1E]">{tab.tabNumber} • {tab.guestName || 'Walk-in'}</p>
                            <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-black" style={statusBadgeStyle(tab.status)}>{tab.status.replace(/_/g, ' ')}</span>
                          </div>
                          <p className="mt-1 truncate text-xs font-semibold text-[#8E8E93]">{tables.find(table => table.id === tab.tableId)?.label || 'No table'} / {tab.guestPhone || 'No phone'}</p>
                        </div>
                        <p className="shrink-0 text-right text-sm font-black text-[#1C1C1E]">SAR {tab.total.toFixed(2)}</p>
                      </div>
                    </button>
                  );
                })}
                {branchTabs.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#D1D1D6] p-5 text-center">
                    <Users className="mx-auto text-[var(--ios-accent)]" size={34} />
                    <p className="mt-3 text-sm font-black text-[#1C1C1E]">{txt(lang, 'No open tabs yet', 'لا توجد طلبات مفتوحة')}</p>
                  </div>
                )}
              </div>
            </section>

            {selected && (
              <>
                <section className="rounded-2xl bg-white p-4 shadow-[0px_4px_24px_rgba(0,0,0,0.03),0px_1px_2px_rgba(0,0,0,0.02)]">
                  <h3 className="mb-2 flex items-center gap-2 text-base font-black text-[#1C1C1E]"><Table2 size={17} /> {txt(lang, 'Transfer Table', 'نقل الطاولة')}</h3>
                  <label className="mb-1 block text-xs font-black uppercase text-[#8E8E93]">Table</label>
                  <select value={selected.tableId || ''} onChange={event => moveToTable(event.target.value)} className="min-h-[44px] w-full rounded-xl border-0 bg-[#E9E9EB] px-3 text-sm font-bold text-[#1C1C1E] outline-none">
                    {tables.map(table => <option key={table.id} value={table.id}>{table.label}</option>)}
                  </select>
                </section>

                <section className="rounded-2xl bg-white p-4 shadow-[0px_4px_24px_rgba(0,0,0,0.03),0px_1px_2px_rgba(0,0,0,0.02)]">
                  <h3 className="mb-2 flex items-center gap-2 text-base font-black text-[#1C1C1E]"><Merge size={17} /> {txt(lang, 'Merge Tabs', 'دمج التابات')}</h3>
                  <label className="mb-1 block text-xs font-black uppercase text-[#8E8E93]">Target tab</label>
                  <select onChange={event => mergeIntoSelected(event.target.value)} defaultValue="" className="min-h-[44px] w-full rounded-xl border-0 bg-[#E9E9EB] px-3 text-sm font-bold text-[#1C1C1E] outline-none">
                    <option value="" disabled>{txt(lang, 'Choose tab', 'اختر تاب')}</option>
                    {branchTabs.filter(tab => tab.id !== selected.id && tab.status !== 'cancelled' && tab.status !== 'closed').map(tab => <option key={tab.id} value={tab.id}>{tab.tabNumber}</option>)}
                  </select>
                </section>

                <section className="rounded-2xl bg-white p-4 shadow-[0px_4px_24px_rgba(0,0,0,0.03),0px_1px_2px_rgba(0,0,0,0.02)]">
                  <h3 className="mb-2 flex items-center gap-2 text-base font-black text-[#1C1C1E]"><Split size={17} /> {txt(lang, 'Split Payment', 'تقسيم الدفع')}</h3>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input value={splitAmount} onChange={event => setSplitAmount(event.target.value)} placeholder="Amount" className="min-h-[44px] rounded-xl border-0 bg-[#E9E9EB] px-3 text-sm font-bold text-[#1C1C1E] outline-none" />
                    <button onClick={addSplitPayment} className="min-h-[44px] rounded-full bg-[var(--ios-accent)] px-4 text-sm font-black text-white">{txt(lang, 'Add', 'إضافة')}</button>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>

        <div className="mt-auto flex-shrink-0 border-t border-[#E5E5EA] bg-[#F5F5F7] p-4 pb-6">
          {selected && (
            <div className="rounded-2xl bg-white p-5 shadow-[0px_4px_24px_rgba(0,0,0,0.03),0px_1px_2px_rgba(0,0,0,0.02)]">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--ios-accent)]">Checkout</p>
              <h2 className="mt-1 text-2xl font-black text-[#1C1C1E]">{txt(lang, 'Bill Summary', 'ملخص الفاتورة')}</h2>
              <div className="mt-5 space-y-1">
                <div className="flex w-full items-center justify-between gap-3 py-2"><span className="shrink-0 text-sm font-semibold text-[#8E8E93]">Subtotal</span><span className="min-w-0 truncate text-right font-black text-[#1C1C1E]">SAR {selected.subtotal.toFixed(2)}</span></div>
                <div className="flex w-full items-center justify-between gap-3 py-2"><span className="shrink-0 text-sm font-semibold text-[#8E8E93]">VAT</span><span className="min-w-0 truncate text-right font-black text-[#1C1C1E]">SAR {selected.vat.toFixed(2)}</span></div>
                <div className="flex w-full items-center justify-between gap-3 py-2"><span className="shrink-0 text-sm font-semibold text-[#8E8E93]">Paid</span><span className="min-w-0 truncate text-right font-black text-[#1C1C1E]">SAR {paidAmount.toFixed(2)}</span></div>
              </div>
              <div className="mt-4 flex w-full items-center justify-between gap-3 border-t border-[#E5E5EA] pt-4">
                <span className="shrink-0 text-sm font-black uppercase text-[#8E8E93]">Total</span>
                <span className="min-w-0 truncate text-right text-3xl font-black tracking-tight text-[#1C1C1E]">SAR {selected.total.toFixed(2)}</span>
              </div>
              <div className="mt-4 grid gap-3">
                <button onClick={sendToKitchen} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#E9E9EB] text-sm font-black text-[#1C1C1E]">
                  <QrCode size={18} /> {txt(lang, 'Send to Kitchen', 'إرسال للمطبخ')}
                </button>
                <button onClick={() => saveSelected({ ...selected, status: 'closed', closedAt: Date.now() })} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[var(--ios-accent)] text-sm font-black text-white">
                  <Save size={18} /> {txt(lang, 'Close Tab', 'إغلاق التاب')}
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="flex h-full min-h-0 flex-col overflow-hidden p-4 2xl:p-5">
        {selected ? (
          <>
            <div className="mb-4 shrink-0 rounded-2xl bg-white p-4 shadow-[0px_4px_24px_rgba(0,0,0,0.03),0px_1px_2px_rgba(0,0,0,0.02)] 2xl:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--ios-accent)]">{selected.status.replace(/_/g, ' ')}</p>
                  <h2 className="truncate text-2xl font-black tracking-tight text-[#1C1C1E] 2xl:text-3xl">{selected.tabNumber} - {selected.guestName || txt(lang, 'Guest', 'ضيف')}</h2>
                  <p className="mt-1 text-sm font-semibold text-[#8E8E93]">{selectedTableLabel}</p>
                </div>
                <div className="rounded-2xl bg-[var(--ios-accent-soft)] px-4 py-3 text-right">
                  <p className="text-xs font-black uppercase text-[var(--ios-accent)]">{txt(lang, 'Remaining', 'المتبقي')}</p>
                  <p className="text-xl font-black text-[#1C1C1E]">SAR {remainingAmount.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(300px,0.75fr)]">
              <section className="flex min-h-0 flex-col rounded-2xl bg-white shadow-[0px_4px_24px_rgba(0,0,0,0.03),0px_1px_2px_rgba(0,0,0,0.02)]">
                <div className="shrink-0 border-b border-[#E5E5EA] px-5 py-4">
                  <h3 className="text-xl font-black text-[#1C1C1E]">{txt(lang, 'Active Order Items', 'أصناف الطلب الحالي')}</h3>
                  <p className="text-sm font-semibold text-[#8E8E93]">{selected.items.length} lines</p>
                </div>
                <div className="min-h-0 flex-1 divide-y divide-[#E5E5EA] overflow-y-auto px-5">
                  {selected.items.map((item, index) => {
                    const color = menuColor(item, index);
                    return (
                    <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-4 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-base font-black text-[#1C1C1E]">{item.quantity} x {txt(lang, item.nameEn, item.nameAr)}</p>
                        <p className="mt-1 inline-flex rounded-full px-2 py-1 text-[11px] font-black uppercase tracking-wide" style={{ background: softColor(color, 0.12), color }}>{item.station}</p>
                      </div>
                      <p className="text-right text-sm font-black" style={{ color }}>SAR {(item.unitPrice * item.quantity).toFixed(2)}</p>
                    </div>
                  );
                  })}
                  {selected.items.length === 0 && (
                    <div className="flex h-full min-h-[220px] items-center justify-center text-center">
                      <div>
                        <Table2 className="mx-auto text-[var(--ios-accent)]" size={36} />
                        <p className="mt-3 text-sm font-black text-[#1C1C1E]">{txt(lang, 'Tap menu items to build this tab.', 'اضغط أصناف القائمة لبناء الطلب.')}</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="min-h-0 overflow-y-auto rounded-2xl bg-white p-4 shadow-[0px_4px_24px_rgba(0,0,0,0.03),0px_1px_2px_rgba(0,0,0,0.02)]">
                <h3 className="mb-3 text-xl font-black text-[#1C1C1E]">{txt(lang, 'Menu', 'القائمة')}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {menuItems.map((item, index) => {
                    const color = menuColor(item, index);
                    return (
                    <button
                      key={item.id}
                      onClick={() => addItem(item.id)}
                      className="min-h-[88px] rounded-xl border p-4 text-left transition active:scale-[0.98]"
                      style={{ background: softColor(color, 0.08), borderColor: softColor(color, 0.2) }}
                    >
                      <p className="truncate text-sm font-black text-[#1C1C1E]">{txt(lang, item.nameEn, item.nameAr)}</p>
                      <p className="mt-1 text-[11px] font-black uppercase" style={{ color }}>{item.station}</p>
                      <p className="mt-3 text-base font-black" style={{ color }}>SAR {item.basePrice.toFixed(2)}</p>
                    </button>
                  );
                  })}
                </div>
              </section>
            </div>

          </>
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <Users className="mx-auto text-[var(--ios-accent)]" size={42} />
              <h2 className="mt-4 text-2xl font-black text-[#1C1C1E]">{txt(lang, 'Open a guest tab to start', 'افتح تاب للبدء')}</h2>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default TabOrdering;
