import React, { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Armchair, Download, MapPin, Pencil, Plus, Save, Store, Table2, Trash2, UsersRound } from 'lucide-react';
import { DiningTable, Language, RestaurantBranch } from '../types';
import { StorageService } from '../services/storageService';
import { buildCustomerQrUrl } from '../services/cloudClient';
import ConfirmDialog from './ConfirmDialog';

interface RestaurantAdminProps {
  lang: Language;
  onChange?: () => void;
}

function text(lang: Language, en: string, ar: string) {
  return lang === 'ar' ? ar : en;
}

const Field = ({ label, help, children, className = '' }: { label: string; help: string; children: React.ReactNode; className?: string }) => (
  <div className={`ios-field ${className}`}>
    <label className="text-sm font-bold text-slate-900">{label}</label>
    {children}
    <p className="mt-0.5 text-xs font-medium leading-snug text-slate-400">{help}</p>
  </div>
);

const serviceLabel = (type: RestaurantBranch['serviceTypes'][number]) => type
  .split('_')
  .map(part => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

const tableStatusClass = (state: string) => {
  switch (state) {
    case 'vacant':
      return 'bg-emerald-50 text-emerald-600';
    case 'occupied':
    case 'ordering':
    case 'awaiting_bill':
      return 'bg-blue-50 text-blue-600';
    case 'dirty':
      return 'bg-amber-50 text-amber-600';
    default:
      return 'bg-slate-100 text-slate-600';
  }
};

const qrUrlForTable = (table: DiningTable) => {
  return buildCustomerQrUrl(table.id);
};

const filenamePart = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '') || 'restaurant';

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fillRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fillStyle: string | CanvasGradient) {
  ctx.fillStyle = fillStyle;
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fill();
}

function drawCenteredText(ctx: CanvasRenderingContext2D, textValue: string, x: number, y: number, maxWidth: number) {
  let textToDraw = textValue;
  while (ctx.measureText(textToDraw).width > maxWidth && textToDraw.length > 4) {
    textToDraw = `${textToDraw.slice(0, -4)}...`;
  }
  ctx.fillText(textToDraw, x, y);
}

