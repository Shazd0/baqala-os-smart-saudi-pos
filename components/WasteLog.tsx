import React, { useMemo, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Ingredient, Language, WastageEntry } from '../types';
import { StorageService } from '../services/storageService';

interface WasteLogProps {
  lang: Language;
}

function copy(lang: Language, en: string, ar: string) {
  return lang === 'ar' ? ar : en;
}

const WasteLog: React.FC<WasteLogProps> = ({ lang }) => {
  const [ingredients, setIngredients] = useState<Ingredient[]>(() => StorageService.getIngredients());
  const [entries, setEntries] = useState<WastageEntry[]>(() => StorageService.getWastageEntries());
  const [ingredientId, setIngredientId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState<WastageEntry['reason']>('spoiled');
  const [note, setNote] = useState('');

  const selectedIngredient = ingredients.find(item => item.id === ingredientId);
  const totalWaste = useMemo(() => entries.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0), [entries]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedIngredient || quantity <= 0) return;
    const result = StorageService.addWastageEntry({
      id: '',
      ingredientId: selectedIngredient.id,
      ingredientName: selectedIngredient.nameEn,
      quantity,
      unitOfMeasure: selectedIngredient.unitOfMeasure,
      reason,
      note,
      createdAt: Date.now(),
      createdBy: 'Kitchen',
    });
    setIngredients(result.ingredients);
    setEntries(result.entries);
    setIngredientId('');
    setQuantity(0);
    setNote('');
  };

  return (
    <div className="h-full overflow-y-auto bg-[#f5f7fb] p-4 text-[var(--ios-text)] sm:p-6 lg:p-8">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-600">BOH Controls</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">{copy(lang, 'Waste Log', 'سجل الهدر')}</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">{copy(lang, 'Record spoiled, burned, dropped, expired, and training waste without affecting sales.', 'سجل الهدر دون التأثير على المبيعات.')}</p>
        </div>
        <div className="rounded-[1.5rem] border border-red-100 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-red-500">{copy(lang, 'Total logged', 'إجمالي المسجل')}</p>
          <p className="mt-1 text-3xl font-black text-slate-950">{totalWaste.toFixed(2)}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <form onSubmit={submit} className="rounded-[2rem] border border-white bg-white p-6 shadow-xl shadow-slate-200/60">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <Trash2 size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-950">{copy(lang, 'New Waste Entry', 'تسجيل هدر جديد')}</h2>
              <p className="text-xs font-semibold text-slate-400">Inventory adjustment only</p>
            </div>
          </div>

          <div className="space-y-3">
            <select value={ingredientId} onChange={event => setIngredientId(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-400">
              <option value="">{copy(lang, 'Select stock item', 'اختر صنف المخزون')}</option>
              {ingredients.map(ingredient => (
                <option key={ingredient.id} value={ingredient.id}>
                  {copy(lang, ingredient.nameEn, ingredient.nameAr)} ({ingredient.currentStock} {ingredient.unitOfMeasure})
                </option>
              ))}
            </select>
            <input type="number" min={0} step="0.01" value={quantity} onChange={event => setQuantity(Number(event.target.value))} placeholder={copy(lang, 'Quantity wasted', 'كمية الهدر')} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-400" />
            <select value={reason} onChange={event => setReason(event.target.value as WastageEntry['reason'])} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-400">
              {(['spoiled', 'burned', 'dropped', 'expired', 'training', 'other'] as WastageEntry['reason'][]).map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <textarea value={note} onChange={event => setNote(event.target.value)} placeholder={copy(lang, 'Optional note', 'ملاحظة اختيارية')} className="h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400" />
          </div>

          <button className="mt-5 w-full rounded-2xl bg-slate-950 py-3.5 text-sm font-black text-white shadow-lg shadow-slate-950/20 transition hover:bg-emerald-700">
            {copy(lang, 'Record Waste', 'تسجيل الهدر')}
          </button>
        </form>

        <div className="rounded-[2rem] border border-white bg-white shadow-xl shadow-slate-200/60">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-xl font-black text-slate-950">{copy(lang, 'Recent Waste Activity', 'آخر عمليات الهدر')}</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {entries.length === 0 && (
              <div className="p-10 text-center text-sm font-bold text-slate-400">
                <AlertTriangle className="mx-auto mb-3 text-slate-300" />
                {copy(lang, 'No waste entries recorded yet.', 'لا توجد سجلات هدر بعد.')}
              </div>
            )}
            {entries.map(entry => (
              <div key={entry.id} className="grid gap-3 px-6 py-4 text-sm sm:grid-cols-2 lg:grid-cols-[1fr_140px_140px_160px]">
                <div>
                  <p className="font-black text-slate-950">{entry.ingredientName}</p>
                  <p className="text-xs font-semibold text-slate-400">{entry.note || '-'}</p>
                </div>
                <p className="font-bold text-slate-600">{entry.quantity} {entry.unitOfMeasure}</p>
                <p className="font-bold capitalize text-red-600">{entry.reason}</p>
                <p className="text-xs font-semibold text-slate-400">{new Date(entry.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WasteLog;
