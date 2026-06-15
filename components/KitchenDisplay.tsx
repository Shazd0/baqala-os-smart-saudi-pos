import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Flame, PackageCheck } from 'lucide-react';
import { KitchenStationType, KitchenTicket, Language } from '../types';
import { StorageService } from '../services/storageService';
import { CloudClient } from '../services/cloudClient';
import { FirebaseService } from '../services/firebaseService';
import { updateHungerStationOrderStatus } from '../services/hungerStationService';
import { useToast } from './Toast';

interface KitchenDisplayProps {
  lang: Language;
}

const stations: Array<{ id: KitchenStationType | 'all'; en: string; ar: string }> = [
  { id: 'all', en: 'All Stations', ar: 'كل المحطات' },
  { id: 'grill', en: 'Grill', ar: 'الشواية' },
  { id: 'appetizers', en: 'Appetizers', ar: 'المقبلات' },
  { id: 'beverage', en: 'Beverage', ar: 'المشروبات' },
  { id: 'packing', en: 'Packing', ar: 'التغليف' },
  { id: 'expediter', en: 'Expediter', ar: 'المتابعة' },
];

function label(lang: Language, en: string, ar: string) {
  return lang === 'ar' ? ar : en;
}

function slaClass(ticket: KitchenTicket) {
  const ageMinutes = (Date.now() - ticket.firedAt) / 60000;
  if (ageMinutes > 12) return 'bg-red-50 border-red-200 text-red-900';
  if (ageMinutes >= 8) return 'bg-yellow-50 border-yellow-200 text-yellow-900';
  return 'bg-emerald-50 border-emerald-200 text-emerald-900';
}

function slaLabel(lang: Language, ticket: KitchenTicket) {
  const ageMinutes = Math.floor((Date.now() - ticket.firedAt) / 60000);
  if (ageMinutes > 12) return label(lang, `Overdue by ${ageMinutes - 12} min`, `متأخر ${ageMinutes - 12} د`);
  if (ageMinutes >= 8) return label(lang, `${12 - ageMinutes} min to SLA`, `${12 - ageMinutes} د للحد`);
  return label(lang, `${ageMinutes} min`, `${ageMinutes} د`);
}

