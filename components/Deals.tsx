/**
 * Deals & Promotions Manager
 * Create bundle deals like "3 for 10 SAR" or "Buy 2 Get 1 Free" or "20% off"
 * These are applied automatically at POS checkout.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  AlarmClock, Check, CheckCircle2, Clock, Gift, Package, PauseCircle,
  Pencil, Percent, Plus, RotateCcw, Search, ShoppingBasket, Sparkles, Tag, Trash2, X,
} from 'lucide-react';
import { Deal, Product, Language } from '../types';
import { StorageService } from '../services/storageService';
import { useToast } from './Toast';
import { firstError, positiveNumber, requiredText } from '../services/validationService';
import ConfirmDialog from './ConfirmDialog';

interface Props { lang: Language; products: Product[]; }

type StatusFilter = 'all' | 'active' | 'paused' | 'expired';

interface FormState {
  nameAr: string;
  nameEn: string;
  type: Deal['type'];
  productId: string;
  minQty: number;
  bundlePrice: number;
  freeQty: number;
  percentOff: number;
  active: boolean;
  /** yyyy-mm-dd, empty string = never expires */
  expiresOn: string;
}

const DAY_MS = 86_400_000;
const CARD = 'rounded-2xl border border-[var(--ios-divider)] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]';

const empty = (): FormState => ({
  nameAr: '', nameEn: '', type: 'bundle_price',
  productId: '', minQty: 3, bundlePrice: 10,
  freeQty: 1, percentOff: 10, active: true,
  expiresOn: '',
});

