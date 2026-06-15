/**
 * Deals & Promotions Manager
 * Create bundle deals like "3 for 10 SAR" or "Buy 2 Get 1 Free" or "20% off"
 * These are applied automatically at POS checkout.
 */
import React, { useState, useEffect } from 'react';
import { Plus, Tag, Trash2, X, CheckCircle2, Percent, Gift, Package } from 'lucide-react';
import { Deal, Product, Language } from '../types';
import { StorageService } from '../services/storageService';
import { useToast } from './Toast';
import { firstError, positiveNumber, requiredText } from '../services/validationService';
import ConfirmDialog from './ConfirmDialog';

interface Props { lang: Language; products: Product[]; }

const empty = (): Omit<Deal, 'id' | 'createdAt'> => ({
  nameAr: '', nameEn: '', type: 'bundle_price',
  productId: '', minQty: 3, bundlePrice: 10,
  freeQty: 1, percentOff: 10, active: true,
});

const Deals: React.FC<Props> = ({ lang, products }) => {
  const ar = lang === 'ar';
  const { toast } = useToast();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const canDelete = StorageService.hasPermission('manage_settings');

  useEffect(() => { setDeals(StorageService.getDeals()); }, []);

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
    const saved = StorageService.saveDeal({
      ...form,
      id: 'DEAL-' + Date.now(),
      createdAt: Date.now(),
    } as Deal);
    setDeals(saved);
    setShowForm(false);
    setForm(empty());
    toast(ar ? 'تم حفظ العرض' : 'Deal saved!', 'success');
  };

  const handleDelete = (id: string) => {
    if (!canDelete) { toast(ar ? 'الحذف مسموح للمدير فقط' : 'Only administrator can delete.', 'error'); return; }
    const updated = StorageService.deleteDeal(id);
    setDeals(updated);
    setDeleteId(null);
    toast(ar ? 'تم حذف العرض' : 'Deal removed', 'info');
  };

  const toggleActive = (deal: Deal) => {
    const updated = StorageService.saveDeal({ ...deal, active: !deal.active });
    setDeals(updated);
  };

  const typeIcon = (t: Deal['type']) => t === 'bundle_price' ? <Package size={16}/> : t === 'buy_x_get_y' ? <Gift size={16}/> : <Percent size={16}/>;
  const typeLabel = (d: Deal) => {
    if (d.type === 'bundle_price') return ar ? `${d.minQty} بـ ${d.bundlePrice} ر.س` : `${d.minQty} for ${d.bundlePrice} SAR`;
    if (d.type === 'buy_x_get_y') return ar ? `اشتر ${d.minQty} واحصل على ${d.freeQty} مجاناً` : `Buy ${d.minQty} Get ${d.freeQty} Free`;
    return ar ? `خصم ${d.percentOff}%` : `${d.percentOff}% Off`;
  };
  const productName = (pid?: string) => {
    if (!pid) return ar ? 'كل المنتجات' : 'All Products';
    const p = products.find(x => x.id === pid);
    return ar ? p?.nameAr || p?.nameEn || pid : p?.nameEn || p?.nameAr || pid;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black text-slate-800">{ar ? 'العروض والخصومات' : 'Deals & Promotions'}</h2>
          <p className="text-slate-500 text-sm mt-0.5">{ar ? 'أنشئ عروض "3 بـ 10" أو "اشتر 2 واحصل على 1 مجاناً"' : 'Create bundle deals applied automatically at checkout'}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold btn-spring shadow-lg shadow-emerald-600/25"
        >
          <Plus size={18}/> {ar ? 'عرض جديد' : 'New Deal'}
        </button>
      </div>

      {deals.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Tag size={48} className="mx-auto mb-3 opacity-30"/>
          <p className="text-lg font-semibold">{ar ? 'لا توجد عروض بعد' : 'No deals yet'}</p>
          <p className="text-sm">{ar ? 'ابدأ بإضافة عرض لجذب الزبائن!' : 'Add your first deal to attract more customers!'}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {deals.map(deal => (
            <div key={deal.id} className={`rounded-2xl border-2 p-4 flex flex-col gap-3 transition-all ${deal.active ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className={`flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-bold ${deal.type === 'bundle_price' ? 'bg-blue-100 text-blue-700' : deal.type === 'buy_x_get_y' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                  {typeIcon(deal.type)} {typeLabel(deal)}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleActive(deal)} className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${deal.active ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-white'}`}>
                    {deal.active ? '✓' : '○'}
                  </button>
                  {canDelete && (
                    <button onClick={() => setDeleteId(deal.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={15}/></button>
                  )}
                </div>
              </div>
              <div>
                <p className="font-bold text-slate-800">{ar ? deal.nameAr || deal.nameEn : deal.nameEn || deal.nameAr}</p>
                <p className="text-xs text-slate-500 mt-0.5">{productName(deal.productId)}</p>
              </div>
              {deal.expiresAt && (
                <p className="text-xs text-amber-600">⏰ {ar ? 'ينتهي' : 'Expires'}: {new Date(deal.expiresAt).toLocaleDateString(ar ? 'ar-SA' : 'en-US')}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New Deal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" dir={ar ? 'rtl' : 'ltr'}>
            <div className="p-5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between rounded-t-2xl">
              <h3 className="font-black text-lg">{ar ? 'عرض جديد' : 'New Deal'}</h3>
              <button onClick={() => setShowForm(false)}><X size={20}/></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase">{ar ? 'الاسم بالعربي' : 'Arabic Name'}</label>
                  <input value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1 text-sm focus:border-emerald-500 focus:outline-none" placeholder="3 بـ 10 ريال" dir="rtl"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase">English Name</label>
                  <input value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1 text-sm focus:border-emerald-500 focus:outline-none" placeholder="3 for 10 SAR"/>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">{ar ? 'نوع العرض' : 'Deal Type'}</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {(['bundle_price', 'buy_x_get_y', 'percent_off'] as Deal['type'][]).map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                      className={`py-2 px-1 rounded-xl border-2 text-xs font-bold transition-all ${form.type === t ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>
                      {t === 'bundle_price' ? (ar ? 'سعر مجموعة' : 'Bundle Price') : t === 'buy_x_get_y' ? (ar ? 'اشتر وخذ' : 'Buy X Get Y') : (ar ? 'نسبة خصم' : '% Off')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">{ar ? 'المنتج (اختياري)' : 'Product (optional)'}</label>
                <select value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1 text-sm focus:border-emerald-500 focus:outline-none">
                  <option value="">{ar ? 'كل المنتجات' : 'All Products'}</option>
                  {products.map(p => <option key={p.id} value={p.id}>{ar ? p.nameAr || p.nameEn : p.nameEn}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase">{ar ? 'الكمية المطلوبة' : 'Min Qty'}</label>
                  <input type="number" min="1" value={form.minQty} onChange={e => setForm(f => ({ ...f, minQty: parseInt(e.target.value) || 1 }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1 text-sm focus:border-emerald-500 focus:outline-none"/>
                </div>
                {form.type === 'bundle_price' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">{ar ? 'السعر الكلي (ر.س)' : 'Bundle Price (SAR)'}</label>
                    <input type="number" min="0" step="0.5" value={form.bundlePrice} onChange={e => setForm(f => ({ ...f, bundlePrice: parseFloat(e.target.value) || 0 }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1 text-sm focus:border-emerald-500 focus:outline-none"/>
                  </div>
                )}
                {form.type === 'buy_x_get_y' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">{ar ? 'كمية مجانية' : 'Free Qty'}</label>
                    <input type="number" min="1" value={form.freeQty} onChange={e => setForm(f => ({ ...f, freeQty: parseInt(e.target.value) || 1 }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1 text-sm focus:border-emerald-500 focus:outline-none"/>
                  </div>
                )}
                {form.type === 'percent_off' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">{ar ? 'نسبة الخصم %' : 'Discount %'}</label>
                    <input type="number" min="1" max="100" value={form.percentOff} onChange={e => setForm(f => ({ ...f, percentOff: parseFloat(e.target.value) || 0 }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1 text-sm focus:border-emerald-500 focus:outline-none"/>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">{ar ? 'ينتهي في (اختياري)' : 'Expires On (optional)'}</label>
                <input type="date" onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value ? new Date(e.target.value).getTime() : undefined }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1 text-sm focus:border-emerald-500 focus:outline-none"/>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-semibold text-sm">
                  {ar ? 'إلغاء' : 'Cancel'}
                </button>
                <button onClick={handleSave} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 btn-spring">
                  <CheckCircle2 size={16}/> {ar ? 'حفظ' : 'Save Deal'}
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