const KitchenDisplay: React.FC<KitchenDisplayProps> = ({ lang }) => {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<KitchenTicket[]>(() => StorageService.getKitchenTickets());
  const [station, setStation] = useState<KitchenStationType | 'all'>('all');
  const activeBranchId = StorageService.getActiveBranchId();

  const refreshTickets = () => {
    if (FirebaseService.isConfigured()) return;
    if (CloudClient.isConfigured()) {
      void CloudClient.list<KitchenTicket>('/kds')
        .then(cloudTickets => setTickets(cloudTickets))
        .catch(() => setTickets(StorageService.getKitchenTickets()));
      return;
    }
    setTickets(StorageService.getKitchenTickets());
  };

  useEffect(() => {
    if (FirebaseService.isConfigured()) {
      return FirebaseService.subscribe<KitchenTicket>('kitchenTickets', setTickets, 'firedAt');
    }
    refreshTickets();
    const intervalId = window.setInterval(refreshTickets, 2000);
    const handleFocus = () => refreshTickets();
    const handleStorage = () => refreshTickets();
    const handleKitchenUpdate = () => refreshTickets();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('oasis:kitchen-tickets-updated', handleKitchenUpdate);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('oasis:kitchen-tickets-updated', handleKitchenUpdate);
    };
  }, []);

  const visibleTickets = useMemo(() => {
    return tickets
      .filter(ticket => ticket.status !== 'ready' && ticket.status !== 'served' && ticket.status !== 'voided')
      .filter(ticket => !ticket.branchId || ticket.branchId === activeBranchId)
      .filter(ticket => station === 'all' || ticket.station === station)
      .sort((a, b) => a.firedAt - b.firedAt);
  }, [tickets, station, activeBranchId]);

  const updateTicket = (ticket: KitchenTicket, status: KitchenTicket['status']) => {
    toast(status === 'ready'
      ? label(lang, `${ticket.orderNumber} marked ready.`, `تم تجهيز ${ticket.orderNumber}.`)
      : label(lang, `${ticket.orderNumber} marked preparing.`, `تم وضع ${ticket.orderNumber} قيد التحضير.`),
      status === 'ready' ? 'success' : 'info');
    const updatedTicket = { ...ticket, status };
    const nextTickets = tickets.map(item => item.id === ticket.id ? updatedTicket : item);
    setTickets(status === 'ready' ? tickets.filter(item => item.id !== ticket.id) : nextTickets);

    if (CloudClient.isConfigured()) {
      void CloudClient.save<KitchenTicket>('/kds', updatedTicket);
    }
    if (FirebaseService.isConfigured()) {
      void FirebaseService.save('kitchenTickets', updatedTicket);
    }
    StorageService.saveKitchenTicket(updatedTicket);
    const persistedTickets = StorageService.getKitchenTickets();
    const orderTickets = (persistedTickets.length ? persistedTickets : nextTickets).filter(item => item.orderId === ticket.orderId);
    const order = StorageService.getRestaurantOrders().find(item => item.id === ticket.orderId);

    if (order) {
      const allReady = orderTickets.length > 0 && orderTickets.every(item => item.status === 'ready');
      const savedOrder = StorageService.saveRestaurantOrder({
        ...order,
        status: allReady ? 'ready' : 'preparing',
        updatedAt: Date.now(),
      });
      void updateHungerStationOrderStatus(savedOrder, allReady ? 'ready' : 'preparing');
    }

    if (status !== 'ready') {
      const refreshedTickets = StorageService.getKitchenTickets();
      setTickets(refreshedTickets.length ? refreshedTickets : nextTickets);
    }
  };

  return (
    <div className="h-full overflow-hidden p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-600">Back of house</p>
          <h1 className="text-3xl font-black text-slate-900">{label(lang, 'Kitchen Display System', 'شاشة المطبخ')}</h1>
          <p className="mt-1 text-sm text-slate-500">{label(lang, 'Station routing with green, yellow, and red SLA states.', 'توجيه حسب المحطة مع حالات وقت الخدمة.')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {stations.map(item => (
            <button key={item.id} onClick={() => setStation(item.id)} className={`rounded-2xl px-4 py-2 text-sm font-bold ${station === item.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
              {label(lang, item.en, item.ar)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid h-[calc(100%-7rem)] auto-rows-min gap-4 overflow-y-auto pb-6 lg:grid-cols-2 xl:grid-cols-3">
        {visibleTickets.length === 0 && (
          <div className="col-span-full rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            <PackageCheck className="mx-auto mb-3 text-emerald-500" size={40} />
            <p className="font-black">{label(lang, 'No active kitchen tickets.', 'لا توجد تذاكر مطبخ نشطة.')}</p>
          </div>
        )}
        {visibleTickets.map(ticket => (
          <article key={ticket.id} className={`rounded-[2rem] border p-5 shadow-sm ${ticket.status === 'ready' ? 'border-[var(--ios-accent)] bg-[var(--ios-accent-soft)] text-[var(--ios-accent)]' : slaClass(ticket)}`}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase opacity-70">{ticket.station}</p>
                <h2 className="text-2xl font-black">{ticket.orderNumber}</h2>
                <p className="text-sm font-bold opacity-80">{ticket.tableLabel || ticket.source}</p>
                <p className="mt-2 inline-flex rounded-full bg-white/80 px-3 py-1 text-xs font-black uppercase">{ticket.status}</p>
              </div>
              <div className="rounded-2xl bg-white/70 p-3">
                <Clock size={24} />
              </div>
            </div>

            <div className="mb-4 rounded-2xl bg-white/70 px-3 py-2 text-sm font-black">
              {slaLabel(lang, ticket)}
            </div>

            <div className="space-y-3">
              {ticket.items.map(item => (
                <div key={item.orderItemId} className="rounded-2xl bg-white/70 p-3">
                  <div className="flex justify-between gap-3">
                    <span className="font-black">{item.quantity} x {label(lang, item.nameEn, item.nameAr)}</span>
                  </div>
                  {!!item.modifiers.length && (
                    <p className="mt-1 text-xs font-semibold opacity-75">
                      {item.modifiers.map(modifier => label(lang, modifier.nameEn, modifier.nameAr)).join(', ')}
                    </p>
                  )}
                  {item.note && <p className="mt-1 text-xs font-bold text-red-700">{item.note}</p>}
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => updateTicket(ticket, 'preparing')} className="flex items-center justify-center gap-2 rounded-2xl bg-white px-3 py-3 text-sm font-black text-[var(--ios-text)]">
                <Flame size={16} /> {label(lang, 'Preparing', 'تحضير')}
              </button>
              <button type="button" onClick={() => updateTicket(ticket, 'ready')} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 py-3 text-sm font-black text-white">
                <CheckCircle2 size={16} /> {ticket.status === 'ready' ? label(lang, 'Ready ✓', 'جاهز ✓') : label(lang, 'Ready', 'جاهز')}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default KitchenDisplay;
