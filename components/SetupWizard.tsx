import React, { useState } from 'react';
import { InitialSetupPayload, StoreConfig } from '../types';
import { INITIAL_STORE_CONFIG } from '../constants';
import { StorageService } from '../services/storageService';
import { APP_LOGO_DATA_URL } from '../services/appLogo';
import LogoCropModal from './LogoCropModal';
import { Database, Image as ImageIcon, Loader2, LockKeyhole, Pencil, RefreshCw, ShieldCheck, Store, Upload } from 'lucide-react';

const APP_NAME = 'Oasis Dine RMS';

const NAME_TRANSLATIONS: Record<string, string> = {
  oasis: 'واحة',
  dine: 'داين',
  restaurant: 'مطعم',
  cafe: 'كافيه',
  coffee: 'قهوة',
  kitchen: 'مطبخ',
  grill: 'مشويات',
  burger: 'برجر',
  pizza: 'بيتزا',
  shawarma: 'شاورما',
  house: 'هاوس',
  palace: 'قصر',
  lounge: 'لاونج',
  bakery: 'مخبز',
  sweets: 'حلويات',
  fresh: 'فريش',
  golden: 'الذهبي',
  royal: 'الملكي',
  saudi: 'السعودي',
  arabian: 'العربي',
};

function arabicNameFromEnglish(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map(word => {
      const normalized = word.toLowerCase().replace(/[^a-z0-9]/g, '');
      return NAME_TRANSLATIONS[normalized] || word;
    })
    .join(' ');
}

interface SetupWizardProps {
  onComplete: () => void;
}

