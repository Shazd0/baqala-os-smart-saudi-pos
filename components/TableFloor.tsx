import React, { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Banknote, Brush, Circle, CreditCard, ReceiptText, Utensils, Users } from 'lucide-react';
import { CartItem, Category, DiningTable, Language, RestaurantOrder, TableState } from '../types';
import { StorageService } from '../services/storageService';
import { orderItemUnitTotal } from '../services/restaurantService';
import { processMadaPayment } from '../services/paymentGateway';
import { getCloudBaseUrl } from '../services/cloudClient';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';

interface TableFloorProps {
  lang: Language;
  onChange?: () => void;
  onCheckout: (
    items: CartItem[],
    method: 'cash' | 'card' | 'credit',
    customerId?: string,
    discount?: number,
    note?: string,
    earnedPoints?: number,
    preCalculated?: { subtotal: number; vat: number; total: number; selectiveTaxAmount: number },
    paymentApprovalReference?: string
  ) => void;
}

const stateLabels: Record<TableState, { en: string; ar: string; className: string }> = {
  vacant: { en: 'Vacant', ar: 'شاغرة', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  occupied: { en: 'Eating', ar: 'يتناولون الطعام', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  ordering: { en: 'Ordering', ar: 'قيد الطلب', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  awaiting_bill: { en: 'Awaiting Bill', ar: 'بانتظار الفاتورة', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  dirty: { en: 'Needs Cleaning', ar: 'تحتاج تنظيف', className: 'bg-red-50 text-red-700 border-red-200' },
};

function text(lang: Language, en: string, ar: string) {
  return lang === 'ar' ? ar : en;
}

function toCartItems(order: RestaurantOrder): CartItem[] {
  return order.items.map(item => ({
    id: item.id,
    nameEn: item.nameEn,
    nameAr: item.nameAr,
    barcode: '',
    price: orderItemUnitTotal(item),
    category: Category.MISC,
    stock: 9999,
    quantity: item.quantity,
    unit: 'plate',
    selectiveTax: 'none',
  }));
}

const TableFloor: React.FC<TableFloorProps> = ({ lang, onChange, onCheckout }) => {
  const { toast } = useToast();
  const [areas] = useState(() => StorageService.getDiningAreas());
  const [tables, setTables] = useState<DiningTable[]>(() => StorageService.getTables());
  const [areaId, setAreaId] = useState('all');
  const [orders, setOrders] = useState<RestaurantOrder[]>(() => StorageService.getRestaurantOrders());
  const [pendingPayment, setPendingPayment] = useState<null | { table: DiningTable; method: 'cash' | 'card' }>(null);
  const [pendingState, setPendingState] = useState<null | { table: DiningTable; state: TableState }>(null);
  const [processingTableId, setProcessingTableId] = useState<string | null>(null);
  const activeBranchId = StorageService.getActiveBranchId();

  const qrUrlForTable = (table: DiningTable) => {
    const cloudUrl = getCloudBaseUrl();
    const url = new URL(cloudUrl || window.location.href);
    url.search = '';
    url.searchParams.set('qrTable', table.id);
    return url.toString();
  };

  const visibleTables = useMemo(
    () => tables
      .filter(table => !table.branchId || table.branchId === activeBranchId)
      .filter(table => areaId === 'all' || table.areaId === areaId),
    [tables, areaId, activeBranchId]
  );

  const setState = (table: DiningTable, state: TableState) => {
    const updatedTable = { ...table, state, activeOrderId: state === 'vacant' || state === 'dirty' ? undefined : table.activeOrderId, updatedAt: Date.now() };
    setTables(current => current.map(item => item.id === updatedTable.id ? updatedTable : item));
    const savedTables = StorageService.saveTable(updatedTable);
    setTables(savedTables);
    onChange?.();
    toast(text(lang, `${table.label} marked ${stateLabels[state].en}.`, `تم تحديث حالة ${table.label}.`), state === 'dirty' ? 'warning' : 'success');
  };

  const requestState = (table: DiningTable, state: TableState) => {
    if (state === 'vacant' || state === 'dirty') {
      setPendingState({ table, state });
      return;
    }
    setState(table, state);
  };

  const confirmStateChange = () => {
    if (!pendingState) return;
    setState(pendingState.table, pendingState.state);
    setPendingState(null);
  };

  const orderForTable = (table: DiningTable) => {
    return orders.find(order => order.id === table.activeOrderId)
      || orders.find(order => order.tableId === table.id && !['paid', 'cancelled'].includes(order.status));
  };

  const paidOrderForTable = (table: DiningTable) => {
    if (table.state === 'dirty' || table.state === 'vacant') return undefined;
    return orders
      .filter(order => order.tableId === table.id && order.status === 'paid')
      .sort((a, b) => (b.paidAt || b.updatedAt) - (a.paidAt || a.updatedAt))[0];
  };

  const tableStatusLabel = (table: DiningTable, activeOrder?: RestaurantOrder, paidOrder?: RestaurantOrder) => {
    if (paidOrder) return text(lang, 'Finished / Paid', 'منتهي / مدفوع');
    if (activeOrder?.status === 'ready') return text(lang, 'Food Ready', 'الطلب جاهز');
    if (table.state === 'occupied') return text(lang, 'Eating', 'يتناولون الطعام');
    if (table.state === 'awaiting_bill') return text(lang, 'Waiting for Bill', 'بانتظار الفاتورة');
    if (table.state === 'ordering') return text(lang, 'Ordering', 'قيد الطلب');
    if (table.state === 'dirty') return text(lang, 'Needs Cleaning', 'تحتاج تنظيف');
    return text(lang, 'Vacant', 'شاغرة');
  };

  const refresh = () => {
    setTables(StorageService.getTables());
    setOrders(StorageService.getRestaurantOrders());
    onChange?.();
  };

  const payTable = async () => {
    if (!pendingPayment) return;
    const { table, method } = pendingPayment;
    const order = orderForTable(table);
    setPendingPayment(null);

    if (!order) {
      toast(text(lang, 'No active check is linked to this table.', 'لا يوجد طلب نشط مرتبط بهذه الطاولة.'), 'warning');
      return;
    }

    let paymentApprovalReference: string | undefined;
    if (method === 'card') {
      try {
        setProcessingTableId(table.id);
        toast(text(lang, 'Processing table card payment...', 'جاري معالجة دفع الطاولة بالبطاقة...'), 'loading');
        const result = await processMadaPayment(StorageService.getHardwareConfig(), {
          amount: order.total,
          currency: StorageService.getConfig().currency || 'SAR',
          orderId: order.id,
          branchId: order.branchId,
        });
        paymentApprovalReference = result.approvalReference || result.rrn;
        toast(result.message, 'success');
      } catch (error) {
        toast(error instanceof Error ? error.message : text(lang, 'Card payment failed.', 'فشل دفع البطاقة.'), 'error', 7000);
        setProcessingTableId(null);
        return;
      }
    }

    const paidOrder: RestaurantOrder = {
      ...order,
      status: 'paid',
      paymentMethod: method,
      paymentApprovalReference,
      paidAt: Date.now(),
      updatedAt: Date.now(),
    };
    setOrders(current => current.map(item => item.id === paidOrder.id ? paidOrder : item));
    StorageService.saveRestaurantOrder(paidOrder);
    onCheckout(
      toCartItems(order),
      method,
      order.customerId,
      order.discount,
      `${order.orderNumber}${order.tableLabel ? ` / ${order.tableLabel}` : ''}`,
      undefined,
      { subtotal: order.subtotal, vat: order.vat, total: order.total, selectiveTaxAmount: 0 },
      paymentApprovalReference
    );
    const dirtyTable = { ...table, state: 'dirty' as const, activeOrderId: undefined, updatedAt: Date.now() };
    setTables(current => current.map(item => item.id === dirtyTable.id ? dirtyTable : item));
    const savedTables = StorageService.saveTable(dirtyTable);
    setTables(savedTables);
    setProcessingTableId(null);
    onChange?.();
    toast(text(lang, 'Payment complete. Table marked dirty for cleaning.', 'اكتمل الدفع. تم وضع الطاولة كبحاجة للتنظيف.'), 'success');
  };

  const counts = Object.keys(stateLabels).reduce((acc, key) => {
    acc[key as TableState] = visibleTables.filter(table => table.state === key).length;
    return acc;
  }, {} as Record<TableState, number>);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-600">FOH floor control</p>
          <h1 className="text-3xl font-black text-slate-900">{text(lang, 'Tables and Floor Plan', 'الطاولات وخريطة الصالة')}</h1>
          <p className="mt-1 text-sm text-slate-500">{text(lang, 'Manage real-time table states for service, billing, and cleaning.', 'إدارة حالات الطاولات لحظياً للخدمة والفوترة والتنظيف.')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAreaId('all')} className={`rounded-2xl px-4 py-2 text-sm font-bold ${areaId === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}>
            {text(lang, 'All Areas', 'كل المناطق')}
          </button>
          {areas.map(area => (
            <button key={area.id} onClick={() => setAreaId(area.id)} className={`rounded-2xl px-4 py-2 text-sm font-bold ${areaId === area.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}>
              {text(lang, area.nameEn, area.nameAr)}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-5">
        {(Object.keys(stateLabels) as TableState[]).map(state => (
          <div key={state} className={`rounded-3xl border p-4 ${stateLabels[state].className}`}>
            <p className="text-xs font-black uppercase opacity-70">{text(lang, stateLabels[state].en, stateLabels[state].ar)}</p>
            <p className="mt-2 text-3xl font-black">{counts[state]}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {visibleTables.map(table => (
          <div key={table.id} className={`rounded-[2rem] border p-5 shadow-sm ${stateLabels[table.state].className}`}>
            {(() => {
              const activeOrder = orderForTable(table);
              const paidOrder = activeOrder ? undefined : paidOrderForTable(table);
              const displayStatus = tableStatusLabel(table, activeOrder, paidOrder);
              return (
                <>
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="text-xs font-black uppercase opacity-70">{text(lang, 'Table', 'طاولة')}</p>
                <h2 className="text-4xl font-black">{table.label}</h2>
                <p className="mt-2 inline-flex rounded-full bg-white/90 px-3 py-1 text-xs font-black text-slate-700">
                  {displayStatus}
                </p>
                {activeOrder && (
                  <p className="mt-2 rounded-full bg-white/80 px-3 py-1 text-xs font-black">
                    {activeOrder.orderNumber} / {activeOrder.status} / {activeOrder.total.toFixed(2)} SAR
                  </p>
                )}
                {paidOrder && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-[#EAF8EF] px-3 py-1 text-xs font-black text-[#34C759]">
                      {text(lang, 'Paid', 'مدفوع')}
                    </span>
                    <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-black text-slate-700">
                      {paidOrder.orderNumber} / {paidOrder.total.toFixed(2)} SAR
                    </span>
                  </div>
                )}
              </div>
              <div className="rounded-2xl bg-white/70 p-3">
                <Users size={24} />
              </div>
            </div>
            <p className="mb-4 text-sm font-bold">{text(lang, 'Seats', 'المقاعد')}: {table.seats}</p>
            <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white/80 p-3">
              <div className="rounded-xl bg-white p-2">
                <QRCodeSVG value={qrUrlForTable(table)} size={72} level="M" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-700">{text(lang, 'Customer QR Order', 'طلب العميل عبر QR')}</p>
                <p className="truncate text-[10px] font-semibold text-slate-500">{qrUrlForTable(table)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => requestState(table, 'vacant')} className="rounded-2xl bg-white/80 px-3 py-2 text-xs font-black text-slate-700">
                <Circle size={14} className="inline" /> {text(lang, 'Vacant', 'شاغرة')}
              </button>
              <button onClick={() => requestState(table, 'occupied')} className="rounded-2xl bg-white/80 px-3 py-2 text-xs font-black text-blue-700">
                <Utensils size={14} className="inline" /> {text(lang, 'Eating', 'يتناولون')}
              </button>
              <button onClick={() => requestState(table, 'ordering')} className="rounded-2xl bg-white/80 px-3 py-2 text-xs font-black text-yellow-700">
                <Users size={14} className="inline" /> {text(lang, 'Ordering', 'طلب')}
              </button>
              <button onClick={() => requestState(table, 'awaiting_bill')} className="rounded-2xl bg-white/80 px-3 py-2 text-xs font-black text-purple-700">
                <ReceiptText size={14} className="inline" /> {text(lang, 'Bill', 'فاتورة')}
              </button>
              <button onClick={() => requestState(table, 'dirty')} className="rounded-2xl bg-white/80 px-3 py-2 text-xs font-black text-red-700">
                <Brush size={14} className="inline" /> {text(lang, 'Dirty', 'تنظيف')}
              </button>
            </div>
            {activeOrder && activeOrder.status !== 'paid' && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => setPendingPayment({ table, method: 'cash' })} className="rounded-2xl bg-white px-3 py-3 text-xs font-black text-emerald-700">
                  <Banknote size={14} className="inline" /> {text(lang, 'Pay Cash', 'دفع نقدي')}
                </button>
                <button onClick={() => setPendingPayment({ table, method: 'card' })} disabled={processingTableId === table.id} className="rounded-2xl bg-[var(--ios-accent)] px-3 py-3 text-xs font-black text-white disabled:opacity-70">
                  <CreditCard size={14} className="inline" /> {processingTableId === table.id ? text(lang, 'Processing', 'جاري الدفع') : text(lang, 'Pay Card', 'دفع بطاقة')}
                </button>
              </div>
            )}
            {!activeOrder && paidOrder && (
              <div className="mt-3 rounded-2xl bg-white/80 px-3 py-3 text-center text-xs font-black text-[#34C759]">
                {text(lang, 'Payment complete. Clean the table, then mark it vacant.', 'اكتمل الدفع. نظّف الطاولة ثم اجعلها شاغرة.')}
              </div>
            )}
                </>
              );
            })()}
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={pendingPayment !== null}
        title={text(lang, 'Confirm table payment?', 'تأكيد دفع الطاولة؟')}
        message={pendingPayment
          ? text(lang, `This will close ${pendingPayment.table.label}, create a receipt, and mark the table dirty for cleaning.`, `سيتم إغلاق ${pendingPayment.table.label} وإنشاء إيصال ووضع الطاولة كبحاجة للتنظيف.`)
          : ''}
        confirmLabel={text(lang, 'Yes, pay', 'نعم، ادفع')}
        cancelLabel={text(lang, 'No, cancel', 'لا، إلغاء')}
        onConfirm={payTable}
        onCancel={() => setPendingPayment(null)}
      />
      <ConfirmDialog
        open={pendingState !== null}
        title={text(lang, 'Change table status?', 'تغيير حالة الطاولة؟')}
        message={pendingState
          ? text(lang, `This will mark ${pendingState.table.label} as ${stateLabels[pendingState.state].en}.`, `سيتم تغيير حالة ${pendingState.table.label}.`)
          : ''}
        confirmLabel={text(lang, 'Yes, update', 'نعم، حدّث')}
        cancelLabel={text(lang, 'No, cancel', 'لا، إلغاء')}
        danger={pendingState?.state === 'vacant' || pendingState?.state === 'dirty'}
        onConfirm={confirmStateChange}
        onCancel={() => setPendingState(null)}
      />
    </div>
  );
};

export default TableFloor;