/** Timestamp -> yyyy-mm-dd using the LOCAL calendar day (never UTC). */
function toDateInput(timestamp?: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * yyyy-mm-dd -> end of that LOCAL day, so a deal stays valid until local midnight.
 * `new Date('2026-08-17')` would parse as UTC midnight and expire the deal early.
 */
function endOfLocalDay(value: string): number | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

const Deals: React.FC<Props> = ({ lang, products }) => {
  const ar = lang === 'ar';
  const { toast } = useToast();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const canDelete = StorageService.hasPermission('manage_settings');

  useEffect(() => { setDeals(StorageService.getDeals()); }, []);

  const currency = ar ? 'ر.س' : 'SAR';

  const productOf = (productId?: string) => products.find(p => p.id === productId);
  const productName = (productId?: string) => {
    if (!productId) return ar ? 'كل المنتجات' : 'All products';
    const product = productOf(productId);
    if (!product) return productId;
    return (ar ? product.nameAr || product.nameEn : product.nameEn || product.nameAr) || productId;
  };
  const dealName = (deal: Deal) =>
    (ar ? deal.nameAr || deal.nameEn : deal.nameEn || deal.nameAr) || (ar ? 'عرض بدون اسم' : 'Untitled deal');

  const isExpired = (deal: Deal) => !!deal.expiresAt && deal.expiresAt < Date.now();

  const stats = useMemo(() => {
    const now = Date.now();
    const expired = deals.filter(d => !!d.expiresAt && d.expiresAt < now);
    const live = deals.filter(d => !d.expiresAt || d.expiresAt >= now);
    return {
      total: deals.length,
      active: live.filter(d => d.active).length,
      paused: live.filter(d => !d.active).length,
      expired: expired.length,
      expiringSoon: live.filter(d => !!d.expiresAt && d.expiresAt <= now + 7 * DAY_MS).length,
    };
  }, [deals]);

  const visibleDeals = useMemo(() => {
    const query = search.trim().toLowerCase();
    return deals.filter(deal => {
      const expired = isExpired(deal);
      if (status === 'active' && (!deal.active || expired)) return false;
      if (status === 'paused' && (deal.active || expired)) return false;
      if (status === 'expired' && !expired) return false;
      if (!query) return true;
      const product = productOf(deal.productId);
      const haystack = [
        deal.nameAr, deal.nameEn,
        product?.nameAr, product?.nameEn, product?.barcode,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [deals, search, status, products]);

  const filtersDirty = !!search.trim() || status !== 'all';

  const clearFilters = () => { setSearch(''); setStatus('all'); };

  const openCreate = () => { setEditingId(null); setForm(empty()); setShowForm(true); };

  const openEdit = (deal: Deal) => {
    setEditingId(deal.id);
    setForm({
      nameAr: deal.nameAr || '',
      nameEn: deal.nameEn || '',
      type: deal.type,
      productId: deal.productId || '',
      minQty: deal.minQty ?? 1,
      bundlePrice: deal.bundlePrice ?? 0,
      freeQty: deal.freeQty ?? 1,
      percentOff: deal.percentOff ?? 0,
      active: deal.active,
      expiresOn: toDateInput(deal.expiresAt),
    });
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(empty()); };

  const handleSave = () => {
    const error = firstError(
      requiredText(form.nameAr || form.nameEn, 'Deal name'),
      positiveNumber(form.minQty, 'Minimum quantity'),
      form.type === 'bundle_price' ? positiveNumber(form.bundlePrice, 'Bundle price') : '',
      form.type === 'buy_x_get_y' ? positiveNumber(form.freeQty, 'Free quantity') : '',
      form.type === 'percent_off' ? positiveNumber(form.percentOff, 'Discount percent') : ''
    );
    if (error) { toast(ar ? `تحقق من العرض: ${error}` : error, 'error'); return; }
    if (form.type === 'percent_off' && Number(form.percentOff) > 100) {
      toast(ar ? 'نسبة الخصم لا يمكن أن تتجاوز 100%' : 'Discount percent cannot exceed 100%.', 'error'); return;
    }

    const original = editingId ? deals.find(d => d.id === editingId) : undefined;
    const payload: Deal = {
      id: original?.id ?? editingId ?? 'DEAL-' + Date.now(),
      createdAt: original?.createdAt ?? Date.now(),
      nameAr: form.nameAr.trim(),
      nameEn: form.nameEn.trim(),
      type: form.type,
      productId: form.productId,
      categoryId: original?.categoryId,
      minQty: Number(form.minQty),
      freeQty: Number(form.freeQty),
      bundlePrice: Number(form.bundlePrice),
      percentOff: Number(form.percentOff),
      active: form.active,
      expiresAt: endOfLocalDay(form.expiresOn),
    };

    setDeals(StorageService.saveDeal(payload));
    const wasEditing = !!editingId;
    closeForm();
    toast(
      wasEditing
        ? (ar ? 'تم تحديث العرض' : 'Deal updated!')
        : (ar ? 'تم حفظ العرض' : 'Deal saved!'),
      'success'
    );
  };

  const handleDelete = (id: string) => {
    if (!canDelete) { toast(ar ? 'الحذف مسموح للمدير فقط' : 'Only administrator can delete.', 'error'); return; }
    setDeals(StorageService.deleteDeal(id));
    setDeleteId(null);
    toast(ar ? 'تم حذف العرض' : 'Deal removed', 'info');
  };

  const toggleActive = (deal: Deal) => {
    setDeals(StorageService.saveDeal({ ...deal, active: !deal.active }));
    toast(
      deal.active
        ? (ar ? 'تم إيقاف العرض مؤقتاً' : 'Deal paused')
        : (ar ? 'تم تشغيل العرض' : 'Deal activated'),
      'info'
    );
  };

  const typeMeta = (type: Deal['type']) => {
    if (type === 'bundle_price') {
      return {
        icon: <Package size={13} />,
        label: ar ? 'سعر مجموعة' : 'Bundle Price',
        chip: 'bg-blue-50 text-blue-700 border-blue-100',
        tint: 'bg-blue-50 text-blue-600',
      };
    }
    if (type === 'buy_x_get_y') {
      return {
        icon: <Gift size={13} />,
        label: ar ? 'اشتر وخذ' : 'Buy X Get Y',
        chip: 'bg-purple-50 text-purple-700 border-purple-100',
        tint: 'bg-purple-50 text-purple-600',
      };
    }
    return {
      icon: <Percent size={13} />,
      label: ar ? 'نسبة خصم' : 'Percent Off',
      chip: 'bg-amber-50 text-amber-700 border-amber-100',
      tint: 'bg-amber-50 text-amber-600',
    };
  };

  /** Big human-readable one-liner, e.g. "3 for 10.00 SAR" */
  const dealMaths = (deal: Deal) => {
    if (deal.type === 'bundle_price') {
      return ar
        ? `${deal.minQty} بـ ${(deal.bundlePrice ?? 0).toFixed(2)} ${currency}`
        : `${deal.minQty} for ${(deal.bundlePrice ?? 0).toFixed(2)} ${currency}`;
    }
    if (deal.type === 'buy_x_get_y') {
      return ar
        ? `اشتر ${deal.minQty} واحصل على ${deal.freeQty ?? 1} مجاناً`
        : `Buy ${deal.minQty} Get ${deal.freeQty ?? 1} Free`;
    }
    return ar ? `خصم ${deal.percentOff ?? 0}%` : `${deal.percentOff ?? 0}% Off`;
  };

  const statCards = [
    {
      key: 'total',
      icon: <Tag size={18} />,
      value: stats.total,
      label: ar ? 'إجمالي العروض' : 'Total deals',
      tint: 'bg-[var(--ios-accent-soft)] text-[var(--ios-accent)]',
    },
    {
      key: 'active',
      icon: <Sparkles size={18} />,
      value: stats.active,
      label: ar ? 'عروض نشطة' : 'Active now',
      tint: 'bg-emerald-50 text-emerald-600',
    },
    {
      key: 'paused',
      icon: <PauseCircle size={18} />,
      value: stats.paused,
      label: ar ? 'موقوفة مؤقتاً' : 'Paused',
      tint: 'bg-slate-100 text-slate-500',
    },
    {
      key: 'expiring',
      icon: <AlarmClock size={18} />,
      value: stats.expiringSoon,
      label: ar ? 'تنتهي خلال ٧ أيام' : 'Expiring in 7 days',
      tint: 'bg-amber-50 text-amber-600',
    },
  ];

  const statusPills: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: 'all', label: ar ? 'الكل' : 'All', count: stats.total },
    { key: 'active', label: ar ? 'نشطة' : 'Active', count: stats.active },
    { key: 'paused', label: ar ? 'موقوفة' : 'Paused', count: stats.paused },
    { key: 'expired', label: ar ? 'منتهية' : 'Expired', count: stats.expired },
  ];

  const typeOptions: Deal['type'][] = ['bundle_price', 'buy_x_get_y', 'percent_off'];

  return (
    <div className="h-full overflow-y-auto bg-[var(--ios-bg)] p-4 sm:p-6" dir={ar ? 'rtl' : 'ltr'}>
      <div className="animate-tab-in w-full">

        {/* ── Header ───────────────────────────────────────────────── */}
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ios-accent)]">
              {ar ? 'التسويق والعروض' : 'Marketing & Offers'}
            </p>
            <h1 className="ios-title mt-2 text-3xl sm:text-4xl">
              {ar ? 'العروض والخصومات' : 'Deals & Promotions'}
            </h1>
            <p className="ios-subtitle mt-2 max-w-2xl text-sm">
              {ar
                ? 'أنشئ عروضاً مثل «٣ بـ ١٠ ريال» أو «اشتر ٢ واحصل على ١ مجاناً». تُطبَّق تلقائياً على نقطة البيع عند الدفع.'
                : 'Build offers like “3 for 10 SAR” or “Buy 2 Get 1 Free”. They apply automatically at POS checkout.'}
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="btn-spring inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--ios-accent)] px-5 py-3 text-sm font-bold text-white shadow-[0_12px_30px_rgba(30,107,72,0.22)] hover:bg-[#18583b]"
          >
            <Plus size={18} /> {ar ? 'عرض جديد' : 'New Deal'}
          </button>
        </header>

        {/* ── Stat summary cards ───────────────────────────────────── */}
        <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {statCards.map(card => (
            <div key={card.key} className={`${CARD} p-4`}>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.tint}`}>
                {card.icon}
              </div>
              <p className="mt-3 text-2xl font-black leading-none text-[var(--ios-text)] sm:text-3xl">
                {card.value}
              </p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ios-tertiary)] sm:text-[11px]">
                {card.label}
              </p>
            </div>
          ))}
        </section>

        {/* ── Filters ──────────────────────────────────────────────── */}
        <section className={`${CARD} mb-5 flex flex-col gap-3 p-3 sm:p-4`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--ios-tertiary)] ltr:left-3.5 rtl:right-3.5"
              />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={ar ? 'ابحث باسم العرض أو المنتج…' : 'Search by deal or product name…'}
                aria-label={ar ? 'بحث في العروض' : 'Search deals'}
                className="ios-input ltr:pl-10 rtl:pr-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {statusPills.map(pill => {
                const selected = status === pill.key;
                return (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => setStatus(pill.key)}
                    aria-pressed={selected}
                    className={`h-10 rounded-xl px-3 text-xs font-bold transition-colors ${
                      selected
                        ? 'bg-[var(--ios-accent)] text-white'
                        : 'bg-[var(--ios-fill)] text-[var(--ios-secondary)] hover:text-[var(--ios-text)]'
                    }`}
                  >
                    {pill.label}
                    <span className={selected ? 'opacity-80' : 'opacity-60'}> · {pill.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ios-divider)] pt-3">
            <p className="text-xs font-semibold text-[var(--ios-secondary)]">
              {ar
                ? `يتم عرض ${visibleDeals.length} من ${stats.total} عرض`
                : `Showing ${visibleDeals.length} of ${stats.total} deal${stats.total === 1 ? '' : 's'}`}
            </p>
            {filtersDirty && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--ios-fill)] px-3 text-xs font-bold text-[var(--ios-secondary)] hover:text-[var(--ios-text)]"
              >
                <RotateCcw size={13} /> {ar ? 'مسح عوامل التصفية' : 'Clear filters'}
              </button>
            )}
          </div>
        </section>

        {/* ── Deals grid / empty states ─────────────────────────────── */}
        {stats.total === 0 ? (
          <div className={`${CARD} flex flex-col items-center justify-center px-6 py-16 text-center`}>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--ios-accent-soft)] text-[var(--ios-accent)]">
              <Tag size={30} />
            </div>
            <h2 className="mt-5 text-xl font-bold text-[var(--ios-text)]">
              {ar ? 'لا توجد عروض بعد' : 'No deals yet'}
            </h2>
            <p className="ios-subtitle mt-2 max-w-sm text-sm">
              {ar
                ? 'أضف أول عرض لجذب المزيد من الزبائن وزيادة متوسط قيمة السلة.'
                : 'Add your first deal to attract more customers and lift your average basket size.'}
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="btn-spring mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--ios-accent)] px-5 py-3 text-sm font-bold text-white shadow-[0_12px_30px_rgba(30,107,72,0.22)] hover:bg-[#18583b]"
            >
              <Plus size={17} /> {ar ? 'إنشاء أول عرض' : 'Create your first deal'}
            </button>
          </div>
        ) : visibleDeals.length === 0 ? (
          <div className={`${CARD} flex flex-col items-center justify-center px-6 py-16 text-center`}>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--ios-fill)] text-[var(--ios-secondary)]">
              <Search size={28} />
            </div>
            <h2 className="mt-5 text-xl font-bold text-[var(--ios-text)]">
              {ar ? 'لا توجد عروض مطابقة للتصفية' : 'No deals match your filters'}
            </h2>
            <p className="ios-subtitle mt-2 max-w-sm text-sm">
              {ar
                ? 'جرّب تعديل كلمة البحث أو اختر حالة مختلفة.'
                : 'Try a different search term, or pick another status.'}
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="btn-spring mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--ios-accent-soft)] px-5 py-3 text-sm font-bold text-[var(--ios-accent)]"
            >
              <RotateCcw size={16} /> {ar ? 'مسح عوامل التصفية' : 'Clear filters'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleDeals.map(deal => {
              const meta = typeMeta(deal.type);
              const expired = isExpired(deal);
              const linked = productOf(deal.productId);
              const bundlePrice = deal.bundlePrice ?? 0;
              const minQty = deal.minQty || 1;
              const perUnit = deal.type === 'bundle_price' ? bundlePrice / minQty : 0;
              const savings = deal.type === 'bundle_price' && linked
                ? linked.price * minQty - bundlePrice
                : 0;
              const expiringSoon = !expired && !!deal.expiresAt && deal.expiresAt <= Date.now() + 7 * DAY_MS;

              return (
                <article
                  key={deal.id}
                  className={`${CARD} flex flex-col gap-3.5 p-4 transition-opacity ${expired ? 'opacity-60 saturate-50' : ''}`}
                >
                  {/* Type ribbon + on/off switch */}
                  <div className="flex items-start justify-between gap-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${meta.chip}`}>
                      {meta.icon} {meta.label}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wide ${deal.active && !expired ? 'text-[var(--ios-accent)]' : 'text-[var(--ios-tertiary)]'}`}>
                        {expired
                          ? (ar ? 'منتهي' : 'Ended')
                          : deal.active ? (ar ? 'نشط' : 'On') : (ar ? 'موقوف' : 'Off')}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={deal.active}
                        aria-label={
                          deal.active
                            ? (ar ? `إيقاف العرض ${dealName(deal)}` : `Pause deal ${dealName(deal)}`)
                            : (ar ? `تشغيل العرض ${dealName(deal)}` : `Activate deal ${dealName(deal)}`)
                        }
                        onClick={() => toggleActive(deal)}
                        className="icon-btn relative h-7 w-[52px] border"
                        style={{
                          borderRadius: 999,
                          background: deal.active ? 'var(--ios-accent)' : '#dce5df',
                          borderColor: deal.active ? 'var(--ios-accent)' : '#cbd6cf',
                        }}
                      >
                        <span
                          className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all duration-200 ease-out"
                          style={ar
                            ? { right: deal.active ? 28 : 3 }
                            : { left: deal.active ? 28 : 3 }}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Name + deal maths */}
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold text-[var(--ios-text)]" title={dealName(deal)}>
                      {dealName(deal)}
                    </h2>
                    <p className="mt-1.5 break-words text-xl font-black leading-tight text-[var(--ios-accent)]">
                      {dealMaths(deal)}
                    </p>
                  </div>

                  {/* Scope + economics chips */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ${
                      deal.productId
                        ? 'bg-[var(--ios-fill)] text-[var(--ios-secondary)]'
                        : 'bg-[var(--ios-accent-soft)] text-[var(--ios-accent)]'
                    }`}>
                      <ShoppingBasket size={12} className="shrink-0" />
                      <span className="truncate">{productName(deal.productId)}</span>
                    </span>
                    {deal.type === 'bundle_price' && minQty > 0 && (
                      <span className="inline-flex items-center rounded-lg bg-[var(--ios-fill)] px-2 py-1 text-[11px] font-semibold text-[var(--ios-secondary)]">
                        {ar ? `${perUnit.toFixed(2)} ${currency} للحبة` : `${perUnit.toFixed(2)} ${currency} each`}
                      </span>
                    )}
                    {savings > 0 && (
                      <span className="inline-flex items-center rounded-lg bg-[var(--ios-accent-soft)] px-2 py-1 text-[11px] font-bold text-[var(--ios-accent)]">
                        {ar ? `توفير ${savings.toFixed(2)} ${currency}` : `Saves ${savings.toFixed(2)} ${currency}`}
                      </span>
                    )}
                  </div>

                  {/* Expiry */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--ios-divider)] pt-3">
                    <Clock size={13} className="shrink-0 text-[var(--ios-tertiary)]" />
                    <span className="text-xs font-semibold text-[var(--ios-secondary)]">
                      {deal.expiresAt
                        ? `${ar ? 'ينتهي' : 'Expires'}: ${new Date(deal.expiresAt).toLocaleDateString(ar ? 'ar-SA' : 'en-US')}`
                        : (ar ? 'بدون تاريخ انتهاء' : 'No expiry date')}
                    </span>
                    {expired && (
                      <span className="inline-flex items-center rounded-md bg-[#fdecea] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#C2412D]">
                        {ar ? 'منتهي الصلاحية' : 'Expired'}
                      </span>
                    )}
                    {expiringSoon && (
                      <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                        {ar ? 'ينتهي قريباً' : 'Ending soon'}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(deal)}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--ios-fill)] text-xs font-bold text-[var(--ios-text)] hover:bg-[#dfe8e3]"
                    >
                      <Pencil size={13} /> {ar ? 'تعديل' : 'Edit'}
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setDeleteId(deal.id)}
                        aria-label={ar ? `حذف العرض ${dealName(deal)}` : `Delete deal ${dealName(deal)}`}
                        title={ar ? 'حذف' : 'Delete'}
                        className="icon-btn icon-btn-danger h-9 w-9"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create / Edit modal ───────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl"
            dir={ar ? 'rtl' : 'ltr'}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-2xl bg-gradient-to-r from-[#1E6B48] to-[#2f7a5a] p-5 text-white">
              <div className="min-w-0">
                <h3 className="text-lg font-black">
                  {editingId ? (ar ? 'تعديل العرض' : 'Edit Deal') : (ar ? 'عرض جديد' : 'New Deal')}
                </h3>
                <p className="mt-0.5 text-xs text-white/80">
                  {ar ? 'يُطبَّق تلقائياً على نقطة البيع' : 'Applied automatically at checkout'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                aria-label={ar ? 'إغلاق' : 'Close'}
                className="icon-btn h-9 w-9 shrink-0 text-white"
                style={{ background: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.24)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="ios-field">
                  <label className="ios-label">{ar ? 'الاسم بالعربي' : 'Arabic name'}</label>
                  <input
                    value={form.nameAr}
                    onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))}
                    className="ios-input"
                    placeholder="٣ بـ ١٠ ريال"
                    dir="rtl"
                  />
                </div>
                <div className="ios-field">
                  <label className="ios-label">{ar ? 'الاسم بالإنجليزي' : 'English name'}</label>
                  <input
                    value={form.nameEn}
                    onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
                    className="ios-input"
                    placeholder="3 for 10 SAR"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="ios-field">
                <label className="ios-label">{ar ? 'نوع العرض' : 'Deal type'}</label>
                <div className="grid grid-cols-3 gap-2">
                  {typeOptions.map(type => {
                    const meta = typeMeta(type);
                    const selected = form.type === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, type }))}
                        aria-pressed={selected}
                        className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-1 py-3 text-[11px] font-bold leading-tight transition-colors ${
                          selected
                            ? 'border-[var(--ios-accent)] bg-[var(--ios-accent-soft)] text-[var(--ios-accent)]'
                            : 'border-[var(--ios-divider)] bg-white text-[var(--ios-secondary)] hover:border-[var(--ios-tertiary)]'
                        }`}
                      >
                        {meta.icon}
                        <span className="text-center">{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="ios-field">
                <label className="ios-label">{ar ? 'المنتج (اختياري)' : 'Product (optional)'}</label>
                <select
                  value={form.productId}
                  onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
                  className="ios-input"
                >
                  <option value="">{ar ? 'كل المنتجات' : 'All products'}</option>
                  {products.map(product => (
                    <option key={product.id} value={product.id}>
                      {ar ? product.nameAr || product.nameEn : product.nameEn || product.nameAr}
                    </option>
                  ))}
                </select>
                <p className="ios-help">
                  {ar ? 'اترك «كل المنتجات» لتطبيق العرض على السلة بالكامل.' : 'Leave on “All products” to apply the deal store-wide.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="ios-field">
                  <label className="ios-label">{ar ? 'الكمية المطلوبة' : 'Min qty'}</label>
                  <input
                    type="number"
                    min="1"
                    value={form.minQty}
                    onChange={e => setForm(f => ({ ...f, minQty: parseInt(e.target.value, 10) || 1 }))}
                    className="ios-input"
                  />
                </div>
                {form.type === 'bundle_price' && (
                  <div className="ios-field">
                    <label className="ios-label">{ar ? 'السعر الكلي (ر.س)' : 'Bundle price (SAR)'}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={form.bundlePrice}
                      onChange={e => setForm(f => ({ ...f, bundlePrice: parseFloat(e.target.value) || 0 }))}
                      className="ios-input"
                    />
                  </div>
                )}
                {form.type === 'buy_x_get_y' && (
                  <div className="ios-field">
                    <label className="ios-label">{ar ? 'الكمية المجانية' : 'Free qty'}</label>
                    <input
                      type="number"
                      min="1"
                      value={form.freeQty}
                      onChange={e => setForm(f => ({ ...f, freeQty: parseInt(e.target.value, 10) || 1 }))}
                      className="ios-input"
                    />
                  </div>
                )}
                {form.type === 'percent_off' && (
                  <div className="ios-field">
                    <label className="ios-label">{ar ? 'نسبة الخصم %' : 'Discount %'}</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={form.percentOff}
                      onChange={e => setForm(f => ({ ...f, percentOff: parseFloat(e.target.value) || 0 }))}
                      className="ios-input"
                    />
                  </div>
                )}
              </div>

              <div className="ios-field">
                <label className="ios-label">{ar ? 'ينتهي في (اختياري)' : 'Expires on (optional)'}</label>
                <input
                  type="date"
                  value={form.expiresOn}
                  onChange={e => setForm(f => ({ ...f, expiresOn: e.target.value }))}
                  className="ios-input"
                />
                <p className="ios-help">
                  {form.expiresOn
                    ? (ar ? 'يبقى العرض سارياً حتى نهاية هذا اليوم بالتوقيت المحلي.' : 'Stays valid until the end of that local day.')
                    : (ar ? 'اتركه فارغاً ليعمل العرض بدون تاريخ انتهاء.' : 'Leave empty for a deal that never expires.')}
                </p>
              </div>

              <label className="flex items-center justify-between gap-3 rounded-xl bg-[var(--ios-fill)] p-3">
                <span className="min-w-0">
                  <span className="ios-label block">{ar ? 'تشغيل العرض الآن' : 'Activate this deal'}</span>
                  <span className="ios-help block">
                    {ar ? 'العروض الموقوفة لا تُطبَّق على نقطة البيع.' : 'Paused deals are ignored at checkout.'}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                  className="h-5 w-5 shrink-0 accent-[var(--ios-accent)]"
                />
              </label>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 rounded-xl border border-[var(--ios-divider)] bg-white py-2.5 text-sm font-bold text-[var(--ios-secondary)]"
                >
                  {ar ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="btn-spring flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--ios-accent)] py-2.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(30,107,72,0.22)] hover:bg-[#18583b]"
                >
                  {editingId ? <Check size={16} /> : <CheckCircle2 size={16} />}
                  {editingId ? (ar ? 'تحديث العرض' : 'Update Deal') : (ar ? 'حفظ العرض' : 'Save Deal')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title={ar ? 'حذف العرض؟' : 'Delete deal?'}
        message={ar ? 'سيتم حذف هذا العرض من النظام. هل تريد المتابعة؟' : 'This deal will be deleted. Continue?'}
        confirmLabel={ar ? 'حذف' : 'Delete'}
        cancelLabel={ar ? 'إلغاء' : 'Cancel'}
        danger
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
};

export default Deals;