const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const [config, setConfig] = useState<StoreConfig>({ ...INITIAL_STORE_CONFIG, currency: 'SAR', vatRate: 0.15 });
  const [adminName, setAdminName] = useState('Administrator');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [error, setError] = useState('');
  const [arabicNameEditable, setArabicNameEditable] = useState(false);
  const [arabicNameTouched, setArabicNameTouched] = useState(false);
  const [logoCropFile, setLogoCropFile] = useState<File | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!config.nameEn.trim() || !config.nameAr.trim() || !config.crNumber?.trim() || !config.phone.trim() || !config.address?.trim()) {
      setError('Store English name, Arabic name, CR number, phone, and address are required.');
      return;
    }
    if (!/^\d{10}$/.test(config.crNumber)) {
      setError('Saudi CR number must be 10 digits.');
      return;
    }
    if (!/^\d{15}$/.test(config.vatNumber)) {
      setError('Saudi VAT number must be 15 digits.');
      return;
    }
    if (password.length < 6 || password !== confirmPassword) {
      setError('Administrator password must be at least 6 characters and match confirmation.');
      return;
    }

    const payload: InitialSetupPayload = {
      config: { ...config, nameEn: config.nameEn.trim(), nameAr: config.nameAr.trim(), setupComplete: true },
      admin: { name: adminName, username, password }
    };
    setIsProvisioning(true);
    try {
      StorageService.createInitialSetup(payload);
      onComplete();
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : 'Unable to create the Firebase production workspace.');
      setIsProvisioning(false);
    }
  };

  const updateEnglishName = (value: string) => {
    const generatedName = arabicNameFromEnglish(value);
    setConfig(current => ({
      ...current,
      nameEn: value,
      nameAr: arabicNameTouched ? current.nameAr : generatedName,
    }));
  };

  const regenerateArabicName = () => {
    setConfig(current => ({ ...current, nameAr: arabicNameFromEnglish(current.nameEn) }));
    setArabicNameTouched(false);
    setArabicNameEditable(false);
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setLogoCropFile(file);
  };

  const inputClass = 'mt-2 h-12 w-full rounded-xl border-[1.5px] border-transparent bg-[#E9E9EB] px-4 text-sm font-semibold text-[#1C1C1E] placeholder:text-[#A9A9A9] outline-none [transition:all_0.2s_cubic-bezier(0.4,0,0.2,1)] focus:border-[#007AFF] focus:bg-white focus:shadow-[0_0_0_4px_rgba(0,122,255,0.08)] disabled:cursor-not-allowed disabled:opacity-60';
  const fieldLabelClass = 'text-sm font-bold text-slate-900';
  const microCopyClass = 'mt-1 text-[11px] font-medium leading-snug text-slate-400';

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-[#F2F2F7] px-6 text-[#1C1C1E]">
      <div className="relative flex max-h-[calc(100vh-48px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white p-8 shadow-[0_12px_48px_rgba(0,0,0,0.04)]">
        <div className="mb-6 flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#007AFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <Store size={28} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-extrabold tracking-tight text-[#1C1C1E]">{APP_NAME}</h1>
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-600">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
                  Firestore ready
                </span>
              </div>
              <p className="mt-2 text-sm font-medium leading-6 text-[#8E8E93]">Enter the restaurant identity once. After this, the app will only ask for login.</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 md:flex">
            <LockKeyhole size={14} /> Secure Firebase setup
          </div>
        </div>

        <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto pr-1">
          <fieldset disabled={isProvisioning} className="space-y-5 disabled:opacity-80">
            <div className="flex gap-3 rounded-xl border border-amber-200/60 bg-amber-50/70 p-4 text-xs font-medium leading-relaxed text-amber-800">
              <ShieldCheck className="mt-0.5 shrink-0 text-amber-600" size={18} />
              <p>ZATCA Phase 2 production status will remain “not configured” until you complete CSR/certificate onboarding and validate sandbox results.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <section className="space-y-4 rounded-2xl border border-slate-100 bg-white">
                <div>
                  <p className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-[#007AFF]">1. Corporate Identity</p>
                  <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
                    License activation is completed before this setup screen. Now add the restaurant display identity used on receipts, reports, and customer screens.
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className={fieldLabelClass}>Restaurant Name (English)</label>
                      <input required className={inputClass} placeholder="e.g., Oasis Dine" value={config.nameEn} onChange={e => updateEnglishName(e.target.value)} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <label className={fieldLabelClass}>Restaurant Name (Arabic)</label>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={regenerateArabicName} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black text-[#007AFF]">
                            <RefreshCw size={12} /> Auto
                          </button>
                          <button type="button" onClick={() => { setArabicNameEditable(true); setArabicNameTouched(true); }} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600">
                            <Pencil size={12} /> Edit
                          </button>
                        </div>
                      </div>
                      <input
                        required
                        readOnly={!arabicNameEditable}
                        className={`${inputClass} text-right ${!arabicNameEditable ? 'cursor-default bg-slate-100' : ''}`}
                        placeholder="مثال: واحة داين"
                        value={config.nameAr}
                        onChange={e => {
                          setArabicNameTouched(true);
                          setConfig({ ...config, nameAr: e.target.value });
                        }}
                      />
                      <p className={microCopyClass}>Arabic name is generated from the English name. Use Edit for the official Arabic spelling.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#007AFF]">
                          <ImageIcon size={20} />
                        </div>
                        <div>
                          <label className={fieldLabelClass}>Restaurant Logo</label>
                          <p className={microCopyClass}>Upload a logo for receipts, reports, and customer screens.</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white">
                          <img src={config.logoDataUrl || APP_LOGO_DATA_URL} alt="Restaurant logo" className="h-full w-full object-contain p-2" />
                        </div>
                        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">
                          <Upload size={16} />
                          Upload Logo
                          <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className={fieldLabelClass}>VAT Number <span className="text-rose-500">*</span></label>
                      <input required inputMode="numeric" maxLength={15} className={inputClass} placeholder="15 digits" value={config.vatNumber} onChange={e => setConfig({ ...config, vatNumber: e.target.value.replace(/\D/g, '').slice(0, 15) })} />
                      <p className={microCopyClass}>Saudi VAT must be exactly 15 digits.</p>
                    </div>
                    <div>
                      <label className={fieldLabelClass}>CR Number <span className="text-rose-500">*</span></label>
                      <input required inputMode="numeric" maxLength={10} className={inputClass} placeholder="10 digits" value={config.crNumber || ''} onChange={e => setConfig({ ...config, crNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
                      <p className={microCopyClass}>Saudi Commercial Registration must be exactly 10 digits.</p>
                    </div>
                    <div>
                      <label className={fieldLabelClass}>Phone</label>
                      <input required className={inputClass} placeholder="+966 11 123 4567" value={config.phone} onChange={e => setConfig({ ...config, phone: e.target.value })} />
                    </div>
                    <div>
                      <label className={fieldLabelClass}>Physical Address</label>
                      <input required className={inputClass} placeholder="Branch headquarters address" value={config.address || ''} onChange={e => setConfig({ ...config, address: e.target.value })} />
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-4 rounded-2xl border border-slate-100 bg-white">
                <div>
                  <p className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-[#007AFF]">2. Master Admin Account</p>
                  <div className="space-y-4">
                    <div>
                      <label className={fieldLabelClass}>Administrator Name</label>
                      <input required className={inputClass} placeholder="Administrator" value={adminName} onChange={e => setAdminName(e.target.value)} />
                    </div>
                    <div>
                      <label className={fieldLabelClass}>Administrator Username</label>
                      <input required className={inputClass} placeholder="admin" value={username} onChange={e => setUsername(e.target.value)} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className={fieldLabelClass}>Password</label>
                        <button type="button" disabled={isProvisioning} onClick={() => setShowPassword(value => !value)} className="text-xs font-bold text-[#007AFF] [transition:all_0.2s_cubic-bezier(0.4,0,0.2,1)] hover:text-[#006EE6] active:scale-[0.97] disabled:opacity-50">
                          {showPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <input required type={showPassword ? 'text' : 'password'} className={`${inputClass} font-mono`} placeholder="Minimum 6 characters" value={password} onChange={e => setPassword(e.target.value)} />
                    </div>
                    <div>
                      <label className={fieldLabelClass}>Confirm Password</label>
                      <input required type={showPassword ? 'text' : 'password'} className={`${inputClass} font-mono`} placeholder="Re-enter password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="flex items-center gap-3 text-slate-700">
                        <Database size={18} className="text-[#007AFF]" />
                        <p className="text-xs font-bold uppercase tracking-[0.14em]">Firebase Production Store</p>
                      </div>
                      <p className="mt-2 text-xs font-medium leading-relaxed text-slate-400">Staff credentials and restaurant identity are written to the Firebase production workspace.</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div>}

            <button disabled={isProvisioning} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#007AFF] text-sm font-bold tracking-tight text-white shadow-[0_12px_30px_rgba(0,122,255,0.2)] [transition:all_0.2s_cubic-bezier(0.4,0,0.2,1)] hover:bg-[#006EE6] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70">
              {isProvisioning ? <Loader2 className="animate-spin" size={18} /> : <Database size={18} />}
              {isProvisioning ? 'Creating Firebase production workspace...' : 'Create Firebase Production Workspace'}
            </button>
          </fieldset>
        </form>

        {isProvisioning && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white px-8 py-6 shadow-[0_12px_36px_rgba(0,0,0,0.08)]">
              <Loader2 className="animate-spin text-[#007AFF]" size={28} />
              <p className="text-sm font-bold text-slate-900">Provisioning secure Firebase workspace</p>
              <p className="text-xs font-medium text-slate-400">Preparing production-ready activation data.</p>
            </div>
          </div>
        )}
        {logoCropFile && (
          <LogoCropModal
            file={logoCropFile}
            onCancel={() => setLogoCropFile(null)}
            onApply={dataUrl => {
              setConfig(current => ({ ...current, logoDataUrl: dataUrl }));
              setLogoCropFile(null);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default SetupWizard;
