import React, { useState } from 'react';
import { Pencil, Plus, Store } from 'lucide-react';
import { Language, RestaurantBranch } from '../types';
import { StorageService } from '../services/storageService';
import { useToast } from './Toast';

interface BranchesProps {
  lang: Language;
  onChange?: () => void;
}

function text(lang: Language, en: string, ar: string) {
  return lang === 'ar' ? ar : en;
}

const Field = ({ label, help, children }: { label: string; help: string; children: React.ReactNode }) => (
  <div className="ios-field">
    <label className="ios-label">{label}</label>
    {children}
    <p className="ios-help">{help}</p>
  </div>
);

const emptyBranch = (): RestaurantBranch => ({
  id: '',
  nameEn: '',
  nameAr: '',
  crNumber: '',
  vatNumber: '',
  phone: '',
  address: '',
  serviceTypes: [],
  operatingHours: [],
  cloudStatus: { status: 'unknown' },
  active: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const Branches: React.FC<BranchesProps> = ({ lang, onChange }) => {
  const { toast } = useToast();
  const [branches, setBranches] = useState<RestaurantBranch[]>(() => StorageService.getBranches());
  const [activeBranchId, setActiveBranchId] = useState(() => StorageService.getActiveBranchId());
  const [draft, setDraft] = useState<RestaurantBranch>(() => emptyBranch());
  const [saving, setSaving] = useState(false);

  const saveBranch = () => {
    if (!draft.nameEn.trim() || !draft.nameAr.trim()) return;
    setSaving(true);
    const isNew = !draft.id;
    const savedBranches = StorageService.saveBranch({
      ...draft,
      serviceTypes: draft.serviceTypes?.length ? draft.serviceTypes : [],
    });
    setBranches(savedBranches);
    setDraft(emptyBranch());
    onChange?.();
    setSaving(false);
    toast(isNew
      ? (lang === 'ar' ? `✓ تم إضافة الفرع ${draft.nameEn}` : `✓ Branch "${draft.nameEn}" added`)
      : (lang === 'ar' ? `✓ تم تحديث الفرع` : `✓ Branch updated`), 'success');
  };

  const activateBranch = (branchId: string) => {
    StorageService.setActiveBranchId(branchId);
    setActiveBranchId(branchId);
    onChange?.();
    const branch = branches.find(b => b.id === branchId);
    toast(lang === 'ar' ? `✓ الفرع النشط: ${branch?.nameAr || branch?.nameEn}` : `✓ Active: ${branch?.nameEn}`, 'success');
  };

  return (
    <div className="ios-page">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ios-accent)]">
          {text(lang, 'Store network', 'شبكة المتاجر')}
        </p>
        <h1 className="ios-title mt-2 text-4xl">{text(lang, 'Branches', 'الفروع')}</h1>
        <p className="ios-subtitle mt-2 max-w-xl text-sm">
          {text(lang, 'Create branches, set the till to the right store, and keep CR / VAT details for receipts.', 'أنشئ الفروع، وحدد المتجر النشط لنقطة البيع، واحفظ السجل التجاري والضريبة للإيصالات.')}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <div className="space-y-3">
          {branches.map(branch => {
            const isActive = branch.id === activeBranchId;
            return (
              <div key={branch.id} className="ios-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-lg font-bold text-[var(--ios-text)]">
                      {text(lang, branch.nameEn, branch.nameAr)}
                    </h2>
                    {isActive && (
                      <span className="rounded-md bg-[var(--ios-accent-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--ios-accent)]">
                        {text(lang, 'Active', 'نشط')}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--ios-secondary)]">{branch.address || text(lang, 'No address yet', 'لا يوجد عنوان بعد')}</p>
                  <p className="mt-0.5 text-xs text-[var(--ios-tertiary)]">
                    {branch.phone || '—'} · CR {branch.crNumber || '—'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setDraft(branch)} className="ios-button-secondary min-h-0 h-10 px-3 text-xs">
                    <Pencil size={14} /> {text(lang, 'Edit', 'تعديل')}
                  </button>
                  {!isActive && (
                    <button type="button" onClick={() => activateBranch(branch.id)} className="ios-button-primary min-h-0 h-10 px-3 text-xs">
                      {text(lang, 'Use on this till', 'استخدام في هذه الكاشير')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {branches.length === 0 && (
            <div className="ios-card p-8 text-center text-sm font-semibold text-[var(--ios-secondary)]">
              {text(lang, 'No branches yet. Add the first store on the right.', 'لا توجد فروع بعد. أضف المتجر الأول من اليمين.')}
            </div>
          )}
        </div>

        <form
          className="ios-card h-fit p-5"
          onSubmit={event => {
            event.preventDefault();
            saveBranch();
          }}
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--ios-accent-soft)] text-[var(--ios-accent)]">
              {draft.id ? <Pencil size={20} /> : <Plus size={20} />}
            </div>
            <div>
              <h2 className="text-lg font-bold">{draft.id ? text(lang, 'Edit branch', 'تعديل الفرع') : text(lang, 'New branch', 'فرع جديد')}</h2>
              <p className="text-xs text-[var(--ios-secondary)]">{text(lang, 'Shown on receipts and reports', 'يظهر على الإيصالات والتقارير')}</p>
            </div>
          </div>

          <div className="space-y-3">
            <Field label={text(lang, 'Name (English)', 'الاسم بالإنجليزية')} help={text(lang, 'Storefront name on English receipts.', 'اسم الواجهة على الإيصالات الإنجليزية.')}>
              <input className="ios-input" value={draft.nameEn} onChange={event => setDraft({ ...draft, nameEn: event.target.value })} required />
            </Field>
            <Field label={text(lang, 'Name (Arabic)', 'الاسم بالعربية')} help={text(lang, 'Official Arabic store name.', 'الاسم العربي الرسمي للمتجر.')}>
              <input className="ios-input text-right" value={draft.nameAr} onChange={event => setDraft({ ...draft, nameAr: event.target.value })} required />
            </Field>
            <Field label={text(lang, 'CR number', 'السجل التجاري')} help={text(lang, '10-digit Saudi commercial registration.', 'السجل التجاري السعودي من 10 أرقام.')}>
              <input className="ios-input" inputMode="numeric" maxLength={10} value={draft.crNumber || ''} onChange={event => setDraft({ ...draft, crNumber: event.target.value.replace(/\D/g, '').slice(0, 10) })} />
            </Field>
            <Field label={text(lang, 'VAT number', 'الرقم الضريبي')} help={text(lang, '15-digit VAT identification.', 'الرقم الضريبي من 15 خانة.')}>
              <input className="ios-input" inputMode="numeric" maxLength={15} value={draft.vatNumber || ''} onChange={event => setDraft({ ...draft, vatNumber: event.target.value.replace(/\D/g, '').slice(0, 15) })} />
            </Field>
            <Field label={text(lang, 'Phone', 'الجوال')} help={text(lang, 'Branch contact number.', 'رقم تواصل الفرع.')}>
              <input className="ios-input" value={draft.phone || ''} onChange={event => setDraft({ ...draft, phone: event.target.value })} />
            </Field>
            <Field label={text(lang, 'Address', 'العنوان')} help={text(lang, 'Street and district for this store.', 'الشارع والحي لهذا المتجر.')}>
              <input className="ios-input" value={draft.address || ''} onChange={event => setDraft({ ...draft, address: event.target.value })} />
            </Field>
          </div>

          <div className="mt-5 flex gap-2">
            {draft.id && (
              <button type="button" onClick={() => setDraft(emptyBranch())} className="ios-button-secondary flex-1">
                {text(lang, 'Cancel', 'إلغاء')}
              </button>
            )}
            <button type="submit" disabled={saving} className="ios-button-primary flex-1">
              <Store size={16} />
              {saving ? text(lang, 'Saving…', 'جاري الحفظ…') : text(lang, 'Save branch', 'حفظ الفرع')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Branches;
