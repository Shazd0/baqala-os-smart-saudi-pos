import React, { useState } from 'react';
import { HardwareConfig, Language, StoreConfig, ZatcaState } from '../types';
import { TRANSLATIONS } from '../constants';
import { StorageService } from '../services/storageService';
import { Image as ImageIcon, KeyRound, Printer, Save, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { firstError, nonNegativeNumber } from '../services/validationService';
import { APP_LOGO_DATA_URL } from '../services/appLogo';
import { useToast } from './Toast';
import LogoCropModal from './LogoCropModal';

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

interface SettingsProps {
  lang: Language;
  onUpdate: () => void;
}

const Settings: React.FC<SettingsProps> = ({ lang, onUpdate }) => {
  const t = TRANSLATIONS[lang];
  const { toast } = useToast();
  const [config, setConfig] = useState<StoreConfig>(StorageService.getConfig());
  const [hardware, setHardware] = useState<HardwareConfig>(StorageService.getHardwareConfig());
  const [zatca, setZatca] = useState<ZatcaState>(StorageService.getZatcaState());
  const [updateStatus, setUpdateStatus] = useState(StorageService.checkForUpdates());
  const [hardwareDetectMessage, setHardwareDetectMessage] = useState('');
  const desktopUpdatesAvailable = StorageService.isDesktopRuntime();
  const [identityEditable, setIdentityEditable] = useState(false);
  const [logoCropFile, setLogoCropFile] = useState<File | null>(null);
  const legalFields = [
    ['VAT Number', config.vatNumber || '—'],
    ['CR Number', config.crNumber || '—'],
    ['Phone', config.phone || '—'],
    ['Address', config.address || '—'],
    ['VAT Rate', `${((config.vatRate || 0) * 100).toFixed(0)}%`],
    ['Currency', config.currency || 'SAR'],
  ];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const error = firstError(
      nonNegativeNumber(config.lowStockThreshold ?? 0, 'Low stock threshold')
    );
    if (error) {
      toast(lang === 'ar' ? `تحقق من الإعدادات: ${error}` : error, 'error');
      return;
    }
    StorageService.saveConfig(config);
    onUpdate();
    toast(lang === 'ar' ? 'تم حفظ الإعدادات بنجاح!' : 'Settings saved successfully.', 'success');
  };

  const updateEnglishName = (value: string) => {
    setConfig(current => ({
      ...current,
      nameEn: value,
      nameAr: current.nameAr?.trim() ? current.nameAr : arabicNameFromEnglish(value),
    }));
  };

  const handleHardwareSave = (e: React.FormEvent) => {
    e.preventDefault();
    setHardware(StorageService.saveHardwareConfig(hardware));
    toast('Hardware settings saved.', 'success');
  };

  const generateCsr = () => {
    if (!StorageService.hasPermission('zatca_admin')) {
      toast('Only administrators can manage ZATCA onboarding.', 'error');
      return;
    }
    setZatca(StorageService.generateZatcaCsr());
  };

  const saveZatca = () => {
    setZatca(StorageService.saveZatcaState(zatca));
    toast('ZATCA settings saved.', 'success');
  };

  const checkUpdates = () => {
    if (!desktopUpdatesAvailable) {
      const message = 'Updates are handled by the web deployment pipeline.';
      setUpdateStatus({ checking: false, available: false, downloaded: false, error: message });
      toast(message, 'info');
      return;
    }
    setUpdateStatus(StorageService.checkForUpdates());
  };

  const installDownloadedUpdate = () => {
    if (!desktopUpdatesAvailable) {
      toast('Updates are deployed through the website hosting pipeline.', 'info');
      return;
    }
    const installed = StorageService.installUpdate();
    if (!installed) toast('No downloaded update is ready to install.', 'warning');
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast(lang === 'ar' ? 'يرجى اختيار ملف صورة.' : 'Please choose an image file.', 'error');
      return;
    }
    setLogoCropFile(file);
  };

  const testCashDrawer = () => {
    const result = StorageService.testCashDrawer();
    toast(result.message, result.ok ? 'success' : 'warning', 6000);
  };

  const autoDetectHardware = async () => {
    setHardwareDetectMessage('');
    setHardware(prev => ({ ...prev, barcodeScannerMode: 'keyboard' }));
    setHardwareDetectMessage('Browser printing uses the operating system print dialog. Scanner mode is set to USB keyboard.');
  };

  return (
    <div className="p-6 h-full flex flex-col bg-gray-50 overflow-y-auto pb-20">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">{t.storeSettings}</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-lg mb-4 text-gray-700 border-b pb-2">General Information</h3>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3 mb-4">
                <ShieldCheck className="text-amber-700 shrink-0" size={22} />
                <div>
                  <h4 className="font-black text-amber-900">Corporate Identity</h4>
                  <p className="text-xs text-amber-800 mt-1">
                    Restaurant display names can be edited here. CR, VAT, address, phone, currency, and VAT rate stay locked from first setup.
                  </p>
                </div>
              </div>
              <div className="mb-4 grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-wide text-amber-700">Restaurant Display Names</p>
                  <button type="button" onClick={() => setIdentityEditable(value => !value)} className="rounded-full border border-amber-100 bg-white px-3 py-1 text-xs font-black text-amber-700">
                    {identityEditable ? 'Lock editing' : 'Edit name'}
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-amber-800">Restaurant Name (English)</label>
                    <input
                      disabled={!identityEditable}
                      className="mt-1 w-full rounded-xl border border-amber-100 bg-white p-2 text-sm font-bold text-slate-900 disabled:bg-white/60"
                      value={config.nameEn || ''}
                      onChange={event => updateEnglishName(event.target.value)}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="block text-xs font-bold text-amber-800">Restaurant Name (Arabic)</label>
                      <button type="button" disabled={!identityEditable} onClick={() => setConfig(current => ({ ...current, nameAr: arabicNameFromEnglish(current.nameEn || '') }))} className="text-[11px] font-black text-[#007AFF] disabled:opacity-40">
                        Auto-fill
                      </button>
                    </div>
                    <input
                      dir="rtl"
                      disabled={!identityEditable}
                      className="mt-1 w-full rounded-xl border border-amber-100 bg-white p-2 text-right text-sm font-bold text-slate-900 disabled:bg-white/60"
                      value={config.nameAr || ''}
                      onChange={event => setConfig({ ...config, nameAr: event.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {legalFields.map(([label, value]) => (
                  <div key={label} className="bg-white/80 border border-amber-100 rounded-xl p-3">
                    <p className="text-[11px] uppercase tracking-wide font-bold text-amber-700">{label}</p>
                    <p className="mt-1 text-sm font-black text-slate-800 break-words">{value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Low Stock Threshold</label>
              <input type="number" min="0" className="w-full border rounded p-2 text-gray-900" value={config.lowStockThreshold ?? 5} onChange={e => setConfig({ ...config, lowStockThreshold: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Receipt Footer</label>
              <input className="w-full border rounded p-2 text-gray-900" value={config.footerMessage || ''} onChange={e => setConfig({ ...config, footerMessage: e.target.value })} />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-white border flex items-center justify-center text-emerald-600">
                  <ImageIcon size={20} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-800">
                    {lang === 'ar' ? 'شعار المطعم' : 'Restaurant Company Logo'}
                  </label>
                  <p className="text-xs text-gray-500">
                    {lang === 'ar' ? 'يظهر في الفاتورة وتقارير PDF' : 'Shown on receipts and PDF exports'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="h-20 w-20 rounded-2xl bg-white border border-dashed border-slate-300 flex items-center justify-center overflow-hidden">
                  <img src={config.logoDataUrl || APP_LOGO_DATA_URL} alt="Store logo" className="h-full w-full object-contain p-2" />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100 cursor-pointer btn-spring">
                    <Upload size={16} />
                    {lang === 'ar' ? 'رفع شعار' : 'Upload Logo'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  </label>
                  {config.logoDataUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        const saved = StorageService.saveConfig({ ...StorageService.getConfig(), logoDataUrl: '' });
                        setConfig(saved);
                        onUpdate();
                        toast(lang === 'ar' ? 'تم حذف الشعار' : 'Logo removed.', 'info');
                      }}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-red-100 bg-red-50 rounded-xl text-sm font-bold text-red-600 hover:bg-red-100"
                    >
                      <Trash2 size={16} />
                      {lang === 'ar' ? 'حذف الشعار' : 'Remove Logo'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <button type="submit" className="flex items-center justify-center gap-2 w-full bg-primary-600 text-white py-2 rounded hover:bg-primary-700">
              <Save size={18} /> {t.save}
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-lg mb-4 text-gray-700 border-b pb-2 flex items-center gap-2"><Printer /> Hardware & Payments</h3>
            <form onSubmit={handleHardwareSave} className="space-y-4">
              <button type="button" onClick={autoDetectHardware} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 font-black btn-spring">
                Auto Detect Connected Hardware
              </button>
              {hardwareDetectMessage && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-800 text-xs p-3">
                  {hardwareDetectMessage}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700">Receipt Printer Name</label>
                <input className="w-full border rounded p-2" value={hardware.receiptPrinter} onChange={e => setHardware({ ...hardware, receiptPrinter: e.target.value })} placeholder="Windows printer name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Receipt Width</label>
                <select className="w-full border rounded p-2" value={hardware.receiptWidth} onChange={e => setHardware({ ...hardware, receiptWidth: e.target.value as HardwareConfig['receiptWidth'] })}>
                  <option value="58mm">58mm</option>
                  <option value="80mm">80mm</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hardware.autoPrintReceipt} onChange={e => setHardware({ ...hardware, autoPrintReceipt: e.target.checked })} /> Auto-print receipt after checkout</label>
              <div>
                <label className="block text-sm font-medium text-gray-700">Barcode Scanner Mode</label>
                <select className="w-full border rounded p-2" value={hardware.barcodeScannerMode} onChange={e => setHardware({ ...hardware, barcodeScannerMode: e.target.value as HardwareConfig['barcodeScannerMode'] })}>
                  <option value="keyboard">USB keyboard wedge scanner</option>
                  <option value="manual">Manual barcode input</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Minimum Barcode Length</label>
                <input type="number" min="1" className="w-full border rounded p-2" value={hardware.barcodeMinLength} onChange={e => setHardware({ ...hardware, barcodeMinLength: parseInt(e.target.value) || 4 })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Cash Drawer Pulse Command</label>
                <input className="w-full border rounded p-2 font-mono text-xs" value={hardware.cashDrawerPulseCommand || ''} onChange={e => setHardware({ ...hardware, cashDrawerPulseCommand: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hardware.cashDrawerEnabled} onChange={e => setHardware({ ...hardware, cashDrawerEnabled: e.target.checked })} /> Cash drawer enabled</label>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                Enable the live gateway to send card payments to your mada terminal middleware. If disabled, card payments stay in manual external-terminal mode.
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hardware.requireCardApprovalReference} onChange={e => setHardware({ ...hardware, requireCardApprovalReference: e.target.checked })} /> Require card approval reference</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!hardware.paymentGatewayEnabled} onChange={e => setHardware({ ...hardware, paymentGatewayEnabled: e.target.checked })} /> Enable live mada/payment gateway</label>
              <div>
                <label className="block text-sm font-medium text-gray-700">Payment Gateway URL</label>
                <input className="w-full border rounded p-2" value={hardware.paymentGatewayUrl || ''} onChange={e => setHardware({ ...hardware, paymentGatewayUrl: e.target.value })} placeholder="https://terminal-middleware.yourdomain.com" />
                <p className="mt-1 text-xs text-gray-500">The app sends POST requests to /payments/mada on this server.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Gateway API Key</label>
                <input type="password" className="w-full border rounded p-2" value={hardware.paymentGatewayApiKey || ''} onChange={e => setHardware({ ...hardware, paymentGatewayApiKey: e.target.value })} placeholder="Bearer token for the middleware" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Terminal ID</label>
                <input className="w-full border rounded p-2" value={hardware.paymentGatewayTerminalId || ''} onChange={e => setHardware({ ...hardware, paymentGatewayTerminalId: e.target.value })} placeholder="e.g., TID-01" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Payment Timeout Seconds</label>
                <input type="number" min="10" className="w-full border rounded p-2" value={hardware.paymentGatewayTimeoutSeconds || 60} onChange={e => setHardware({ ...hardware, paymentGatewayTimeoutSeconds: parseInt(e.target.value) || 60 })} />
              </div>
              <button type="button" onClick={testCashDrawer} className="w-full bg-white border text-gray-700 rounded py-2 font-bold">Test Cash Drawer</button>
              <button className="w-full bg-gray-900 text-white rounded py-2 font-bold">Save Hardware Settings</button>
            </form>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-lg mb-4 text-gray-700 border-b pb-2 flex items-center gap-2"><ShieldCheck /> ZATCA Phase 2</h3>
          <div className="mb-4 p-3 rounded-lg border bg-amber-50 text-amber-900 text-sm">
            Current status: <strong>{zatca.onboardingStatus.replace(/_/g, ' ')}</strong>. Production invoices must not be marketed as certified until onboarding and compliance testing are complete.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Mode</label>
              <select className="w-full border rounded p-2" value={zatca.mode} onChange={e => setZatca({ ...zatca, mode: e.target.value as ZatcaState['mode'] })}>
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Reporting Endpoint</label>
              <input className="w-full border rounded p-2" value={zatca.reportingEndpoint} onChange={e => setZatca({ ...zatca, reportingEndpoint: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Compliance CSID</label>
              <input className="w-full border rounded p-2" value={zatca.complianceCsid} onChange={e => setZatca({ ...zatca, complianceCsid: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Production CSID</label>
              <input className="w-full border rounded p-2" value={zatca.productionCsid} onChange={e => setZatca({ ...zatca, productionCsid: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={generateCsr} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded"><KeyRound size={16} /> Generate CSR Payload</button>
            <button type="button" onClick={saveZatca} className="px-4 py-2 bg-gray-900 text-white rounded">Save ZATCA Settings</button>
          </div>
          {zatca.csrPayload && (
            <textarea readOnly className="mt-4 w-full h-24 border rounded p-2 text-xs font-mono" value={zatca.csrPayload} />
          )}
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-lg mb-4 text-gray-700 border-b pb-2">Auto Updates</h3>
          <p className="text-sm text-gray-500 mb-4">Web-only builds are updated by deploying a new website version.</p>
          <div className="text-sm bg-gray-50 border rounded p-3 mb-3">
            {!desktopUpdatesAvailable
              ? 'Website deployment controls updates. There is no local installer.'
              : updateStatus.error || (updateStatus.checking ? 'Checking for updates...' : updateStatus.available ? `Update available: ${updateStatus.version || ''}` : 'No update information yet.')}
          </div>
          <div className="flex gap-2">
            <button onClick={checkUpdates} disabled={!desktopUpdatesAvailable} className="flex-1 bg-gray-900 text-white rounded py-2 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500">Check</button>
            <button onClick={installDownloadedUpdate} disabled={!desktopUpdatesAvailable || !updateStatus.downloaded} className="flex-1 bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50 text-white rounded py-2">Install</button>
          </div>
        </div>
      </div>

      {logoCropFile && (
        <LogoCropModal
          file={logoCropFile}
          onCancel={() => setLogoCropFile(null)}
          onApply={dataUrl => {
            const saved = StorageService.saveConfig({ ...StorageService.getConfig(), logoDataUrl: dataUrl });
            setConfig(saved);
            setLogoCropFile(null);
            onUpdate();
            toast(lang === 'ar' ? 'تم قص الشعار وحفظه بنجاح' : 'Logo cropped and saved successfully.', 'success');
          }}
        />
      )}
    </div>
  );
};

export default Settings;
