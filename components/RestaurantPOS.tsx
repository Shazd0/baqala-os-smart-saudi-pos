import React, { useMemo, useState } from 'react';
import { Banknote, Check, CreditCard, Flame, Plus, ReceiptText, Search, Send, Trash2, Utensils } from 'lucide-react';
import {
  CartItem,
  Category,
  Customer,
  DiningTable,
  Language,
  MenuItem,
  ModifierGroup,
  OrderType,
  RestaurantOrder,
  RestaurantOrderItem,
  StoreConfig,
  User,
} from '../types';
import { StorageService } from '../services/storageService';
import { calculateRestaurantOrderTotals, getSfdaFlags, orderItemUnitTotal } from '../services/restaurantService';
import { processMadaPayment } from '../services/paymentGateway';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';

interface RestaurantPOSProps {
  customers: Customer[];
  lang: Language;
  shiftOpen: boolean;
  config?: StoreConfig;
  currentUser?: User | null;
  shiftId?: string;
  onCheckout: (
    items: CartItem[],
    method: 'cash' | 'card' | 'credit',
    customerId?: string,
    discount?: number,
    note?: string,
    earnedPoints?: number,
    preCalculated?: { subtotal: number; vat: number; total: number; selectiveTaxAmount: number },
    paymentApprovalReference?: string
  ) => void;
  onChange?: () => void;
}

const orderTypes: Array<{ id: OrderType; en: string; ar: string }> = [
  { id: 'dine_in', en: 'Dine-in', ar: 'داخل المطعم' },
  { id: 'takeaway', en: 'Takeaway', ar: 'استلام' },
  { id: 'delivery', en: 'Delivery', ar: 'توصيل' },
  { id: 'qr_order', en: 'Table QR', ar: 'طلب QR' },
  { id: 'kiosk', en: 'Kiosk', ar: 'كشك ذاتي' },
];

function localized(lang: Language, en: string, ar: string) {
  return lang === 'ar' ? ar : en;
}

const IOS_CATEGORY_COLORS = ['#5856D6', '#30B0C7', '#FF2D55', '#FF9500', '#34C759', '#AF52DE', '#007AFF'];

function categoryColor(seed: string, index = 0) {
  const value = seed.toLowerCase();
  if (/beverage|drink|coffee|juice|مشروب|عصير/.test(value)) return '#30B0C7';
  if (/dessert|sweet|cake|حلى|حلويات/.test(value)) return '#FF2D55';
  if (/grill|shawarma|main|meat|شاورما|مشاوي/.test(value)) return '#FF9500';
  if (/salad|healthy|green|سلطة/.test(value)) return '#34C759';
  return IOS_CATEGORY_COLORS[Math.abs(index) % IOS_CATEGORY_COLORS.length];
}

function colorSoft(hex: string, alpha = 0.1) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toCartItems(items: RestaurantOrderItem[]): CartItem[] {
  return items.map(item => ({
    id: item.id,
    nameEn: item.nameEn,
    nameAr: item.nameAr,
    barcode: '',
    price: orderItemUnitTotal(item),
    category: Category.MISC,
    stock: 9999,
    quantity: item.quantity,
    unit: 'plate',
    selectiveTax: 'none',
  }));
}

function modifierSignature(modifiers: RestaurantOrderItem['modifiers']) {
  return modifiers
    .map(modifier => `${modifier.groupId}:${modifier.optionId}:${modifier.priceDelta}`)
    .sort()
    .join('|');
}

