import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Megaphone, PackageCheck, Percent, RefreshCw, Truck, XCircle } from 'lucide-react';
import { DeliveryChannel, DeliveryProviderEvent, ExternalDeliveryOrder, Language, Promotion, ServiceChargeConfig } from '../types';
import { StorageService } from '../services/storageService';
import {
  acceptHungerStationOrder,
  fetchHungerStationOrders,
  getHungerStationConfig,
  getHungerStationMissingConfig,
  rejectHungerStationOrder,
  syncHungerStationMenuAvailability,
  testHungerStationConnection,
} from '../services/hungerStationService';
import { useToast } from './Toast';

interface RestaurantFeaturesProps {
  lang: Language;
}

function txt(lang: Language, en: string, ar: string) {
  return lang === 'ar' ? ar : en;
}

const LOCAL_DELIVERY_LABELS: Record<Exclude<DeliveryChannel['provider'], 'hungerstation'>, string> = {
  jahez: 'Jahez',
  toyou: 'ToYou',
  ninja: 'Ninja',
  direct: 'Direct',
};

const RestaurantFeatures: React.FC<RestaurantFeaturesProps> = ({ lang }) => {
  const { toast } = useToast();
  const branchId = StorageService.getActiveBranchId();
  const [delivery, setDelivery] = useState<DeliveryChannel[]>(() => StorageService.getDeliveryChannels());
  const [externalOrders, setExternalOrders] = useState<ExternalDeliveryOrder[]>(() => StorageService.getExternalDeliveryOrders());
  const [providerEvents, setProviderEvents] = useState<DeliveryProviderEvent[]>(() => StorageService.getDeliveryProviderEvents());
  const [hungerStationConfig, setHungerStationConfig] = useState<DeliveryChannel>(() => getHungerStationConfig(branchId));
  const [hungerStationBusy, setHungerStationBusy] = useState('');
  const [promotions, setPromotions] = useState<Promotion[]>(() => StorageService.getPromotions());
  const [serviceCharges, setServiceCharges] = useState<ServiceChargeConfig[]>(() => StorageService.getServiceChargeConfigs());

  const branchPromotions = promotions.filter(item => item.branchIds.includes(branchId));
  const branchDelivery = delivery.filter(item => item.branchId === branchId);
  const branchServiceCharge = serviceCharges.find(item => item.branchId === branchId);
  const hungerStationOrders = externalOrders.filter(order => order.provider === 'hungerstation' && order.branchId === branchId);
  const hungerStationEvents = providerEvents.filter(event => event.provider === 'hungerstation' && event.branchId === branchId).slice(0, 5);
  const missingHungerStationConfig = getHungerStationMissingConfig(branchId);

  const reportCards = useMemo(() => [
    { label: txt(lang, 'Delivery channels', 'قنوات التوصيل'), value: branchDelivery.filter(item => item.active).length, icon: Truck },
    { label: txt(lang, 'Active promotions', 'العروض النشطة'), value: branchPromotions.filter(item => item.active).length, icon: Megaphone },
  ], [branchDelivery, branchPromotions, lang]);

  const refresh = () => {
    setDelivery(StorageService.getDeliveryChannels());
    setExternalOrders(StorageService.getExternalDeliveryOrders());
    setProviderEvents(StorageService.getDeliveryProviderEvents());
    setHungerStationConfig(getHungerStationConfig(branchId));
    setPromotions(StorageService.getPromotions());
    setServiceCharges(StorageService.getServiceChargeConfigs());
  };

  const toggleDelivery = (provider: DeliveryChannel['provider']) => {
    const existing = branchDelivery.find(item => item.provider === provider);
    const active = !existing?.active;
    const savedDelivery = StorageService.saveDeliveryChannel({
      id: existing?.id || `DCH-${provider}-${branchId}`,
      branchId,
      provider,
      active,
      menuSyncStatus: 'synced',
      lastSyncAt: Date.now(),
      status: active ? 'online' : 'offline',
    });
    const label = provider === 'hungerstation' ? 'HungerStation' : LOCAL_DELIVERY_LABELS[provider as Exclude<DeliveryChannel['provider'], 'hungerstation'>];
    const savedEvents = StorageService.saveDeliveryProviderEvent({
      id: `DPE-${provider}-${branchId}-${Date.now()}`,
      provider: provider as DeliveryProviderEvent['provider'],
      branchId,
      type: 'status_update',
      status: 'success',
      message: `${label} local channel ${active ? 'enabled' : 'disabled'} for this branch.`,
      createdAt: Date.now(),
    });
    setDelivery(savedDelivery);
    setProviderEvents(savedEvents);
    toast(txt(lang, `${label} local channel ${active ? 'enabled' : 'disabled'}.`, `تم ${active ? 'تفعيل' : 'إيقاف'} قناة ${label} المحلية.`), 'success');
  };

  const saveHungerStationConfig = () => {
    const missing = [
      !hungerStationConfig.endpointUrl?.trim(),
      !hungerStationConfig.merchantId?.trim(),
      !hungerStationConfig.externalBranchId?.trim(),
      !hungerStationConfig.apiKey?.trim(),
    ].some(Boolean);
    const savedDelivery = StorageService.saveDeliveryChannel({
      ...hungerStationConfig,
      id: hungerStationConfig.id || `DCH-hungerstation-${branchId}`,
      branchId,
      provider: 'hungerstation',
      active: !missing,
      timeoutSeconds: Number(hungerStationConfig.timeoutSeconds || 30),
      status: missing ? 'not_configured' : hungerStationConfig.status || 'offline',
      menuSyncStatus: hungerStationConfig.menuSyncStatus || 'pending',
    });
    setDelivery(savedDelivery);
    setHungerStationConfig(getHungerStationConfig(branchId));
    toast(txt(lang, 'HungerStation live configuration saved.', 'تم حفظ إعدادات هنقرستيشن المباشرة.'), 'success');
  };

  const runHungerStationAction = async (label: string, action: () => Promise<unknown>) => {
    setHungerStationBusy(label);
    try {
      await action();
      refresh();
      toast(txt(lang, 'HungerStation action completed.', 'اكتمل إجراء هنقرستيشن.'), 'success');
    } catch (error) {
      refresh();
      toast((error as Error).message, 'error');
    } finally {
      setHungerStationBusy('');
    }
  };

  const addPromotion = () => {
    const existingActive = branchPromotions.find(item => item.nameEn === 'Golden Hour 15%' && item.active);
    if (existingActive) {
      toast(txt(lang, 'Golden Hour promotion is already active for this branch.', 'عرض الساعة الذهبية مفعل بالفعل لهذا الفرع.'), 'info');
      return;
    }
    const savedPromotions = StorageService.savePromotion({
      id: `PRM-${Date.now()}`,
      branchIds: [branchId],
      nameEn: 'Golden Hour 15%',
      nameAr: 'الساعة الذهبية 15%',
      type: 'happy_hour',
      value: 15,
      startsAt: Date.now(),
      endsAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      active: true,
    });
    setPromotions(savedPromotions);
    toast(txt(lang, 'Golden Hour 15% promotion activated for this branch.', 'تم تفعيل عرض الساعة الذهبية 15% لهذا الفرع.'), 'success');
  };

  const saveServiceCharge = (percentage: number) => {
    const savedServiceCharges = StorageService.saveServiceChargeConfig({
      id: branchServiceCharge?.id || `SVC-${branchId}`,
      branchId,
      enabled: percentage > 0,
      percentage,
      appliesTo: ['dine_in', 'qr_order'],
    });
    setServiceCharges(savedServiceCharges);
    toast(txt(lang, percentage > 0 ? `${percentage}% service charge saved.` : 'Service charge disabled.', percentage > 0 ? `تم حفظ رسوم الخدمة ${percentage}%.` : 'تم إيقاف رسوم الخدمة.'), 'success');
  };

  return (
    <div className="ios-page">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ios-accent)]">Restaurant Operations</p>
        <h1 className="ios-title mt-2 text-4xl">{txt(lang, 'Analytics & Growth Modules', 'التحليلات ووحدات النمو')}</h1>
        <p className="ios-subtitle mt-3 text-sm">{txt(lang, 'Delivery, promotions, service charges, and branch reports.', 'التوصيل والعروض ورسوم الخدمة وتقارير الفروع.')}</p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {reportCards.map(card => (
          <div key={card.label} className="ios-card p-5">
            <card.icon className="text-[var(--ios-accent)]" size={28} />
            <p className="ios-title mt-4 text-3xl">{card.value}</p>
            <p className="ios-subtitle text-xs font-bold uppercase">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="ios-card p-6 xl:col-span-2">
          <h2 className="ios-title mb-4 flex items-center gap-2 text-2xl"><Truck className="text-[var(--ios-accent)]" /> {txt(lang, 'Delivery Dashboard', 'لوحة التوصيل')}</h2>
          <div className="mb-5 grid gap-3 md:grid-cols-4">
            {(['jahez', 'toyou', 'ninja', 'direct'] as DeliveryChannel['provider'][]).map(provider => {
              const active = branchDelivery.find(item => item.provider === provider)?.active;
              const label = LOCAL_DELIVERY_LABELS[provider as Exclude<DeliveryChannel['provider'], 'hungerstation'>];
              return (
                <button key={provider} onClick={() => toggleDelivery(provider)} className={`rounded-xl px-3 py-4 text-xs font-bold uppercase ${active ? 'bg-[var(--ios-accent)] text-white' : 'bg-[#F5F5F7] text-[var(--ios-secondary)]'}`}>
                  <span className="block">{label}</span>
                  <span className="mt-1 block text-[10px] normal-case opacity-75">{txt(lang, 'Local channel', 'قناة محلية')}</span>
                </button>
              );
            })}
          </div>
          <div className="rounded-[2rem] border border-[#E5E5EA] bg-[#FAFAFC] p-5">
            <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ios-accent)]">Live HungerStation</p>
                <h3 className="ios-title mt-1 text-2xl">{txt(lang, 'HungerStation Integration', 'تكامل هنقرستيشن')}</h3>
                <p className="ios-help mt-2 max-w-2xl">
                  {txt(lang, 'Enter the real HungerStation API or middleware details. No sandbox data is shown; live sync is blocked until the required credentials are saved.', 'أدخل بيانات API أو الوسيط الحقيقي لهنقرستيشن. لا توجد بيانات تجريبية؛ يتم منع المزامنة المباشرة حتى حفظ البيانات المطلوبة.')}
                </p>
              </div>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${missingHungerStationConfig.length ? 'bg-[#FFF4E5] text-[#C2410C]' : hungerStationConfig.status === 'online' ? 'bg-[#EAF8EF] text-[#34C759]' : 'bg-[#FFECEA] text-[#FF3B30]'}`}>
                {missingHungerStationConfig.length ? <AlertTriangle size={15} /> : hungerStationConfig.status === 'online' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                {missingHungerStationConfig.length ? txt(lang, 'Not configured', 'غير مهيأ') : hungerStationConfig.status || 'offline'}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input value={hungerStationConfig.endpointUrl || ''} onChange={event => setHungerStationConfig({ ...hungerStationConfig, endpointUrl: event.target.value })} placeholder="https://api.hungerstation.middleware.example" className="ios-input" />
              <input value={hungerStationConfig.merchantId || ''} onChange={event => setHungerStationConfig({ ...hungerStationConfig, merchantId: event.target.value })} placeholder="Merchant ID" className="ios-input" />
              <input value={hungerStationConfig.externalBranchId || ''} onChange={event => setHungerStationConfig({ ...hungerStationConfig, externalBranchId: event.target.value })} placeholder="HungerStation Branch ID" className="ios-input" />
              <input value={hungerStationConfig.apiKey || ''} onChange={event => setHungerStationConfig({ ...hungerStationConfig, apiKey: event.target.value })} placeholder="API token / key" className="ios-input" />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[180px_repeat(4,minmax(0,1fr))]">
              <input type="number" value={hungerStationConfig.timeoutSeconds || 30} onChange={event => setHungerStationConfig({ ...hungerStationConfig, timeoutSeconds: Number(event.target.value) })} placeholder="Timeout seconds" className="ios-input" />
              <button onClick={saveHungerStationConfig} className="ios-button-secondary">{txt(lang, 'Save Config', 'حفظ الإعدادات')}</button>
              <button onClick={() => runHungerStationAction('test', () => testHungerStationConnection(branchId))} disabled={!!hungerStationBusy} className="ios-button-secondary flex items-center justify-center gap-2 disabled:opacity-60">
                <RefreshCw size={16} className={hungerStationBusy === 'test' ? 'animate-spin' : ''} /> {txt(lang, 'Test Live', 'اختبار مباشر')}
              </button>
              <button onClick={() => runHungerStationAction('orders', () => fetchHungerStationOrders(branchId))} disabled={!!hungerStationBusy || missingHungerStationConfig.length > 0} className="ios-button-primary disabled:opacity-60">{txt(lang, 'Pull Orders', 'سحب الطلبات')}</button>
              <button onClick={() => runHungerStationAction('menu', () => syncHungerStationMenuAvailability(branchId))} disabled={!!hungerStationBusy || missingHungerStationConfig.length > 0} className="ios-button-primary disabled:opacity-60">{txt(lang, 'Sync Menu', 'مزامنة القائمة')}</button>
            </div>

            {missingHungerStationConfig.length > 0 && (
              <div className="mt-4 rounded-2xl bg-[#FFF4E5] p-4 text-sm font-semibold text-[#C2410C]">
                {txt(lang, `Missing: ${missingHungerStationConfig.join(', ')}. Live HungerStation actions are blocked until these are saved.`, `الحقول الناقصة: ${missingHungerStationConfig.join(', ')}. يتم منع الإجراءات المباشرة حتى حفظها.`)}
              </div>
            )}

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-black text-[var(--ios-text)]">{txt(lang, 'Live Orders', 'الطلبات المباشرة')}</p>
                  <span className="ios-badge">{hungerStationOrders.length}</span>
                </div>
                <div className="space-y-3">
                  {hungerStationOrders.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-[#D1D1D6] p-5 text-center text-sm font-semibold text-[var(--ios-secondary)]">
                      {txt(lang, 'No HungerStation orders loaded from the live endpoint yet.', 'لم يتم تحميل أي طلبات هنقرستيشن من الرابط المباشر بعد.')}
                    </div>
                  )}
                  {hungerStationOrders.slice(0, 6).map(order => (
                    <div key={order.id} className="rounded-2xl bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-[var(--ios-text)]">#{order.externalOrderId}</p>
                          <p className="text-xs font-semibold text-[var(--ios-secondary)]">{order.customerName || 'HungerStation guest'} / SAR {order.total.toFixed(2)}</p>
                          <p className="mt-1 text-xs font-semibold text-[var(--ios-secondary)]">{order.items.length} items / {order.status}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => runHungerStationAction(`accept-${order.id}`, () => acceptHungerStationOrder(order))} disabled={!!hungerStationBusy || order.status === 'imported' || order.status === 'rejected'} className="rounded-xl bg-[#34C759] px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                            {txt(lang, 'Accept', 'قبول')}
                          </button>
                          <button onClick={() => runHungerStationAction(`reject-${order.id}`, () => rejectHungerStationOrder(order))} disabled={!!hungerStationBusy || order.status === 'imported' || order.status === 'rejected'} className="rounded-xl bg-[#FF3B30] px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                            {txt(lang, 'Reject', 'رفض')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-3 text-sm font-black text-[var(--ios-text)]">{txt(lang, 'Provider Events', 'سجل المزود')}</p>
                <div className="space-y-2">
                  {hungerStationEvents.length === 0 && <div className="rounded-2xl bg-white p-4 text-xs font-semibold text-[var(--ios-secondary)]">{txt(lang, 'No provider events yet.', 'لا يوجد سجل للمزود بعد.')}</div>}
                  {hungerStationEvents.map(event => (
                    <div key={event.id} className="rounded-2xl bg-white p-4 text-xs font-semibold text-[var(--ios-secondary)]">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-black uppercase text-[var(--ios-text)]">{event.type}</span>
                        <span className={event.status === 'success' ? 'text-[#34C759]' : event.status === 'pending' ? 'text-[#C2410C]' : 'text-[#FF3B30]'}>{event.status}</span>
                      </div>
                      <p>{event.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="ios-card p-6">
          <h2 className="ios-title mb-4 flex items-center gap-2 text-2xl"><Percent className="text-[var(--ios-accent)]" /> {txt(lang, 'Promotions & Service', 'العروض والخدمة')}</h2>
          <div className="flex flex-wrap gap-3">
            <button onClick={addPromotion} className="ios-button-primary px-4">{txt(lang, 'Activate Golden Hour 15%', 'تفعيل الساعة الذهبية 15%')}</button>
            {[0, 5, 10, 15].map(value => (
              <button key={value} onClick={() => saveServiceCharge(value)} className={`rounded-xl px-4 py-3 text-sm font-bold ${branchServiceCharge?.percentage === value ? 'bg-[var(--ios-accent)] text-white' : 'bg-[#F5F5F7] text-[var(--ios-secondary)]'}`}>{value}% Service</button>
            ))}
          </div>
          <div className="ios-subtitle mt-4 flex items-center gap-2 rounded-xl bg-[#F5F5F7] p-4 text-sm">
            <PackageCheck size={18} /> {txt(lang, 'Reports cover revenue, delivery sync, waste variance, promotions, and service-charge performance.', 'تشمل التقارير الإيرادات ومزامنة التوصيل والهدر والعروض ورسوم الخدمة.')}
          </div>
        </section>
      </div>
    </div>
  );
};

export default RestaurantFeatures;
