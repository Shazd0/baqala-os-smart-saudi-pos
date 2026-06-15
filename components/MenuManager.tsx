import React, { useState } from 'react';
import { Footprints, ImagePlus, Save, Trash2, Utensils } from 'lucide-react';
import { KitchenStationType, Language, MenuItem } from '../types';
import { StorageService } from '../services/storageService';
import { getSfdaFlags } from '../services/restaurantService';
import { useToast } from './Toast';

interface MenuManagerProps {
  lang: Language;
}

const stations: KitchenStationType[] = ['grill', 'appetizers', 'beverage', 'packing', 'general'];

function tr(lang: Language, en: string, ar: string) {
  return lang === 'ar' ? ar : en;
}

const Field = ({ label, help, children, className = '' }: { label: string; help: string; children: React.ReactNode; className?: string }) => (
  <div className={`ios-field ${className}`}>
    <label className="ios-label">{label}</label>
    {children}
    <p className="ios-help">{help}</p>
  </div>
);

const MenuManager: React.FC<MenuManagerProps> = ({ lang }) => {
  const { toast } = useToast();
  const [items, setItems] = useState<MenuItem[]>(() => StorageService.getMenuItems());
  const [categories] = useState(() => StorageService.getMenuCategories());
  const [branches] = useState(() => StorageService.getBranches());
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const activeBranchId = StorageService.getActiveBranchId();

  const startNew = () => {
    setEditing({
      id: '',
      branchIds: [activeBranchId].filter(Boolean),
      nameEn: '',
      nameAr: '',
      descriptionEn: '',
      descriptionAr: '',
      categoryId: categories[0]?.id || 'cat-shawarma',
      basePrice: 0,
      vatPercentage: 15,
      active: true,
      station: 'general',
      modifierGroupIds: [],
      nutrition: {
        caloriesKcal: 0,
        fatGrams: 0,
        saturatedFatGrams: 0,
        sugarGrams: 0,
        sodiumMilligrams: 0,
        caffeineMilligrams: 0,
        caffeineServingMl: 0,
        allergens: [],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  };

  const save = () => {
    if (!editing) return;
    const savedItems = StorageService.saveMenuItem(editing);
    setItems(savedItems);
    setEditing(null);
    toast(tr(lang, 'Menu item saved.', 'تم حفظ صنف القائمة.'), 'success');
  };

  const toggleBranch = (branchId: string) => {
    if (!editing) return;
    const branchIds = editing.branchIds || [];
    setEditing({
      ...editing,
      branchIds: branchIds.includes(branchId)
        ? branchIds.filter(id => id !== branchId)
        : [...branchIds, branchId],
    });
  };

  const uploadImages = (files?: FileList | null) => {
    if (!editing || !files?.length) return;
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (!imageFiles.length) {
      toast(tr(lang, 'Please choose an image file.', 'اختر ملف صورة.'), 'warning');
      return;
    }
    Promise.all(imageFiles.map(file => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = event => resolve(event.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }))).then(dataUrls => {
      setEditing(current => {
        if (!current) return current;
        const nextImages = [...(current.images?.length ? current.images : current.image ? [current.image] : []), ...dataUrls];
        return { ...current, image: nextImages[0], images: nextImages };
      });
    }).catch(() => toast(tr(lang, 'Could not read the image file.', 'تعذر قراءة ملف الصورة.'), 'error'));
  };

  const removeImage = (image: string) => {
    if (!editing) return;
    const nextImages = (editing.images?.length ? editing.images : editing.image ? [editing.image] : []).filter(item => item !== image);
    setEditing({ ...editing, image: nextImages[0] || '', images: nextImages });
  };

  return (
    <div className="ios-responsive-split">
      <section className="h-full overflow-y-auto p-6">
        <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-600">SFDA menu control</p>
            <h1 className="text-3xl font-black text-slate-900">{tr(lang, 'Menu and Nutrition', 'القائمة والتغذية')}</h1>
            <p className="ios-help mt-2 max-w-3xl">{tr(lang, 'Create the items cashiers sell in the POS, with bilingual names, pricing, kitchen station routing, and SFDA nutrition disclosures.', 'أنشئ الأصناف التي يبيعها الكاشير في نقطة البيع، مع الأسماء ثنائية اللغة والتسعير وتوجيه محطة المطبخ وإفصاحات هيئة الغذاء والدواء.')}</p>
          </div>
          <button onClick={startNew} className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-600/25">
            {tr(lang, 'New Menu Item', 'صنف جديد')}
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {items.map(item => {
            const burn = getSfdaFlags(item.nutrition).burn;
            return (
              <button key={item.id} onClick={() => setEditing(item)} className="overflow-hidden rounded-[2rem] border border-white bg-white text-left shadow-sm transition hover:shadow-xl">
                {(item.images?.[0] || item.image) ? (
                  <div className="h-36 bg-slate-100">
                    <img src={item.images?.[0] || item.image} alt={tr(lang, item.nameEn, item.nameAr)} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex h-28 items-center justify-center bg-emerald-50 text-emerald-600">
                    <Utensils size={30} />
                  </div>
                )}
                <div className="p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">{tr(lang, item.nameEn, item.nameAr)}</h2>
                    <p className="text-xs font-bold uppercase text-slate-400">{item.station}</p>
                  </div>
                  <span className="rounded-2xl bg-slate-950 px-3 py-1 text-sm font-black text-white">{item.basePrice.toFixed(2)} SAR</span>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1">{item.nutrition.caloriesKcal} kcal</span>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700"><Footprints size={12} className="inline" /> {burn.walking} min</span>
                  <span className="rounded-full bg-purple-50 px-2.5 py-1 text-purple-700">{burn.running} min run</span>
                </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="h-full overflow-y-auto border-l border-slate-200 bg-white p-5 text-[var(--ios-text)] shadow-2xl">
        {!editing ? (
          <div className="rounded-[2rem] border border-dashed border-slate-300 p-8 text-center text-slate-500">
            <Utensils className="mx-auto mb-3 text-emerald-500" size={40} />
            <p className="font-black">{tr(lang, 'Select or create a menu item.', 'اختر أو أنشئ صنفاً.')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">{tr(lang, 'Edit item', 'تعديل الصنف')}</p>
              <h2 className="text-2xl font-black text-slate-900">{editing.id ? tr(lang, editing.nameEn, editing.nameAr) : tr(lang, 'New Item', 'صنف جديد')}</h2>
            <p className="ios-help mt-2">{tr(lang, 'Add the menu item with only the details needed for selling, QR ordering, and kitchen routing.', 'أضف صنف القائمة بالبيانات الأساسية فقط للبيع وطلبات QR وتوجيه المطبخ.')}</p>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 overflow-hidden rounded-3xl bg-white">
                {(editing.images?.[0] || editing.image) ? (
                  <img src={editing.images?.[0] || editing.image} alt={tr(lang, editing.nameEn || 'Menu item', editing.nameAr || 'صنف القائمة')} className="h-48 w-full object-cover" />
                ) : (
                  <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
                    <ImagePlus size={34} />
                    <p className="text-sm font-black">{tr(lang, 'No item image yet', 'لا توجد صورة للصنف')}</p>
                  </div>
                )}
              </div>
              <Field label={tr(lang, 'Menu item photos', 'صور صنف القائمة')} help={tr(lang, 'Upload multiple guest-facing food photos. The first photo is used as the POS cover.', 'ارفع عدة صور طعام للعميل. الصورة الأولى تستخدم كغلاف في نقطة البيع.')}>
                <input type="file" accept="image/*" multiple onChange={event => uploadImages(event.target.files)} className="ios-input file:mr-3 file:rounded-xl file:border-0 file:bg-[var(--ios-accent)] file:px-3 file:py-2 file:text-xs file:font-black file:text-white" />
              </Field>
              {!!(editing.images?.length || editing.image) && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(editing.images?.length ? editing.images : editing.image ? [editing.image] : []).map((image, index) => (
                    <div key={`${image.slice(0, 24)}-${index}`} className="relative overflow-hidden rounded-2xl bg-white">
                      <img src={image} alt={`Food ${index + 1}`} className="h-20 w-full object-cover" />
                      <button onClick={() => removeImage(image)} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-[#FFECEA] text-[#FF3B30] shadow">
                        <Trash2 size={13} />
                      </button>
                      {index === 0 && <span className="absolute bottom-1 left-1 rounded-full bg-[var(--ios-accent)] px-2 py-0.5 text-[9px] font-black text-white">Cover</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Field
              label={tr(lang, 'Menu item name in English', 'اسم الصنف بالإنجليزية')}
              help={tr(lang, 'This name appears on the English POS tile, receipts, reports, and kitchen tickets.', 'يظهر هذا الاسم في بطاقة نقطة البيع الإنجليزية والإيصالات والتقارير وتذاكر المطبخ.')}
            >
              <input value={editing.nameEn} onChange={event => setEditing({ ...editing, nameEn: event.target.value })} placeholder={tr(lang, 'e.g., Chicken Shawarma Wrap', 'مثال: Chicken Shawarma Wrap')} className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
            </Field>
            <Field
              label={tr(lang, 'Menu item name in Arabic', 'اسم الصنف بالعربية')}
              help={tr(lang, 'This name appears on Arabic receipts, customer-facing screens, and bilingual reports.', 'يظهر هذا الاسم في الإيصالات العربية وشاشات العملاء والتقارير ثنائية اللغة.')}
            >
              <input value={editing.nameAr} onChange={event => setEditing({ ...editing, nameAr: event.target.value })} placeholder={tr(lang, 'e.g., شاورما دجاج', 'مثال: شاورما دجاج')} className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={tr(lang, 'Menu category', 'تصنيف القائمة')} help={tr(lang, 'Controls where this item appears in POS category filters.', 'يحدد مكان ظهور الصنف ضمن فلاتر التصنيف في نقطة البيع.')}>
                <select value={editing.categoryId} onChange={event => setEditing({ ...editing, categoryId: event.target.value })} className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold">
                  {categories.map(category => <option key={category.id} value={category.id}>{tr(lang, category.nameEn, category.nameAr)}</option>)}
                </select>
              </Field>
              <Field label={tr(lang, 'Kitchen station', 'محطة المطبخ')} help={tr(lang, 'Routes the item to the right kitchen prep area.', 'يوجه الصنف إلى منطقة التحضير الصحيحة في المطبخ.')}>
                <select value={editing.station} onChange={event => setEditing({ ...editing, station: event.target.value as KitchenStationType })} className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold">
                  {stations.map(station => <option key={station} value={station}>{station}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={tr(lang, 'Selling price in SAR', 'سعر البيع بالريال')} help={tr(lang, 'This price is used by POS, receipts, VAT totals, and reports.', 'يُستخدم هذا السعر في نقطة البيع والإيصالات وإجماليات الضريبة والتقارير.')}>
                <input type="number" value={editing.basePrice} onChange={event => setEditing({ ...editing, basePrice: Number(event.target.value) })} placeholder="e.g., 18" className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
              </Field>
              <Field label={tr(lang, 'Calories per serving', 'السعرات لكل حصة')} help={tr(lang, 'Used for SFDA calorie disclosure and burn-time estimates.', 'تُستخدم لإفصاح السعرات وحساب مدة النشاط حسب هيئة الغذاء والدواء.')}>
                <input type="number" value={editing.nutrition.caloriesKcal} onChange={event => setEditing({ ...editing, nutrition: { ...editing.nutrition, caloriesKcal: Number(event.target.value) } })} placeholder="e.g., 520" className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
              </Field>
            </div>

            <button
              onClick={() => setEditing({ ...editing, active: !editing.active })}
              className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-black transition ${editing.active ? 'bg-[var(--ios-accent-soft)] text-[var(--ios-accent)]' : 'bg-slate-100 text-slate-500'}`}
            >
              {editing.active ? tr(lang, 'Active in POS', 'ظاهر في نقطة البيع') : tr(lang, 'Hidden from POS', 'مخفي من نقطة البيع')}
              <span className="ios-help mt-1 block">{tr(lang, 'Use this control to temporarily hide unavailable items without deleting their history.', 'استخدم هذا الخيار لإخفاء الأصناف غير المتوفرة مؤقتاً دون حذف سجلها.')}</span>
            </button>

            <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-sm font-black text-slate-700">HungerStation</p>
              <p className="ios-help mb-3">{tr(lang, 'Map this POS item to the real HungerStation menu item ID and decide if it should be included in live menu availability sync.', 'اربط هذا الصنف بمعرّف صنف هنقرستيشن الحقيقي وحدد هل يدخل في مزامنة توفر القائمة المباشرة.')}</p>
              <Field label={tr(lang, 'HungerStation item ID', 'معرّف صنف هنقرستيشن')} help={tr(lang, 'Use the exact item ID supplied by HungerStation or your delivery middleware.', 'استخدم معرّف الصنف الحقيقي من هنقرستيشن أو وسيط التوصيل.')}>
                <input value={editing.hungerStationExternalId || ''} onChange={event => setEditing({ ...editing, hungerStationExternalId: event.target.value })} placeholder="e.g., HS-ITEM-10042" className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
              </Field>
              <button
                onClick={() => setEditing({ ...editing, hungerStationEnabled: editing.hungerStationEnabled === false })}
                className={`mt-3 w-full rounded-2xl px-4 py-3 text-left text-sm font-black transition ${editing.hungerStationEnabled === false ? 'bg-slate-200 text-slate-500' : 'bg-[#EAF8EF] text-[#34C759]'}`}
              >
                {editing.hungerStationEnabled === false ? tr(lang, 'Hidden from HungerStation sync', 'مخفي من مزامنة هنقرستيشن') : tr(lang, 'Included in HungerStation sync', 'ضمن مزامنة هنقرستيشن')}
              </button>
            </div>

            <div>
              <p className="mb-2 text-sm font-black text-slate-700">{tr(lang, 'Available branches', 'الفروع المتاحة')}</p>
              <p className="ios-help mb-3">{tr(lang, 'Choose which restaurant branches can sell this menu item. Leave all unchecked to make it available everywhere.', 'اختر الفروع التي يمكنها بيع هذا الصنف. اتركها كلها غير محددة لإتاحته في كل الفروع.')}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {branches.map(branch => {
                  const selected = editing.branchIds?.includes(branch.id) || false;
                  return (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => toggleBranch(branch.id)}
                      className={`rounded-2xl px-3 py-2 text-left text-xs font-black ${selected ? 'bg-[var(--ios-accent)] text-white' : 'bg-slate-100 text-slate-600'}`}
                    >
                      {tr(lang, branch.nameEn, branch.nameAr)}
                    </button>
                  );
                })}
              </div>
            </div>

            <button onClick={save} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-sm font-black text-white shadow-lg shadow-emerald-600/25">
              <Save size={18} /> {tr(lang, 'Save Menu Item', 'حفظ الصنف')}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};

export default MenuManager;