const RestaurantPOS: React.FC<RestaurantPOSProps> = ({ customers, lang, shiftOpen, config, currentUser, shiftId, onCheckout, onChange }) => {
  const { toast } = useToast();
  const [menuItems, setMenuItems] = useState<MenuItem[]>(() => StorageService.getMenuItems());
  const [categories] = useState(() => StorageService.getMenuCategories());
  const [modifierGroups] = useState<ModifierGroup[]>(() => StorageService.getModifierGroups());
  const [tables, setTables] = useState<DiningTable[]>(() => StorageService.getTables());
  const [categoryId, setCategoryId] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [tableId, setTableId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [discount, setDiscount] = useState(0);
  const [note, setNote] = useState('');
  const [items, setItems] = useState<RestaurantOrderItem[]>([]);
  const activeBranchId = StorageService.getActiveBranchId();
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | { type: 'fire' } | { type: 'pay'; method: 'cash' | 'card' }>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);

  const filteredMenu = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return menuItems
      .filter(item => item.active)
      .filter(item => !item.branchIds?.length || item.branchIds.includes(activeBranchId))
      .filter(item => categoryId === 'all' || item.categoryId === categoryId)
      .filter(item => !query || `${item.nameEn} ${item.nameAr}`.toLowerCase().includes(query));
  }, [menuItems, categoryId, activeBranchId, searchTerm]);

  const totals = useMemo(
    () => calculateRestaurantOrderTotals(items, discount, config?.vatRate ?? 0.15),
    [items, discount, config?.vatRate]
  );

  const selectedTable = tables.find(table => table.id === tableId);
  const activeCategoryName = categoryId === 'all'
    ? localized(lang, 'All Items', 'كل الأصناف')
    : localized(
      lang,
      categories.find(category => category.id === categoryId)?.nameEn || 'Menu',
      categories.find(category => category.id === categoryId)?.nameAr || 'القائمة'
    );

  const addMenuItem = (menuItem: MenuItem) => {
    if (!shiftOpen) {
      toast(localized(lang, 'Open a shift before taking orders.', 'افتح الوردية قبل تسجيل الطلبات.'), 'warning');
      return;
    }
    const defaultModifiers = modifierGroups
      .filter(group => menuItem.modifierGroupIds.includes(group.id))
      .flatMap(group => group.options.filter(option => option.defaultSelected).map(option => ({
        groupId: group.id,
        optionId: option.id,
        nameEn: option.nameEn,
        nameAr: option.nameAr,
        priceDelta: option.priceDelta,
        caloriesDelta: option.caloriesDelta,
      })));
    const orderItem: RestaurantOrderItem = {
      id: `ROI-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      menuItemId: menuItem.id,
      nameEn: menuItem.nameEn,
      nameAr: menuItem.nameAr,
      quantity: 1,
      unitPrice: menuItem.basePrice,
      modifiers: defaultModifiers,
      station: menuItem.station,
      status: 'draft',
    };
    setItems(current => {
      const signature = modifierSignature(defaultModifiers);
      const existing = current.find(item =>
        item.menuItemId === menuItem.id &&
        item.status === 'draft' &&
        modifierSignature(item.modifiers) === signature
      );

      if (!existing) {
        return [orderItem, ...current];
      }

      return current.map(item =>
        item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item
      );
    });
    setLastAddedId(menuItem.id);
    window.setTimeout(() => setLastAddedId(current => current === menuItem.id ? null : current), 220);
  };

  const updateQuantity = (id: string, quantity: number) => {
    setItems(current => current.map(item => item.id === id ? { ...item, quantity: Math.max(1, quantity) } : item));
  };

  const saveOrder = async (status: RestaurantOrder['status'], paymentMethod?: 'cash' | 'card' | 'credit') => {
    if (!items.length) {
      toast(localized(lang, 'Add at least one menu item.', 'أضف صنفاً واحداً على الأقل.'), 'warning');
      return;
    }
    if (orderType === 'dine_in' && !tableId) {
      toast(localized(lang, 'Select a dining table.', 'اختر طاولة.'), 'warning');
      return;
    }

    const firedItems = items.map(item => status === 'fired' || status === 'preparing' || status === 'paid'
      ? { ...item, status: 'fired' as const, firedAt: item.firedAt || Date.now() }
      : item);
    let paymentApprovalReference: string | undefined;
    const orderId = `ORD-${Date.now()}`;

    if (status === 'paid' && paymentMethod === 'card') {
      try {
        setPaymentProcessing(true);
        toast(localized(lang, 'Processing card payment...', 'جاري معالجة دفع البطاقة...'), 'loading');
        const gatewayResult = await processMadaPayment(StorageService.getHardwareConfig(), {
          amount: totals.total,
          currency: config?.currency || 'SAR',
          orderId,
          branchId: activeBranchId,
        });
        paymentApprovalReference = gatewayResult.approvalReference || gatewayResult.rrn;
        toast(gatewayResult.message, 'success');
      } catch (error) {
        toast(error instanceof Error ? error.message : localized(lang, 'Card payment failed.', 'فشل دفع البطاقة.'), 'error', 7000);
        setPaymentProcessing(false);
        return;
      } finally {
        setPaymentProcessing(false);
      }
    }

    const order: RestaurantOrder = {
      id: orderId,
      branchId: activeBranchId,
      orderNumber: '',
      orderType,
      status,
      tableId: selectedTable?.id,
      tableLabel: selectedTable?.label,
      customerId: customerId || undefined,
      channel: 'pos',
      items: firedItems,
      subtotal: totals.subtotal,
      discount: totals.discount,
      vat: totals.vat,
      total: totals.total,
      paymentMethod: paymentMethod === 'card' ? 'card' : paymentMethod,
      paymentApprovalReference,
      cashierId: currentUser?.id,
      cashierName: currentUser?.name,
      shiftId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      paidAt: status === 'paid' ? Date.now() : undefined,
      note,
    };
    const saved = StorageService.saveRestaurantOrder(order);
    if (selectedTable) {
      const nextTable = {
        ...selectedTable,
        state: saved.status === 'paid' ? 'dirty' as const : 'occupied' as const,
        activeOrderId: saved.status === 'paid' ? undefined : saved.id,
        updatedAt: Date.now(),
      };
      setTables(current => current.map(table => table.id === nextTable.id ? nextTable : table));
    }

    if (status === 'paid' && paymentMethod) {
      onCheckout(
        toCartItems(firedItems),
        paymentMethod,
        customerId || undefined,
        totals.discount,
        `${saved.orderNumber}${selectedTable ? ` / ${selectedTable.label}` : ''}${note ? ` - ${note}` : ''}`,
        undefined,
        { subtotal: totals.subtotal, vat: totals.vat, total: totals.total, selectiveTaxAmount: 0 },
        paymentApprovalReference
      );
    }

    setItems([]);
    setDiscount(0);
    setNote('');
    setTableId('');
    setMenuItems(StorageService.getMenuItems());
    onChange?.();
    toast(localized(lang, `Order ${saved.orderNumber} saved.`, `تم حفظ الطلب ${saved.orderNumber}.`), 'success');
  };

  const confirmPendingAction = async () => {
    const action = pendingAction;
    setPendingAction(null);
    if (!action) return;
    if (action.type === 'fire') {
      await saveOrder('fired');
      return;
    }
    await saveOrder('paid', action.method);
  };

  return (
    <div className="grid h-full max-h-full min-h-0 grid-cols-1 overflow-hidden bg-[#F2F2F7] text-[#1C1C1E] lg:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
      <section className="flex h-full min-h-0 flex-col overflow-hidden p-3 sm:p-4 2xl:p-5">
        <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#007AFF]">Oasis Dine RMS</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 2xl:text-4xl">{localized(lang, 'Restaurant POS', 'نقطة بيع المطعم')}</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-500">
              {localized(lang, 'Fast dine-in, takeaway, QR, and kitchen-fire ordering in one clean terminal.', 'طلبات سريعة داخل المطعم والاستلام وQR وإرسال المطبخ من شاشة واحدة.')}
            </p>
          </div>
          <div className="flex shrink-0 gap-1 overflow-x-auto rounded-full bg-slate-100 p-1">
            {orderTypes.map(type => (
              <button
                key={type.id}
                onClick={() => setOrderType(type.id)}
                className={`h-10 shrink-0 rounded-full px-4 text-xs font-black transition-all duration-200 active:scale-95 ${orderType === type.id ? 'bg-[#007AFF] text-white shadow-[0_8px_20px_rgba(0,122,255,0.18)]' : 'bg-transparent text-slate-800 hover:bg-white/80'}`}
              >
                {localized(lang, type.en, type.ar)}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3 rounded-[20px] bg-white p-3 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="relative rounded-xl bg-slate-100 transition-all duration-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#007AFF]/20">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder={localized(lang, 'Search menu items...', 'ابحث في القائمة...')}
              className="h-12 w-full rounded-xl border border-transparent bg-transparent pl-11 pr-4 text-sm font-bold text-slate-900 outline-none placeholder:text-[#A9A9A9] focus:border-[#007AFF]"
            />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setCategoryId('all')} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black ${categoryId === 'all' ? 'bg-[var(--ios-accent-soft)] text-[var(--ios-accent)]' : 'bg-[#F2F2F7] text-[var(--ios-secondary)]'}`}>
              {localized(lang, 'All', 'الكل')}
            </button>
            {categories.map((category, index) => {
              const color = categoryColor(`${category.nameEn} ${category.nameAr}`, index);
              const active = categoryId === category.id;
              return (
                <button
                  key={category.id}
                  onClick={() => setCategoryId(category.id)}
                  className="shrink-0 rounded-full px-4 py-2 text-xs font-black transition"
                  style={{ background: active ? color : '#F2F2F7', color: active ? '#FFFFFF' : '#1C1C1E' }}
                >
                  {localized(lang, category.nameEn, category.nameAr)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-950 2xl:text-2xl">{activeCategoryName}</h2>
            <p className="text-sm font-semibold text-slate-500">{filteredMenu.length} {localized(lang, 'items available', 'صنف متاح')}</p>
          </div>
          <span className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-500 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
            {items.length} {localized(lang, 'in ticket', 'في الطلب')}
          </span>
        </div>

        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto pb-6 md:grid-cols-3 xl:grid-cols-4 2xl:gap-4">
          {filteredMenu.map(menuItem => {
            const sfda = getSfdaFlags(menuItem.nutrition);
            const added = items.some(item => item.menuItemId === menuItem.id);
            const justAdded = lastAddedId === menuItem.id;
            return (
              <button
                key={menuItem.id}
                onClick={() => addMenuItem(menuItem)}
                className={`group relative overflow-hidden rounded-2xl border-[1.5px] bg-white text-left shadow-[0_4px_20px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.01)] transition-all duration-150 active:scale-[0.97] ${added ? 'border-blue-600' : 'border-transparent'}`}
              >
                {added && (
                  <span className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.24)]">
                    <Check size={15} strokeWidth={3} />
                  </span>
                )}
                {(menuItem.images?.[0] || menuItem.image) ? (
                  <div className="h-28 overflow-hidden rounded-t-2xl bg-slate-100 2xl:h-32">
                    <img src={menuItem.images?.[0] || menuItem.image} alt={localized(lang, menuItem.nameEn, menuItem.nameAr)} className="h-28 w-full object-cover transition duration-200 group-hover:scale-105 2xl:h-32" />
                  </div>
                ) : (
                  <div className="flex h-28 items-center justify-center rounded-t-2xl bg-slate-100 text-slate-400 2xl:h-32">
                    <Utensils size={28} />
                  </div>
                )}
                <div className="p-3 2xl:p-3.5">
                  <h3 className="mb-1 line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-tight tracking-tight text-slate-900">
                    {localized(lang, menuItem.nameEn, menuItem.nameAr)}
                  </h3>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-base font-bold text-blue-600">{menuItem.basePrice.toFixed(2)} SAR</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{menuItem.nutrition.caloriesKcal} kcal</span>
                    <span className="px-1 py-1 text-xs font-semibold text-slate-400">
                      {localized(lang, `${sfda.burn.walking} min walk`, `${sfda.burn.walking} د مشي`)}
                    </span>
                  </div>
                  {justAdded && <span className="sr-only">{localized(lang, 'Recently added', 'أضيف مؤخراً')}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="fixed inset-x-0 bottom-0 z-20 max-h-[72vh] overflow-hidden rounded-t-[28px] border-t border-slate-200/60 bg-white/95 text-slate-950 shadow-[0_-12px_40px_rgba(0,0,0,0.08)] backdrop-blur-xl lg:static lg:flex lg:h-full lg:max-h-none lg:flex-col lg:rounded-none lg:border-l lg:border-slate-200/60 lg:border-t-0 lg:bg-white lg:shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200/70 p-4 2xl:p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#007AFF]">Live Ticket</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 2xl:text-2xl">{localized(lang, 'Active Check', 'الطلب الحالي')}</h2>
          </div>
          <div className="rounded-2xl bg-blue-50 p-3 text-[#007AFF]">
            <ReceiptText size={22} />
          </div>
        </div>

        <div className="shrink-0 space-y-3 border-b border-slate-200/70 p-4 2xl:p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="ios-field">
              <label className="ios-label">{localized(lang, 'Table', 'الطاولة')}</label>
              <select value={tableId} onChange={event => setTableId(event.target.value)} className="ios-input">
                <option value="">{localized(lang, 'Select table', 'اختر الطاولة')}</option>
                {tables.map(table => <option key={table.id} value={table.id}>{table.label} - {table.state}</option>)}
              </select>
            </div>
            <div className="ios-field">
              <label className="ios-label">{localized(lang, 'Guest', 'الضيف')}</label>
              <select value={customerId} onChange={event => setCustomerId(event.target.value)} className="ios-input">
                <option value="">{localized(lang, 'Walk-in', 'ضيف مباشر')}</option>
                {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 2xl:px-5">
          {items.length === 0 && (
            <div className="my-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <Plus className="mx-auto mb-3 text-slate-300" size={34} />
              <p className="text-sm font-black text-slate-700">{localized(lang, 'Tap items to build the check.', 'اضغط الأصناف لبناء الطلب.')}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">{localized(lang, 'The ticket updates instantly.', 'يتحدث الطلب فوراً.')}</p>
            </div>
          )}
          {items.map(item => (
            <div key={item.id} className="border-b border-slate-200/70 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black text-slate-900">{localized(lang, item.nameEn, item.nameAr)}</h3>
                  <p className="text-xs font-semibold text-slate-500">{item.station}</p>
                </div>
                <button onClick={() => setItems(current => current.filter(existing => existing.id !== item.id))} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFECEA] text-[#FF3B30]">
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2 rounded-xl bg-[#F2F2F7] p-1">
                  <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="h-8 w-8 rounded-lg bg-white text-sm font-black text-[var(--ios-text)]">-</button>
                  <span className="w-8 text-center text-sm font-black">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="h-8 w-8 rounded-lg bg-white text-sm font-black text-[var(--ios-text)]">+</button>
                </div>
                <span className="text-sm font-black text-slate-900">{(orderItemUnitTotal(item) * item.quantity).toFixed(2)} SAR</span>
              </div>
            </div>
          ))}
        </div>

        <div className="shrink-0 border-t border-slate-200/70 bg-white p-4 shadow-[0_-8px_28px_rgba(0,0,0,0.03)] 2xl:p-5">
          <div className="mb-3 grid grid-cols-[1fr_110px] gap-3">
            <textarea value={note} onChange={event => setNote(event.target.value)} placeholder={localized(lang, 'Kitchen note', 'ملاحظة المطبخ')} className="ios-input h-16 resize-none" />
            <input type="number" min={0} value={discount} onChange={event => setDiscount(Number(event.target.value))} placeholder="Discount" className="ios-input" />
          </div>
          <div className="mb-4 rounded-2xl bg-slate-50 p-4">
            <div className="flex items-center justify-between py-1.5 text-sm font-semibold text-slate-500"><span>Subtotal</span><span>{totals.subtotal.toFixed(2)} SAR</span></div>
            <div className="flex items-center justify-between py-1.5 text-sm font-semibold text-slate-500"><span>VAT</span><span>{totals.vat.toFixed(2)} SAR</span></div>
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-sm font-black uppercase text-slate-500">Total</span>
              <span className="text-2xl font-extrabold tracking-tight text-slate-900">{totals.total.toFixed(2)} SAR</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setPendingAction({ type: 'fire' })} className="col-span-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-[#007AFF] text-sm font-semibold tracking-tight text-white shadow-[0_10px_24px_rgba(0,122,255,0.18)] transition-all duration-200 active:scale-[0.97]">
              <Send size={18} /> {localized(lang, 'Send to Kitchen', 'إرسال للمطبخ')}
            </button>
            <button onClick={() => setPendingAction({ type: 'pay', method: 'cash' })} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#34C759] text-sm font-semibold tracking-tight text-white shadow-[0_10px_24px_rgba(52,199,89,0.16)] transition-all duration-200 active:scale-[0.97]">
              <Banknote size={18} /> Cash
            </button>
            <button onClick={() => setPendingAction({ type: 'pay', method: 'card' })} disabled={paymentProcessing} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#30B0C7] text-sm font-semibold tracking-tight text-white shadow-[0_10px_24px_rgba(48,176,199,0.16)] transition-all duration-200 active:scale-[0.97] disabled:opacity-70">
              <CreditCard size={18} /> {paymentProcessing ? localized(lang, 'Processing', 'جاري الدفع') : 'Card'}
            </button>
          </div>
        </div>
      </aside>
      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction?.type === 'fire' ? localized(lang, 'Send order to kitchen?', 'إرسال الطلب للمطبخ؟') : localized(lang, 'Confirm payment?', 'تأكيد الدفع؟')}
        message={pendingAction?.type === 'fire'
          ? localized(lang, 'This will create kitchen tickets and lock this check into service.', 'سيتم إنشاء تذاكر المطبخ وتثبيت الطلب في الخدمة.')
          : localized(lang, `This will close the check as ${pendingAction?.method || ''} payment for ${totals.total.toFixed(2)} SAR.`, `سيتم إغلاق الطلب كدفع ${pendingAction?.method || ''} بقيمة ${totals.total.toFixed(2)} ريال.`)}
        confirmLabel={pendingAction?.type === 'fire' ? localized(lang, 'Yes, send', 'نعم، أرسل') : localized(lang, 'Yes, pay', 'نعم، ادفع')}
        cancelLabel={localized(lang, 'No, cancel', 'لا، إلغاء')}
        onConfirm={confirmPendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
};

export default RestaurantPOS;
