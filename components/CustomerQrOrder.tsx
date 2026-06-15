import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChefHat, MessageSquare, Minus, Phone, Plus, Search, ShoppingBag, Trash2, UserRound, Utensils, X } from 'lucide-react';
import { DiningTable, KitchenTicket, MenuCategory, MenuItem, RestaurantBranch, RestaurantOrder, RestaurantOrderItem } from '../types';
import { StorageService } from '../services/storageService';
import { calculateRestaurantOrderTotals } from '../services/restaurantService';
import { CloudClient } from '../services/cloudClient';
import { FirebaseService } from '../services/firebaseService';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';

interface CustomerQrOrderProps {
  tableId: string;
}

interface QrCartItem {
  menuItem: MenuItem;
  quantity: number;
  spiceLevel: 'regular' | 'mild' | 'spicy';
  note: string;
}

function asOrderItems(items: QrCartItem[]): RestaurantOrderItem[] {
  return items.map(item => ({
    id: `QRI-${item.menuItem.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    menuItemId: item.menuItem.id,
    nameEn: item.menuItem.nameEn,
    nameAr: item.menuItem.nameAr,
    quantity: item.quantity,
    unitPrice: item.menuItem.basePrice,
    modifiers: [],
    station: item.menuItem.station,
    note: [
      item.spiceLevel !== 'regular' ? `Spice: ${item.spiceLevel}` : '',
      item.note.trim(),
    ].filter(Boolean).join(' / ') || undefined,
    status: 'fired',
    firedAt: Date.now(),
  }));
}

function kitchenTicketsForQrOrder(order: RestaurantOrder): KitchenTicket[] {
  const byStation = new Map<string, RestaurantOrderItem[]>();
  order.items.filter(item => item.status === 'fired').forEach(item => {
    const stationItems = byStation.get(item.station) || [];
    stationItems.push(item);
    byStation.set(item.station, stationItems);
  });

  return [...byStation.entries()].map(([station, items]) => ({
    id: `KOT-${order.id}-${station}`,
    branchId: order.branchId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    station: station as KitchenTicket['station'],
    tableLabel: order.tableLabel,
    status: 'new',
    items: items.map(item => ({
      orderItemId: item.id,
      nameEn: item.nameEn,
      nameAr: item.nameAr,
      quantity: item.quantity,
      modifiers: item.modifiers,
      note: item.note,
    })),
    firedAt: Date.now(),
    dueAt: Date.now() + 12 * 60 * 1000,
    source: order.orderType,
  }));
}

const CustomerQrOrder: React.FC<CustomerQrOrderProps> = ({ tableId }) => {
  const { toast } = useToast();
  const [tables, setTables] = useState<DiningTable[]>(() => StorageService.getTables());
  const [cloudTable, setCloudTable] = useState<DiningTable | null>(null);
  const [cloudBranch, setCloudBranch] = useState<RestaurantBranch | null>(null);
  const [cloudCategories, setCloudCategories] = useState<MenuCategory[]>([]);
  const [cloudMenuItems, setCloudMenuItems] = useState<MenuItem[]>([]);
  const [cloudVatRate, setCloudVatRate] = useState<number | null>(null);
  const [cloudLoading, setCloudLoading] = useState(true);
  const [cloudError, setCloudError] = useState('');
  const [remoteSource, setRemoteSource] = useState<'cloud' | 'firestore' | 'local'>('local');
  const table = cloudTable || tables.find(item => item.id === tableId);
  const branchId = table?.branchId || StorageService.getActiveBranchId();
  const branch = cloudBranch || StorageService.getBranches().find(item => item.id === branchId);
  const categories = cloudCategories.length ? cloudCategories : StorageService.getMenuCategories();
  const menuItems = (cloudMenuItems.length ? cloudMenuItems : StorageService.getMenuItems()).filter(item =>
    item.active && (!item.branchIds?.length || item.branchIds.includes(branchId))
  );
  const [cart, setCart] = useState<QrCartItem[]>([]);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneWarning, setPhoneWarning] = useState(false);
  const [note, setNote] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [formError, setFormError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<RestaurantOrder | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setCloudLoading(true);

    // A dedicated cloud/LAN server is only available when it is explicitly
    // configured (Cloudflare tunnel / LAN API) or passed in the QR link as a
    // `cloudUrl` query parameter. On a static host (e.g. Netlify) there is no
    // such backend, so hitting it just returns 404 — we must skip it and read
    // straight from Firestore instead.
    const hasCloudServer = (() => {
      try {
        const params = new URLSearchParams(window.location.search);
        return !!params.get('cloudUrl') || CloudClient.isConfigured();
      } catch {
        return CloudClient.isConfigured();
      }
    })();

    const loadFromFirestore = async (): Promise<boolean> => {
      if (!FirebaseService.isConfigured()) return false;
      const [remoteTables, remoteBranches, remoteCategories, remoteItems] = await Promise.all([
        FirebaseService.list<DiningTable>('tables'),
        FirebaseService.list<RestaurantBranch>('branches'),
        FirebaseService.list<MenuCategory>('menuCategories'),
        FirebaseService.list<MenuItem>('menuItems'),
      ]);
      const remoteTable = remoteTables.find(item => item.id === tableId);
      if (!remoteTable) return false;
      if (!active) return true;
      const remoteBranch = remoteBranches.find(item => item.id === remoteTable.branchId) || null;
      setCloudTable(remoteTable);
      setCloudBranch(remoteBranch);
      setCloudCategories(remoteCategories.filter(item => item.active !== false));
      setCloudMenuItems(remoteItems.filter(item => item.active !== false));
      setCloudVatRate(0.15);
      setCloudError('');
      setRemoteSource('firestore');
      return true;
    };

    const bootstrap = async () => {
      // 1. Prefer a dedicated cloud/LAN server when one is actually configured.
      if (hasCloudServer) {
        try {
          const data = await CloudClient.publicQrBootstrap(tableId);
          if (!active) return;
          setCloudTable(data.table);
          setCloudBranch(data.branch);
          setCloudCategories(data.categories || []);
          setCloudMenuItems(data.menuItems || []);
          setCloudVatRate(data.vatRate || 0.15);
          setCloudError('');
          setRemoteSource('cloud');
          return;
        } catch {
          // Fall through to Firestore (the source of truth for the hosted app).
        }
      }

      // 2. Firestore is the source of truth for the hosted web app.
      try {
        if (await loadFromFirestore()) return;
        if (!active) return;
        setRemoteSource('local');
        setCloudError(
          FirebaseService.isConfigured()
            ? 'We could not find this table. Please scan the QR code on your table again.'
            : 'Could not connect to the restaurant server. Please ask the staff for help.'
        );
      } catch (error) {
        if (!active) return;
        setRemoteSource('local');
        setCloudError(error instanceof Error ? error.message : 'Could not connect to the restaurant server.');
      }
    };

    bootstrap().finally(() => {
      if (active) setCloudLoading(false);
    });

    return () => {
      active = false;
    };
  }, [tableId]);

  const orderItems = useMemo(() => asOrderItems(cart), [cart]);
  const totals = useMemo(() => calculateRestaurantOrderTotals(orderItems, 0, cloudVatRate || StorageService.getConfig().vatRate || 0.15), [orderItems, cloudVatRate]);
  const branchDisplayName = branch ? `${branch.nameEn}${branch.nameAr ? ` / ${branch.nameAr}` : ''}` : 'Oasis Dine';
  const totalCartQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const filteredMenuItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return menuItems
      .filter(item => categoryId === 'all' || item.categoryId === categoryId)
      .filter(item => !query || `${item.nameEn} ${item.nameAr}`.toLowerCase().includes(query));
  }, [menuItems, categoryId, searchTerm]);

  const isValidMobileNumber = (value: string) => {
    const normalized = value.replace(/[\s-]/g, '');
    return /^(05\d{8}|\+?9665\d{8})$/.test(normalized) || /^(\+?\d[\d\s-]{7,})$/.test(value);
  };

  const handlePhoneChange = (value: string) => {
    setGuestPhone(value);
    setPhoneVerified(false);
    if (phoneWarning) setPhoneWarning(false);
  };

  const verifyPhoneNumber = () => {
    if (!isValidMobileNumber(guestPhone)) {
      setPhoneVerified(false);
      setPhoneWarning(true);
      setFormError('Please enter a valid Saudi mobile number before verifying.');
      toast('Please enter a valid mobile number.', 'warning');
      window.setTimeout(() => setPhoneWarning(false), 700);
      return;
    }
    setPhoneVerified(true);
    setPhoneWarning(false);
    setFormError('');
    toast('Mobile number verified.', 'success');
  };

  const changeQty = (menuItem: MenuItem, delta: number) => {
    setCart(current => {
      const existing = current.find(item => item.menuItem.id === menuItem.id);
      if (!existing && delta > 0) return [...current, { menuItem, quantity: 1, spiceLevel: 'regular', note: '' }];
      if (!existing) return current;
      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) return current.filter(item => item.menuItem.id !== menuItem.id);
      return current.map(item => item.menuItem.id === menuItem.id ? { ...item, quantity: nextQty } : item);
    });
  };

  const updateCartItem = (menuItemId: string, patch: Partial<Pick<QrCartItem, 'spiceLevel' | 'note'>>) => {
    setCart(current => current.map(item => item.menuItem.id === menuItemId ? { ...item, ...patch } : item));
  };

  const requestConfirm = () => {
    const cleanName = guestName.trim();
    const cleanPhone = guestPhone.trim();
    if (!cleanName) {
      setFormError('Please enter your name before sending the order.');
      toast('Please enter your name.', 'warning');
      setCartDrawerOpen(true);
      return;
    }
    if (!isValidMobileNumber(cleanPhone)) {
      setFormError('Please enter a valid mobile number.');
      toast('Please enter a valid mobile number.', 'warning');
      setPhoneWarning(true);
      setCartDrawerOpen(true);
      window.setTimeout(() => setPhoneWarning(false), 700);
      return;
    }
    if (!phoneVerified) {
      setFormError('Please verify your mobile number before sending the order.');
      toast('Please verify your mobile number.', 'warning');
      setPhoneWarning(true);
      setCartDrawerOpen(true);
      window.setTimeout(() => setPhoneWarning(false), 700);
      return;
    }
    if (!cart.length) {
      setFormError('Please add at least one item.');
      toast('Please add at least one item.', 'warning');
      return;
    }
    setFormError('');
    setConfirmOpen(true);
  };

  const submitOrder = async () => {
    if (!table || !cart.length || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (remoteSource === 'cloud' && cloudTable) {
        try {
          const saved = await CloudClient.publicQrOrder({
            tableId: table.id,
            guestName: guestName.trim(),
            guestPhone: guestPhone.trim(),
            note: note.trim(),
            vatRate: cloudVatRate || StorageService.getConfig().vatRate || 0.15,
            items: cart.map(item => ({
              menuItemId: item.menuItem.id,
              quantity: item.quantity,
              spiceLevel: item.spiceLevel,
              note: item.note,
            })),
          });
          setSubmittedOrder(saved);
          setCart([]);
          setNote('');
          setConfirmOpen(false);
          setCartDrawerOpen(false);
          toast(`Order ${saved.orderNumber} sent to kitchen.`, 'success');
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not send order to the restaurant cloud server.';
          setFormError(message);
          setConfirmOpen(false);
          toast(message, 'error');
          return;
        }
      }

      const items = asOrderItems(cart);
      const calculated = calculateRestaurantOrderTotals(items, 0, cloudVatRate || StorageService.getConfig().vatRate || 0.15);
      const order: RestaurantOrder = {
        id: `ORD-QR-${Date.now()}`,
        branchId,
        orderNumber: '',
        orderType: 'qr_order',
        status: 'fired',
        tableId: table.id,
        tableLabel: table.label,
        channel: 'qr',
        items,
        subtotal: calculated.subtotal,
        discount: calculated.discount,
        vat: calculated.vat,
        total: calculated.total,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        note: [`Guest: ${guestName.trim()}`, `Mobile: ${guestPhone.trim()}`, note.trim()].filter(Boolean).join(' / '),
      };
      if (remoteSource === 'firestore' && FirebaseService.isConfigured()) {
        try {
          const saved: RestaurantOrder = {
            ...order,
            orderNumber: `OD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`,
            updatedAt: Date.now(),
          };
          await FirebaseService.save('restaurantOrders', saved);
          await FirebaseService.saveMany('kitchenTickets', kitchenTicketsForQrOrder(saved));
          setSubmittedOrder(saved);
          setCart([]);
          setNote('');
          setConfirmOpen(false);
          setCartDrawerOpen(false);
          toast(`Order ${saved.orderNumber} sent to kitchen.`, 'success');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not send your order. Please try again or ask the staff for help.';
          setFormError(message);
          setConfirmOpen(false);
          toast(message, 'error');
        }
        return;
      }
      const saved = StorageService.saveRestaurantOrder(order);
      const hasKitchenTickets = StorageService.getKitchenTickets().some(ticket => ticket.orderId === saved.id);
      if (!hasKitchenTickets) {
        kitchenTicketsForQrOrder(saved).forEach(ticket => StorageService.saveKitchenTicket(ticket));
      }
      const updatedTable = { ...table, state: 'ordering' as const, activeOrderId: saved.id, updatedAt: Date.now() };
      setTables(current => current.map(item => item.id === updatedTable.id ? updatedTable : item));
      const savedTables = StorageService.saveTable(updatedTable);
      setSubmittedOrder(saved);
      setCart([]);
      setNote('');
      setTables(savedTables);
      setConfirmOpen(false);
      setCartDrawerOpen(false);
      toast(`Order ${saved.orderNumber} sent to kitchen.`, 'success');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (cloudLoading && !table) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] p-5 text-[#1C1C1E]">
        <div className="mx-auto mt-20 max-w-md rounded-[20px] bg-white p-8 text-center shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
          <ChefHat className="mx-auto mb-4 text-[#007AFF]" size={42} />
          <h1 className="text-3xl font-black tracking-tight text-[#1C1C1E]">Loading menu</h1>
          <p className="mt-3 text-sm font-semibold text-[#8E8E93]">Connecting to the restaurant cloud server.</p>
        </div>
      </div>
    );
  }

  if (!table) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] p-5 text-[#1C1C1E]">
        <div className="mx-auto mt-20 max-w-md rounded-[20px] bg-white p-8 text-center shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
          <Utensils className="mx-auto mb-4 text-[#007AFF]" size={42} />
          <h1 className="text-3xl font-black tracking-tight text-[#1C1C1E]">Table not found</h1>
          <p className="mt-3 text-sm font-semibold text-[#8E8E93]">{cloudError || 'Please scan the QR code on your table again.'}</p>
        </div>
      </div>
    );
  }

function itemPhotos(item: MenuItem) {
  return item.images?.length ? item.images : item.image ? [item.image] : [];
}

  return (
    <div className="min-h-screen bg-[#F2F2F7] text-[#1C1C1E]">
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(18px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div className="mx-auto max-w-5xl px-4 py-5 pb-36">
        <header className="sticky top-0 z-20 -mx-4 mb-5 border-b border-slate-100/80 bg-white/90 px-4 py-4 shadow-[0_4px_24px_rgba(0,0,0,0.02)] backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#007AFF] text-white shadow-[0_12px_30px_rgba(0,122,255,0.18)]">
              <ChefHat size={24} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-black uppercase tracking-[0.22em] text-[#007AFF]">{branchDisplayName}</p>
              <h1 className="truncate text-2xl font-black tracking-tight text-[#1C1C1E]">QR Table Ordering</h1>
            </div>
          </div>
          <div className="mt-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-[#8E8E93]">Welcome to</p>
              <h2 className="text-4xl font-black tracking-tight text-[#1C1C1E]">Table {table.label}</h2>
              <p className="mt-1 max-w-sm text-sm font-semibold leading-5 text-[#8E8E93]">Browse visually, verify your mobile, and send your order directly to the kitchen.</p>
            </div>
            <button
              type="button"
              onClick={() => setCartDrawerOpen(true)}
              className="rounded-[18px] bg-blue-50 px-4 py-3 text-center text-[#007AFF] transition-all duration-200 ease-out active:scale-[0.96]"
            >
              <ShoppingBag size={22} className="mx-auto" />
              <p className="text-xs font-black">{totalCartQuantity} items</p>
            </button>
          </div>
        </header>

        {submittedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-5 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="w-full max-w-sm translate-y-0 rounded-[20px] bg-white p-7 text-center shadow-[0_24px_70px_rgba(15,23,42,0.18)] transition-all duration-200 ease-out animate-[slideIn_0.24s_ease-out]">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={34} />
              </div>
              <p className="text-2xl font-black tracking-tight text-[#1C1C1E]">Order sent to kitchen</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#8E8E93]">{submittedOrder.orderNumber} is now on the kitchen display. Our team will start preparing it shortly.</p>
              <button
                type="button"
                onClick={() => setSubmittedOrder(null)}
                className="mt-5 h-12 w-full rounded-[16px] bg-[#007AFF] text-sm font-black text-white transition-all duration-200 ease-out active:scale-[0.96]"
              >
                Continue browsing
              </button>
            </div>
          </div>
        )}

        <section className="mb-5 rounded-[20px] bg-white p-4 shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#007AFF]">Mobile Check</p>
              <h2 className="text-xl font-black tracking-tight text-[#1C1C1E]">Verify before checkout</h2>
            </div>
            {phoneVerified && (
              <span className="flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600">
                <CheckCircle2 size={14} /> Verified
              </span>
            )}
          </div>
          <div className={`flex items-center gap-2 rounded-[18px] border bg-[#F2F2F7] p-2 transition-all duration-200 ease-out ${phoneWarning ? 'border-[#FF3B30] ring-4 ring-red-500/10' : phoneVerified ? 'border-emerald-200' : 'border-transparent'}`}>
            <Phone className={phoneVerified ? 'text-emerald-600' : 'text-[#8E8E93]'} size={19} />
            <input
              value={guestPhone}
              onChange={event => handlePhoneChange(event.target.value)}
              placeholder="05xxxxxxxx"
              className="min-w-0 flex-1 bg-transparent py-3 text-base font-bold text-[#1C1C1E] outline-none placeholder:text-[#8E8E93]"
              inputMode="tel"
            />
            <button
              type="button"
              onClick={verifyPhoneNumber}
              className={`h-11 shrink-0 rounded-[14px] px-4 text-xs font-black transition-all duration-200 ease-out active:scale-[0.96] ${phoneVerified ? 'bg-emerald-50 text-emerald-600' : 'bg-[#007AFF] text-white'}`}
            >
              {phoneVerified ? 'Checked' : 'Check'}
            </button>
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 text-[#8E8E93]">Use your Saudi mobile number so the team can confirm anything about your order.</p>
        </section>

        {formError && (
          <div className="mb-5 rounded-[18px] border border-red-100 bg-[#FFECEA] p-4 text-sm font-bold text-[#FF3B30] shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
            {formError}
          </div>
        )}

        {cloudError && !cloudTable && (
          <div className="mb-5 rounded-[18px] border border-orange-100 bg-[#FFF4E5] p-4 text-sm font-bold text-[#C2410C] shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
            Cloud server not connected: {cloudError}. This page is using local preview data only.
          </div>
        )}

        <div className="mb-5 rounded-[20px] bg-white p-4 shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8E93]" size={18} />
            <input
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Search shawarma, coffee, dessert..."
              className="h-13 w-full rounded-[16px] border-0 bg-[#F2F2F7] py-4 pl-11 pr-4 text-base font-bold text-[#1C1C1E] outline-none transition-all duration-200 ease-out placeholder:text-[#8E8E93] focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setCategoryId('all')} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition-all duration-200 ease-out active:scale-[0.96] ${categoryId === 'all' ? 'bg-[#007AFF] text-white shadow-[0_8px_22px_rgba(0,122,255,0.18)]' : 'bg-[#F2F2F7] text-[#8E8E93]'}`}>
              All
            </button>
            {categories.map(category => (
              <button key={category.id} onClick={() => setCategoryId(category.id)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition-all duration-200 ease-out active:scale-[0.96] ${categoryId === category.id ? 'bg-[#007AFF] text-white shadow-[0_8px_22px_rgba(0,122,255,0.18)]' : 'bg-[#F2F2F7] text-[#8E8E93]'}`}>
                {category.nameEn}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredMenuItems.map(item => {
            const cartItem = cart.find(entry => entry.menuItem.id === item.id);
            const photos = itemPhotos(item);
            return (
              <article key={item.id} className="overflow-hidden rounded-[20px] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.02)] transition-all duration-200 ease-out active:scale-[0.99]">
                {photos.length ? (
                  <div className="bg-[#F2F2F7] p-3 pb-0">
                    <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-[18px]">
                      {photos.map((image, index) => (
                        <img key={`${item.id}-${index}`} src={image} alt={`${item.nameEn} ${index + 1}`} className="h-48 w-full min-w-full snap-center rounded-2xl object-cover" />
                      ))}
                    </div>
                    {photos.length > 1 && (
                      <div className="-mt-6 mb-3 flex justify-center gap-1">
                        {photos.map((_, index) => <span key={index} className="h-1.5 w-1.5 rounded-full bg-white/90 shadow" />)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="m-3 flex h-48 items-center justify-center rounded-2xl bg-blue-50 text-[#007AFF]">
                    <Utensils size={38} />
                  </div>
                )}
                <div className="p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-xl font-black tracking-tight text-[#1C1C1E]">{item.nameEn}</h2>
                      <p className="mt-1 text-sm font-semibold text-[#8E8E93]">{item.nameAr}</p>
                      <p className="mt-3 inline-flex rounded-full bg-[#F2F2F7] px-3 py-1 text-xs font-black text-[#8E8E93]">
                        {item.nutrition.caloriesKcal} kcal
                      </p>
                    </div>
                    <p className="shrink-0 text-lg font-extrabold text-[#007AFF]">
                      {item.basePrice.toFixed(2)} SAR
                    </p>
                  </div>
                  {!cartItem ? (
                    <button
                      type="button"
                      onClick={() => changeQty(item, 1)}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-[#F2F2F7] text-sm font-black text-[#1C1C1E] transition-all duration-200 ease-out active:scale-[0.96]"
                    >
                      <Plus size={18} /> Add to Cart
                    </button>
                  ) : (
                    <div className="flex h-12 items-center justify-between rounded-[16px] bg-[#007AFF] p-1 text-white transition-all duration-200 ease-out">
                      <button onClick={() => changeQty(item, -1)} className="flex h-10 w-12 items-center justify-center rounded-[13px] bg-white/15 transition-all duration-200 ease-out active:scale-[0.96]">
                        <Minus size={18} />
                      </button>
                      <span className="text-lg font-black">{cartItem.quantity}</span>
                      <button onClick={() => changeQty(item, 1)} className="flex h-10 w-12 items-center justify-center rounded-[13px] bg-white text-[#007AFF] transition-all duration-200 ease-out active:scale-[0.96]">
                        <Plus size={18} />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {filteredMenuItems.length === 0 && (
          <div className="rounded-[20px] bg-white p-8 text-center shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
            <Utensils className="mx-auto mb-3 text-[#007AFF]" size={36} />
            <p className="font-black text-[#1C1C1E]">No menu items found</p>
            <p className="mt-1 text-sm font-semibold text-[#8E8E93]">Try another search or category.</p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setCartDrawerOpen(true)}
        disabled={!cart.length}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-100/80 bg-white/90 p-4 text-left backdrop-blur-md transition-all duration-200 ease-out disabled:opacity-80 active:scale-[0.99]"
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8E8E93]">{totalCartQuantity} items added</p>
            <p className="truncate text-3xl font-black tracking-tight text-[#1C1C1E]">SAR {totals.total.toFixed(2)}</p>
          </div>
          <span className="flex h-12 shrink-0 items-center justify-center rounded-[16px] bg-[#007AFF] px-5 text-sm font-black text-white shadow-[0_10px_28px_rgba(0,122,255,0.2)]">
            Review Cart & Order
          </span>
        </div>
      </button>

      <div className={`fixed inset-0 z-40 bg-slate-950/25 backdrop-blur-sm transition-all duration-200 ease-out ${cartDrawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={() => setCartDrawerOpen(false)} />
      <aside className={`fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-hidden rounded-t-[20px] bg-white shadow-[0_-24px_70px_rgba(15,23,42,0.18)] transition-all duration-200 ease-out ${cartDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-center pt-3">
            <span className="h-1.5 w-12 rounded-full bg-slate-200" />
          </div>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#007AFF]">Review Cart</p>
              <h2 className="text-2xl font-black tracking-tight text-[#1C1C1E]">Confirm your order</h2>
            </div>
            <button type="button" onClick={() => setCartDrawerOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F2F2F7] text-[#1C1C1E] transition-all duration-200 ease-out active:scale-[0.96]">
              <X size={20} />
            </button>
          </div>
          <div className="max-h-[calc(92vh-166px)] overflow-y-auto px-5 py-4 pb-6">
            {cart.length === 0 ? (
              <div className="rounded-[20px] bg-[#F2F2F7] p-8 text-center">
                <ShoppingBag className="mx-auto mb-3 text-[#8E8E93]" size={36} />
                <p className="text-lg font-black text-[#1C1C1E]">Your cart is empty</p>
                <p className="mt-1 text-sm font-semibold text-[#8E8E93]">Add a dish from the menu to start your order.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map(item => (
                  <div key={item.menuItem.id} className="rounded-[20px] bg-[#F2F2F7] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-black text-[#1C1C1E]">{item.menuItem.nameEn}</p>
                        <p className="text-sm font-semibold text-[#8E8E93]">{item.quantity} x {item.menuItem.basePrice.toFixed(2)} SAR</p>
                      </div>
                      <button onClick={() => changeQty(item.menuItem, -item.quantity)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#FF3B30] transition-all duration-200 ease-out active:scale-[0.96]">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                      <label className="block">
                        <span className="mb-1 block text-xs font-black uppercase tracking-widest text-[#8E8E93]">Spice</span>
                        <select value={item.spiceLevel} onChange={event => updateCartItem(item.menuItem.id, { spiceLevel: event.target.value as QrCartItem['spiceLevel'] })} className="h-12 w-full rounded-[16px] border-0 bg-white px-3 text-sm font-bold text-[#1C1C1E] outline-none transition-all duration-200 ease-out focus:ring-4 focus:ring-blue-500/10">
                          <option value="regular">Regular</option>
                          <option value="mild">Mild</option>
                          <option value="spicy">Spicy</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-black uppercase tracking-widest text-[#8E8E93]">Item note</span>
                        <input
                          value={item.note}
                          onChange={event => updateCartItem(item.menuItem.id, { note: event.target.value })}
                          placeholder="Extra sauce, no onions..."
                          className="h-12 w-full rounded-[16px] border-0 bg-white px-3 text-sm font-bold text-[#1C1C1E] outline-none transition-all duration-200 ease-out placeholder:text-[#8E8E93] focus:ring-4 focus:ring-blue-500/10"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 grid gap-3">
              <div className="rounded-[20px] bg-white p-4 shadow-[0_4px_24px_rgba(0,0,0,0.02)] ring-1 ring-slate-100">
                <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#8E8E93]"><UserRound size={15} /> Guest name</label>
                <input value={guestName} onChange={event => setGuestName(event.target.value)} placeholder="e.g., Ahmed Al-Qahtani" className="h-12 w-full rounded-[16px] border-0 bg-[#F2F2F7] px-3 text-base font-bold text-[#1C1C1E] outline-none transition-all duration-200 ease-out placeholder:text-[#8E8E93] focus:ring-4 focus:ring-blue-500/10" />
              </div>
              <div className="rounded-[20px] bg-white p-4 shadow-[0_4px_24px_rgba(0,0,0,0.02)] ring-1 ring-slate-100">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#8E8E93]"><Phone size={15} /> Mobile number</label>
                  {phoneVerified && <span className="flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600"><CheckCircle2 size={14} /> Verified</span>}
                </div>
                <div className={`flex items-center gap-2 rounded-[16px] bg-[#F2F2F7] p-2 transition-all duration-200 ease-out ${phoneWarning ? 'ring-4 ring-red-500/10' : ''}`}>
                  <input value={guestPhone} onChange={event => handlePhoneChange(event.target.value)} placeholder="05xxxxxxxx" className="h-10 min-w-0 flex-1 bg-transparent px-2 text-base font-bold text-[#1C1C1E] outline-none placeholder:text-[#8E8E93]" inputMode="tel" />
                  <button type="button" onClick={verifyPhoneNumber} className={`h-10 rounded-[13px] px-4 text-xs font-black transition-all duration-200 ease-out active:scale-[0.96] ${phoneVerified ? 'bg-emerald-50 text-emerald-600' : 'bg-[#007AFF] text-white'}`}>
                    {phoneVerified ? 'Checked' : 'Verify Number'}
                  </button>
                </div>
              </div>
              <div className="rounded-[20px] bg-white p-4 shadow-[0_4px_24px_rgba(0,0,0,0.02)] ring-1 ring-slate-100">
                <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#8E8E93]"><MessageSquare size={15} /> Order note</label>
                <input value={note} onChange={event => setNote(event.target.value)} placeholder="Optional kitchen note..." className="h-12 w-full rounded-[16px] border-0 bg-[#F2F2F7] px-3 text-base font-bold text-[#1C1C1E] outline-none transition-all duration-200 ease-out placeholder:text-[#8E8E93] focus:ring-4 focus:ring-blue-500/10" />
              </div>
            </div>
          </div>
          <div className="border-t border-slate-100 bg-white/95 p-4 backdrop-blur-md">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8E8E93]">Total due</p>
                <p className="text-3xl font-black tracking-tight text-[#1C1C1E]">SAR {totals.total.toFixed(2)}</p>
              </div>
              <button
                onClick={requestConfirm}
                disabled={!cart.length || isSubmitting}
                aria-busy={isSubmitting}
                data-loading={isSubmitting}
                className="h-12 rounded-[16px] bg-[#007AFF] px-6 text-sm font-black text-white shadow-[0_10px_28px_rgba(0,122,255,0.2)] transition-all duration-200 ease-out disabled:opacity-40 active:scale-[0.96]"
              >
                {isSubmitting ? 'Sending...' : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      </aside>

      <ConfirmDialog
        open={confirmOpen}
        title="Send order to kitchen?"
        message={`${guestName || 'Guest'}, your order for table ${table.label} will go directly to the kitchen display.`}
        confirmLabel="Yes, send"
        cancelLabel="Cancel"
        loading={isSubmitting}
        loadingLabel="Sending..."
        onConfirm={() => { void submitOrder(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

export default CustomerQrOrder;
