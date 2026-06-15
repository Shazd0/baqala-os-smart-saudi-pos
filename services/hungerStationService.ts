import {
  DeliveryChannel,
  DeliveryProviderEvent,
  ExternalDeliveryOrder,
  ExternalDeliveryOrderItem,
  KitchenTicketStatus,
  MenuItem,
  RestaurantOrder,
  RestaurantOrderStatus,
} from '../types';
import { StorageService } from './storageService';

type HttpMethod = 'GET' | 'POST';

interface ProviderRequestOptions {
  method?: HttpMethod;
  path: string;
  body?: unknown;
}

function activeConfig(branchId = StorageService.getActiveBranchId()): DeliveryChannel {
  const existing = StorageService.getDeliveryChannels().find(channel => channel.provider === 'hungerstation' && channel.branchId === branchId);
  return existing || {
    id: `DCH-hungerstation-${branchId}`,
    branchId,
    provider: 'hungerstation',
    active: false,
    menuSyncStatus: 'pending',
    endpointUrl: '',
    merchantId: '',
    externalBranchId: '',
    apiKey: '',
    timeoutSeconds: 30,
    status: 'not_configured',
  };
}

function missingConfig(config: DeliveryChannel) {
  const missing = [
    !config.endpointUrl?.trim() ? 'endpoint URL' : '',
    !config.merchantId?.trim() ? 'merchant ID' : '',
    !config.externalBranchId?.trim() ? 'HungerStation branch ID' : '',
    !config.apiKey?.trim() ? 'API key/token' : '',
  ].filter(Boolean);
  return missing;
}

function assertConfigured(config: DeliveryChannel) {
  const missing = missingConfig(config);
  if (missing.length) {
    throw new Error(`HungerStation live integration is not configured. Missing ${missing.join(', ')}.`);
  }
}

function endpoint(config: DeliveryChannel, path: string) {
  const base = String(config.endpointUrl || '').replace(/\/+$/, '');
  const nextPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${nextPath}`;
}

function event(branchId: string, type: DeliveryProviderEvent['type'], status: DeliveryProviderEvent['status'], message: string, externalOrderId?: string, payload?: unknown) {
  StorageService.saveDeliveryProviderEvent({
    id: `DPE-HS-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    provider: 'hungerstation',
    branchId,
    type,
    status,
    message,
    externalOrderId,
    createdAt: Date.now(),
    payload,
  });
}