const emptyBranch = (): RestaurantBranch => ({
  id: '',
  nameEn: '',
  nameAr: '',
  serviceTypes: ['dine_in', 'takeaway', 'delivery'],
  operatingHours: [],
  cloudStatus: { status: 'unknown' },
  active: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const emptyTable = (branchId: string): DiningTable => ({
  id: '',
  branchId,
  areaId: 'area-main',
  label: '',
  seats: 4,
  state: 'vacant',
  updatedAt: Date.now(),
});

const RestaurantAdmin: React.FC<RestaurantAdminProps> = ({ lang, onChange }) => {
  const [branches, setBranches] = useState<RestaurantBranch[]>(() => StorageService.getBranches());
  const [activeBranchId, setActiveBranchId] = useState(() => StorageService.getActiveBranchId());
  const [draft, setDraft] = useState<RestaurantBranch>(() => emptyBranch());
  const [tables, setTables] = useState<DiningTable[]>(() => StorageService.getTables());
  const [tableDraft, setTableDraft] = useState<DiningTable>(() => emptyTable(StorageService.getActiveBranchId()));
  const [tableToDelete, setTableToDelete] = useState<DiningTable | null>(null);
  const [savingBranch, setSavingBranch] = useState(false);
  const [savingTable, setSavingTable] = useState(false);
  const [downloadingQrs, setDownloadingQrs] = useState(false);
  const qrCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});

  useEffect(() => {
    let active = true;
    StorageService.syncTablesFromFirestore().then(remoteTables => {
      if (active && remoteTables) setTables(remoteTables);
    }).catch(() => {
      // Local storage remains the fallback when Firebase is not configured or offline.
    });
    return () => {
      active = false;
    };
  }, []);

  const startNewBranch = () => {
    setDraft(emptyBranch());
  };

  const saveBranch = () => {
    if (!draft.nameEn.trim() || !draft.nameAr.trim()) return;
    setSavingBranch(true);
    const savedBranches = StorageService.saveBranch(draft);
    setBranches(savedBranches);
    setDraft(emptyBranch());
    onChange?.();
    setSavingBranch(false);
  };

  const activateBranch = (branchId: string) => {
    StorageService.setActiveBranchId(branchId);
    setActiveBranchId(branchId);
    setTableDraft(emptyTable(branchId));
    onChange?.();
  };

  const branchTables = tables.filter(table => !table.branchId || table.branchId === activeBranchId);

  const saveTable = () => {
    if (!tableDraft.label.trim()) return;
    setSavingTable(true);
    const savedTables = StorageService.saveTable({
      ...tableDraft,
      id: tableDraft.id || `TBL-${Date.now()}`,
      branchId: tableDraft.branchId || activeBranchId,
      areaId: tableDraft.areaId || 'area-main',
      updatedAt: Date.now(),
    });
    setTables(savedTables);
    setTableDraft(emptyTable(activeBranchId));
    onChange?.();
    setSavingTable(false);
  };

  const startNewTable = () => {
    setTableDraft(emptyTable(activeBranchId));
  };

  const editTable = (table: DiningTable) => {
    setTableDraft(table);
  };

  const deleteTable = () => {
    if (!tableToDelete) return;
    const savedTables = StorageService.deleteTable(tableToDelete.id);
    setTables(savedTables);
    if (tableDraft.id === tableToDelete.id) {
      setTableDraft(emptyTable(activeBranchId));
    }
    setTableToDelete(null);
    onChange?.();
  };

  const activeBranch = branches.find(branch => branch.id === activeBranchId);
  const formCardClass = 'rounded-2xl border border-slate-100 bg-white p-5 shadow-sm';
  const motionClass = '[transition:all_0.2s_cubic-bezier(0.4,0,0.2,1)]';

  const downloadAllQrCodes = async () => {
    if (!branchTables.length) return;
    setDownloadingQrs(true);
    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));

    try {
      const cardWidth = 720;
      const cardHeight = 960;
      const gap = 44;
      const margin = 56;
      const columns = Math.min(3, branchTables.length);
      const rows = Math.ceil(branchTables.length / columns);
      const canvas = document.createElement('canvas');
      canvas.width = margin * 2 + columns * cardWidth + (columns - 1) * gap;
      canvas.height = margin * 2 + rows * cardHeight + (rows - 1) * gap;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      background.addColorStop(0, '#eff6ff');
      background.addColorStop(0.5, '#f8fafc');
      background.addColorStop(1, '#ecfdf5');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      branchTables.forEach((table, index) => {
        const qrCanvas = qrCanvasRefs.current[table.id];
        if (!qrCanvas) return;
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = margin + column * (cardWidth + gap);
        const y = margin + row * (cardHeight + gap);
        const branchName = activeBranch?.nameEn || 'Oasis Dine';
        const branchNameAr = activeBranch?.nameAr || '';
        const qrUrl = qrUrlForTable(table);

        ctx.save();
        ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
        ctx.shadowBlur = 26;
        ctx.shadowOffsetY = 16;
        fillRoundedRect(ctx, x, y, cardWidth, cardHeight, 44, '#ffffff');
        ctx.restore();

        const topGradient = ctx.createLinearGradient(x, y, x + cardWidth, y + 300);
        topGradient.addColorStop(0, '#0f172a');
        topGradient.addColorStop(0.58, '#2563eb');
        topGradient.addColorStop(1, '#14b8a6');
        fillRoundedRect(ctx, x + 28, y + 28, cardWidth - 56, 250, 34, topGradient);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.beginPath();
        ctx.arc(x + cardWidth - 112, y + 82, 74, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 86, y + 236, 48, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = '800 30px Tajawal, Inter, Arial, sans-serif';
        drawCenteredText(ctx, branchName, x + cardWidth / 2, y + 90, cardWidth - 140);
        if (branchNameAr) {
          ctx.font = '700 24px Tajawal, Inter, Arial, sans-serif';
          drawCenteredText(ctx, branchNameAr, x + cardWidth / 2, y + 128, cardWidth - 140);
        }

        ctx.font = '900 96px Tajawal, Inter, Arial, sans-serif';
        drawCenteredText(ctx, `Table ${table.label}`, x + cardWidth / 2, y + 224, cardWidth - 100);

        fillRoundedRect(ctx, x + 108, y + 330, 504, 504, 44, '#f8fafc');
        fillRoundedRect(ctx, x + 138, y + 360, 444, 444, 32, '#ffffff');
        ctx.drawImage(qrCanvas, x + 168, y + 390, 384, 384);

        ctx.fillStyle = '#0f172a';
        ctx.font = '900 34px Tajawal, Inter, Arial, sans-serif';
        drawCenteredText(ctx, 'Scan to order from your table', x + cardWidth / 2, y + 870, cardWidth - 100);
        ctx.fillStyle = '#64748b';
        ctx.font = '700 19px Tajawal, Inter, Arial, sans-serif';
        drawCenteredText(ctx, qrUrl, x + cardWidth / 2, y + 908, cardWidth - 92);
      });

      const link = document.createElement('a');
      link.download = `${filenamePart(activeBranch?.nameEn || 'oasis-dine')}-table-qr-codes.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setDownloadingQrs(false);
    }
  };

  return (
    <div className="ios-page bg-[#F2F2F7] text-slate-900">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Restaurant Management</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-950">{text(lang, 'Restaurant Admin', 'إدارة المطاعم')}</h1>
          <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-500">
            {text(lang, 'Create and edit restaurant branches, assign the active branch for this POS, and manage dining tables.', 'أنشئ وعدّل فروع المطعم، وحدد الفرع النشط لنقطة البيع، وأدر الطاولات.')}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Active Branch</p>
          <p className="mt-1 text-xl font-extrabold tracking-tight text-slate-900">{activeBranch?.nameEn || 'Not selected'}</p>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{text(lang, 'Active Branch Profile', 'ملف الفرع النشط')}</p>
                <h2 className="mt-2 text-xl font-extrabold tracking-tight text-slate-900">{activeBranch ? text(lang, activeBranch.nameEn, activeBranch.nameAr) : text(lang, 'No active branch', 'لا يوجد فرع نشط')}</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">{activeBranch?.address || text(lang, 'No address yet', 'لا يوجد عنوان')}</p>
              </div>
              <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
                <Store size={24} />
              </div>
            </div>
            {activeBranch && (
              <div className="flex flex-wrap gap-2">
                {activeBranch.serviceTypes.map(type => (
                  <span key={type} className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600">
                    {serviceLabel(type)}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {branches.map(branch => (
              <button
                key={branch.id}
                onClick={() => setDraft(branch)}
                className={`rounded-2xl border bg-white p-5 text-left shadow-sm ${motionClass} hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97] ${branch.id === activeBranchId ? 'border-blue-300 ring-4 ring-blue-500/10' : 'border-slate-100'}`}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{branch.city || 'KSA Branch'}</p>
                    <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">{text(lang, branch.nameEn, branch.nameAr)}</h2>
                    <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-500">{branch.address || text(lang, 'No address yet', 'لا يوجد عنوان')}</p>
                  </div>
                  <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
                    <Store size={22} />
                  </div>
                </div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {branch.serviceTypes.map(type => (
                    <span key={type} className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-600">
                      {serviceLabel(type)}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${branch.active ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
                    {branch.active ? 'Active' : 'Inactive'}
                  </span>
                  <span className="text-xs font-semibold capitalize text-slate-500">{branch.cloudStatus.status}</span>
                </div>
                <p className="mt-3 text-xs font-medium leading-snug text-slate-400">{text(lang, 'Click this card to edit branch details. Use Set Active only to switch the POS branch.', 'اضغط البطاقة لتعديل بيانات الفرع. استخدم تفعيل الفرع فقط لتغيير الفرع النشط لنقطة البيع.')}</p>
                {branch.id !== activeBranchId && (
                  <span onClick={event => { event.stopPropagation(); activateBranch(branch.id); }} className={`mt-4 inline-flex min-h-0 items-center rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 ${motionClass} hover:bg-blue-50 hover:text-blue-600 active:scale-[0.97]`}>
                    {text(lang, 'Set Active', 'تفعيل الفرع')}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-50 p-3 text-blue-600"><Table2 size={22} /></div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-blue-600">{text(lang, 'Table Management', 'إدارة الطاولات')}</p>
                  <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
                    {activeBranch ? `${activeBranch.nameEn} • ${branchTables.length} ${text(lang, 'tables', 'طاولات')}` : text(lang, 'Select a branch', 'اختر فرعاً')}
                  </h2>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => { void downloadAllQrCodes(); }}
                  disabled={!branchTables.length || downloadingQrs}
                  className={`inline-flex min-h-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${motionClass} hover:bg-blue-700 active:scale-[0.97]`}
                >
                  <Download size={14} /> {downloadingQrs ? text(lang, 'Preparing...', 'جاري التجهيز...') : text(lang, 'Download QR Codes', 'تحميل رموز QR')}
                </button>
                <button onClick={startNewTable} className={`inline-flex min-h-0 items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 ${motionClass} hover:bg-blue-50 hover:text-blue-600 active:scale-[0.97]`}>
                  <Plus size={14} /> {text(lang, 'New Table', 'طاولة جديدة')}
                </button>
              </div>
            </div>

            <p className="mb-4 text-xs font-medium leading-snug text-slate-400">{text(lang, 'Add, edit, or delete dining tables for the active branch. These tables appear in POS dine-in selection and table map views.', 'أضف أو عدّل أو احذف طاولات الفرع النشط. تظهر هذه الطاولات في اختيار طلبات داخل المطعم وخريطة الطاولات.')}</p>
            <div className="grid gap-3 lg:grid-cols-2">
              {branchTables.map(table => (
                <div
                  key={table.id}
                  className={`rounded-2xl border p-4 text-left shadow-sm ${motionClass} ${tableDraft.id === table.id ? 'border-blue-300 bg-blue-50/60 ring-4 ring-blue-500/10' : 'border-slate-100 bg-[#F5F5F7] hover:bg-white hover:shadow-md'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-bold tracking-tight text-slate-900">{table.label}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                        <span className="inline-flex items-center gap-1"><MapPin size={13} /> {table.areaId}</span>
                        <span className="text-slate-300">•</span>
                        <span className="inline-flex items-center gap-1"><UsersRound size={13} /> {table.seats} seats</span>
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-bold capitalize ${tableStatusClass(table.state)}`}>{table.state.replace('_', ' ')}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => editTable(table)}
                      className={`flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-blue-600 shadow-[0_4px_14px_rgba(0,0,0,0.03)] ${motionClass} hover:bg-blue-50 active:scale-[0.97]`}
                    >
                      <Pencil size={14} /> {text(lang, 'Edit', 'تعديل')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTableToDelete(table)}
                      className={`flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-medium text-rose-500 ${motionClass} hover:bg-rose-50 hover:text-rose-600 active:scale-[0.97]`}
                    >
                      <Trash2 size={14} /> {text(lang, 'Delete', 'حذف')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-5 xl:sticky xl:top-6">
          <div className={formCardClass}>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-blue-50 p-3 text-blue-600"><Plus size={22} /></div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{draft.id ? text(lang, 'Edit Branch', 'تعديل الفرع') : text(lang, 'Add New Branch', 'إضافة فرع جديد')}</h2>
                  <p className="mt-1 max-w-2xl text-xs font-medium leading-snug text-slate-400">
                    {draft.id
                      ? text(lang, 'Editing an existing branch. Choose New Branch before entering another location.', 'أنت تعدّل فرعاً موجوداً. اختر فرع جديد قبل إدخال موقع آخر.')
                      : text(lang, 'Create a separate branch record without replacing the active branch.', 'أنشئ سجلاً مستقلاً دون استبدال الفرع النشط.')}
                  </p>
                </div>
              </div>
              {draft.id && (
                <button onClick={startNewBranch} className={`inline-flex min-h-0 items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 ${motionClass} hover:bg-blue-50 hover:text-blue-600 active:scale-[0.97]`}>
                  <Plus size={15} /> {text(lang, 'New Branch', 'فرع جديد')}
                </button>
              )}
            </div>
            <div className="grid gap-3">
              <Field label={text(lang, 'Branch name in English', 'اسم الفرع بالإنجليزية')} help={text(lang, 'Shown in the dashboard, branch selector, and reports.', 'يظهر في لوحة الإدارة ومحدد الفروع والتقارير.')}>
                <input value={draft.nameEn} onChange={event => setDraft({ ...draft, nameEn: event.target.value })} placeholder={text(lang, 'e.g., Riyadh Olaya Branch', 'مثال: Riyadh Olaya Branch')} className="ios-input" />
              </Field>
              <Field label={text(lang, 'Branch name in Arabic', 'اسم الفرع بالعربية')} help={text(lang, 'Used on Arabic screens and localized reports.', 'يُستخدم في الشاشات العربية والتقارير المحلية.')}>
                <input value={draft.nameAr} onChange={event => setDraft({ ...draft, nameAr: event.target.value })} placeholder={text(lang, 'e.g., فرع الرياض العليا', 'مثال: فرع الرياض العليا')} className="ios-input" />
              </Field>
              <Field label={text(lang, 'Commercial registration number', 'رقم السجل التجاري')} help={text(lang, 'Keeps the legal branch identity available.', 'يحفظ هوية الفرع القانونية.')}>
                <input value={draft.crNumber || ''} onChange={event => setDraft({ ...draft, crNumber: event.target.value })} placeholder="e.g., 1010123456" className="ios-input" />
              </Field>
              <Field label={text(lang, 'VAT registration number', 'رقم التسجيل الضريبي')} help={text(lang, 'Used for VAT and ZATCA-related configuration.', 'يُستخدم لإعدادات الضريبة والزكاة والضريبة والجمارك.')}>
                <input value={draft.vatNumber || ''} onChange={event => setDraft({ ...draft, vatNumber: event.target.value })} placeholder="e.g., 300000000000003" className="ios-input" />
              </Field>
              <Field label={text(lang, 'Branch phone number', 'رقم هاتف الفرع')} help={text(lang, 'Visible to staff and customer-facing branch details.', 'يظهر للموظفين وبيانات الفرع للعملاء.')}>
                <input value={draft.phone || ''} onChange={event => setDraft({ ...draft, phone: event.target.value })} placeholder="e.g., +966 11 123 4567" className="ios-input" />
              </Field>
              <Field label={text(lang, 'City', 'المدينة')} help={text(lang, 'Groups branches in reports and operations dashboards.', 'يجمع الفروع في التقارير ولوحات التشغيل.')}>
                <input value={draft.city || ''} onChange={event => setDraft({ ...draft, city: event.target.value })} placeholder={text(lang, 'e.g., Riyadh', 'مثال: الرياض')} className="ios-input" />
              </Field>
              <Field label={text(lang, 'Full branch address', 'العنوان الكامل للفرع')} help={text(lang, 'Use the service address recognized by guests and delivery teams.', 'استخدم عنوان الخدمة المعروف للضيوف وفرق التوصيل.')}>
                <input value={draft.address || ''} onChange={event => setDraft({ ...draft, address: event.target.value })} placeholder={text(lang, 'e.g., Al Amlak Tower, Olaya Street, Riyadh', 'مثال: برج الأملاك، شارع العليا، الرياض')} className="ios-input" />
              </Field>
            </div>
            <button onClick={saveBranch} disabled={savingBranch} className={`ios-button-primary mt-5 w-full disabled:opacity-60 ${motionClass} active:scale-[0.97]`}>
              <Save size={18} /> {savingBranch ? text(lang, 'Saving...', 'جاري الحفظ...') : text(lang, 'Save Branch', 'حفظ الفرع')}
            </button>
          </div>

          <div className={formCardClass}>
            <div className="mb-5 flex items-start gap-3">
              <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600"><Armchair size={22} /></div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">{tableDraft.id ? text(lang, 'Edit Table', 'تعديل الطاولة') : text(lang, 'Add Table', 'إضافة طاولة')}</h2>
                <p className="mt-1 text-xs font-medium leading-snug text-slate-400">{text(lang, 'Configure floor inventory for the active branch.', 'اضبط مخزون الطاولات للفرع النشط.')}</p>
              </div>
            </div>
            <div className="grid gap-3">
              <Field label={text(lang, 'Table label', 'اسم أو رقم الطاولة')} help={text(lang, 'Use the exact table name staff sees on the floor plan.', 'استخدم نفس اسم الطاولة الذي يراه الموظفون.')}>
                <input value={tableDraft.label} onChange={event => setTableDraft({ ...tableDraft, label: event.target.value })} placeholder={text(lang, 'e.g., T12 or Patio 4', 'مثال: T12 أو Patio 4')} className="ios-input" />
              </Field>
              <Field label={text(lang, 'Dining area ID', 'معرّف منطقة الجلوس')} help={text(lang, 'Groups tables by room, patio, family section, or main floor.', 'يجمع الطاولات حسب الغرفة أو الجلسات الخارجية أو قسم العائلات أو الصالة الرئيسية.')}>
                <input value={tableDraft.areaId} onChange={event => setTableDraft({ ...tableDraft, areaId: event.target.value })} placeholder="e.g., area-main" className="ios-input" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Field label={text(lang, 'Seat count', 'عدد المقاعد')} help={text(lang, 'Helps hosts choose the right table size.', 'يساعد المضيفين على اختيار حجم الطاولة.')}>
                  <input type="number" value={tableDraft.seats} onChange={event => setTableDraft({ ...tableDraft, seats: Number(event.target.value) })} placeholder="e.g., 4" className="ios-input" />
                </Field>
                <Field label={text(lang, 'Table status', 'حالة الطاولة')} help={text(lang, 'Visible in table map views.', 'تظهر في شاشات خريطة الطاولات.')}>
                  <select value={tableDraft.state} onChange={event => setTableDraft({ ...tableDraft, state: event.target.value as DiningTable['state'] })} className="ios-input">
                  {['vacant', 'ordering', 'occupied', 'awaiting_bill', 'dirty'].map(state => <option key={state} value={state}>{state}</option>)}
                  </select>
                </Field>
              </div>
              <button onClick={saveTable} disabled={savingTable} className={`ios-button-primary w-full disabled:opacity-60 ${motionClass} active:scale-[0.97]`}>
                <Save size={18} /> {savingTable ? text(lang, 'Saving...', 'جاري الحفظ...') : tableDraft.id ? text(lang, 'Update Table', 'تحديث الطاولة') : text(lang, 'Add Table', 'إضافة طاولة')}
              </button>
            </div>
          </div>
        </aside>
      </div>
      <div className="pointer-events-none fixed -left-[9999px] top-0 opacity-0" aria-hidden="true">
        {branchTables.map(table => (
          <QRCodeCanvas
            key={table.id}
            ref={node => {
              qrCanvasRefs.current[table.id] = node;
            }}
            value={qrUrlForTable(table)}
            size={512}
            level="H"
            includeMargin
          />
        ))}
      </div>
      <ConfirmDialog
        open={!!tableToDelete}
        danger
        title={text(lang, 'Delete table?', 'حذف الطاولة؟')}
        message={tableToDelete
          ? text(lang, `${tableToDelete.label} will be removed from this branch.`, `سيتم حذف ${tableToDelete.label} من هذا الفرع.`)
          : ''}
        confirmLabel={text(lang, 'Delete', 'حذف')}
        cancelLabel={text(lang, 'Cancel', 'إلغاء')}
        onConfirm={deleteTable}
        onCancel={() => setTableToDelete(null)}
      />
    </div>
  );
};

export default RestaurantAdmin;