async function request<T>(config: DeliveryChannel, options: ProviderRequestOptions): Promise<T> {
  assertConfigured(config);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), Math.max(5, Number(config.timeoutSeconds || 30)) * 1000);

  try {
    const response = await fetch(endpoint(config, options.path), {
      method: options.method || 'GET',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'X-Merchant-Id': config.merchantId || '',
        'X-Branch-Id': config.externalBranchId || '',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || `HungerStation request failed with HTTP ${response.status}.`);
    }
    return payload as T;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('HungerStation request timed out.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function payloadOrders(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.orders)) return payload.orders;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.orders)) return payload.data.orders;
  return [];
}

function normalizeItem(raw: any): ExternalDeliveryOrderItem {
  return {
    id: String(raw.id || raw.itemId || raw.lineId || raw.externalMenuItemId || Date.now()),
    externalMenuItemId: raw.externalMenuItemId || raw.menuItemId || raw.sku || raw.plu || raw.id,
    nameEn: raw.nameEn || raw.name || raw.title || 'HungerStation Item',
    nameAr: raw.nameAr || raw.arabicName || raw.name || raw.title,
    quantity: Number(raw.quantity || raw.qty || 1),
    unitPrice: Number(raw.unitPrice ?? raw.price ?? raw.priceAmount ?? 0),
    note: raw.note || raw.instructions || '',
    modifiers: Array.isArray(raw.modifiers) ? raw.modifiers.map((modifier: any) => ({
      groupId: String(modifier.groupId || modifier.group || 'hungerstation'),
      optionId: String(modifier.optionId || modifier.id || modifier.name || Date.now()),
      nameEn: modifier.nameEn || modifier.name || 'Modifier',
      nameAr: modifier.nameAr || modifier.name || 'Modifier',
      priceDelta: Number(modifier.priceDelta ?? modifier.price ?? 0),
    })) : [],
  };
}

function normalizeOrder(raw: any, branchId: string): ExternalDeliveryOrder {
  const items = (raw.items || raw.lines || raw.products || []).map(normalizeItem);
  const subtotal = Number(raw.subtotal ?? raw.subTotal ?? items.reduce((sum: number, item: ExternalDeliveryOrderItem) => sum + item.unitPrice * item.quantity, 0));
  const discount = Number(raw.discount ?? raw.discountAmount ?? 0);
  const vat = Number(raw.vat ?? raw.tax ?? raw.taxAmount ?? 0);
  const total = Number(raw.total ?? raw.totalAmount ?? Math.max(0, subtotal - discount + vat));
  const externalOrderId = String(raw.externalOrderId || raw.orderId || raw.id || raw.reference || '');

  return {
    id: `EXT-HS-${externalOrderId}`,
    provider: 'hungerstation',
    branchId,
    externalOrderId,
    status: raw.status || 'new',
    customerName: raw.customer?.name || raw.customerName || raw.guestName || '',
    customerPhone: raw.customer?.phone || raw.customerPhone || raw.mobile || '',
    deliveryAddress: raw.deliveryAddress || raw.address?.formatted || raw.address || '',
    items,
    subtotal,
    discount,
    vat,
    total,
    note: raw.note || raw.instructions || '',
    rawPayload: raw,
    createdAt: raw.createdAt ? new Date(raw.createdAt).getTime() : Date.now(),
    updatedAt: Date.now(),
  };
}

export function getHungerStationConfig(branchId?: string) {
  return activeConfig(branchId);
}

export function getHungerStationMissingConfig(branchId?: string) {
  return missingConfig(activeConfig(branchId));
}

export async function testHungerStationConnection(branchId = StorageService.getActiveBranchId()) {
  const config = activeConfig(branchId);
  try {
    await request(config, {
      path: `/health?merchantId=${encodeURIComponent(config.merchantId || '')}&branchId=${encodeURIComponent(config.externalBranchId || '')}`,
    });
    const saved = StorageService.saveDeliveryChannel({ ...config, active: true, status: 'online', lastError: '', lastSyncAt: Date.now() });
    event(branchId, 'connection_test', 'success', 'HungerStation connection is online.');
    return saved;
  } catch (error) {
    const message = (error as Error).message;
    const saved = StorageService.saveDeliveryChannel({ ...config, status: 'error', lastError: message });
    event(branchId, 'connection_test', 'failed', message);
    throw Object.assign(new Error(message), { channels: saved });
  }
}

export async function fetchHungerStationOrders(branchId = StorageService.getActiveBranchId()) {
  const config = activeConfig(branchId);
  try {
    const payload = await request<any>(config, {
      path: `/orders?merchantId=${encodeURIComponent(config.merchantId || '')}&branchId=${encodeURIComponent(config.externalBranchId || '')}&status=new`,
    });
    const normalized = payloadOrders(payload)
      .map(order => normalizeOrder(order, branchId))
      .filter(order => order.externalOrderId);
    normalized.forEach(order => StorageService.saveExternalDeliveryOrder(order));
    StorageService.saveDeliveryChannel({ ...config, active: true, status: 'online', lastError: '', lastSyncAt: Date.now() });
    event(branchId, 'orders_fetch', 'success', `Fetched ${normalized.length} HungerStation orders.`);
    return StorageService.getExternalDeliveryOrders().filter(order => order.provider === 'hungerstation' && order.branchId === branchId);
  } catch (error) {
    const message = (error as Error).message;
    StorageService.saveDeliveryChannel({ ...config, status: 'error', lastError: message });
    event(branchId, 'orders_fetch', 'failed', message);
    throw error;
  }
}

export async function acceptHungerStationOrder(order: ExternalDeliveryOrder) {
  const config = activeConfig(order.branchId);
  try {
    await request(config, { method: 'POST', path: `/orders/${encodeURIComponent(order.externalOrderId)}/accept`, body: { merchantId: config.merchantId, branchId: config.externalBranchId } });
    StorageService.saveExternalDeliveryOrder({ ...order, status: 'accepted', updatedAt: Date.now() });
    const imported = StorageService.importExternalDeliveryOrder({ ...order, status: 'accepted', updatedAt: Date.now() });
    event(order.branchId, 'order_accept', 'success', `Accepted HungerStation order ${order.externalOrderId}.`, order.externalOrderId);
    return imported;
  } catch (error) {
    const message = (error as Error).message;
    StorageService.saveExternalDeliveryOrder({ ...order, status: 'failed', updatedAt: Date.now() });
    event(order.branchId, 'order_accept', 'failed', message, order.externalOrderId);
    throw error;
  }
}

export async function rejectHungerStationOrder(order: ExternalDeliveryOrder, reason = 'Rejected from POS') {
  const config = activeConfig(order.branchId);
  try {
    await request(config, { method: 'POST', path: `/orders/${encodeURIComponent(order.externalOrderId)}/reject`, body: { merchantId: config.merchantId, branchId: config.externalBranchId, reason } });
    const saved = StorageService.saveExternalDeliveryOrder({ ...order, status: 'rejected', note: [order.note, reason].filter(Boolean).join(' / '), updatedAt: Date.now() });
    event(order.branchId, 'order_reject', 'success', `Rejected HungerStation order ${order.externalOrderId}.`, order.externalOrderId);
    return saved;
  } catch (error) {
    const message = (error as Error).message;
    event(order.branchId, 'order_reject', 'failed', message, order.externalOrderId);
    throw error;
  }
}

export async function updateHungerStationOrderStatus(order: RestaurantOrder, status: RestaurantOrderStatus | KitchenTicketStatus) {
  if (order.channel !== 'hungerstation' || !order.externalOrderId) return;
  const config = activeConfig(order.branchId);
  const providerStatus = status === 'preparing' ? 'preparing' : status === 'ready' ? 'ready_for_pickup' : status;
  try {
    await request(config, {
      method: 'POST',
      path: `/orders/${encodeURIComponent(order.externalOrderId)}/status`,
      body: { merchantId: config.merchantId, branchId: config.externalBranchId, status: providerStatus },
    });
    event(order.branchId || '', 'status_update', 'success', `Sent HungerStation status ${providerStatus}.`, order.externalOrderId);
  } catch (error) {
    const message = (error as Error).message;
    event(order.branchId || '', 'status_update', 'pending', message, order.externalOrderId, { status: providerStatus });
  }
}

export async function syncHungerStationMenuAvailability(branchId = StorageService.getActiveBranchId()) {
  const config = activeConfig(branchId);
  const menuItems = StorageService.getMenuItems()
    .filter(item => item.active && item.hungerStationEnabled !== false && (!item.branchIds?.length || item.branchIds.includes(branchId)))
    .map((item: MenuItem) => ({
      id: item.hungerStationExternalId || item.id,
      localId: item.id,
      nameEn: item.nameEn,
      nameAr: item.nameAr,
      price: item.basePrice,
      available: item.active,
      calories: item.nutrition.caloriesKcal,
    }));

  try {
    await request(config, {
      method: 'POST',
      path: '/menu/availability',
      body: { merchantId: config.merchantId, branchId: config.externalBranchId, items: menuItems },
    });
    const saved = StorageService.saveDeliveryChannel({ ...config, active: true, menuSyncStatus: 'synced', status: 'online', lastError: '', lastSyncAt: Date.now() });
    event(branchId, 'menu_sync', 'success', `Synced ${menuItems.length} HungerStation menu items.`);
    return saved;
  } catch (error) {
    const message = (error as Error).message;
    const saved = StorageService.saveDeliveryChannel({ ...config, menuSyncStatus: 'failed', status: 'error', lastError: message });
    event(branchId, 'menu_sync', 'failed', message);
    throw Object.assign(new Error(message), { channels: saved });
  }
}
