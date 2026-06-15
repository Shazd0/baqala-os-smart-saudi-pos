import { CloudStorageConfig, DiningTable, MenuCategory, MenuItem, RestaurantBranch, RestaurantOrder } from '../types';
import { StorageService } from './storageService';

export interface CloudHealth {
  ok: boolean;
  server?: string;
  version?: string;
  sourceOfTruth?: string;
  updatedAt?: number;
  error?: string;
}

function cleanUrl(value: string) {
  return String(value || '').replace(/\/+$/, '');
}

export function getCloudBaseUrl(config: CloudStorageConfig = StorageService.getCloudStorageConfig()) {
  return cleanUrl(config.cloudflareTunnelUrl || config.lanApiUrl);
}

export function hasDedicatedCloudBackend(config: CloudStorageConfig = StorageService.getCloudStorageConfig()) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('cloudUrl')) return true;
  return !!(config.enabled && (config.cloudflareTunnelUrl || config.lanApiUrl));
}

function getPublicCloudApiBaseUrl(config: CloudStorageConfig = StorageService.getCloudStorageConfig()) {
  const params = new URLSearchParams(window.location.search);
  const queryUrl = params.get('cloudUrl');
  if (queryUrl) return cleanUrl(queryUrl);
  if (config.enabled && (config.cloudflareTunnelUrl || config.lanApiUrl)) {
    return getCloudBaseUrl(config);
  }
  return '';
}

export function getPublicQrPageBaseUrl() {
  if (typeof window === 'undefined') return '';
  const directory = window.location.pathname.replace(/\/[^/]*$/, '');
  return cleanUrl(`${window.location.origin}${directory || ''}`);
}

/** Customer-facing ordering page URL encoded in table QR codes. */
export function getCustomerOrderingPageUrl(tableId: string, config: CloudStorageConfig = StorageService.getCloudStorageConfig()) {
  const params = new URLSearchParams(window.location.search);
  const queryCloudUrl = params.get('cloudUrl');
  const base = queryCloudUrl
    ? cleanUrl(queryCloudUrl)
    : config.enabled && (config.cloudflareTunnelUrl || config.lanApiUrl)
      ? getCloudBaseUrl(config)
      : getPublicQrPageBaseUrl() || cleanUrl(window.location.origin);
  const url = new URL(base, window.location.origin);
  url.search = '';
  url.searchParams.set('qrTable', tableId);
  return url.toString();
}

/** @deprecated Use getCustomerOrderingPageUrl for QR links and getPublicCloudApiBaseUrl for API calls. */
export function getPublicCloudBaseUrl(config: CloudStorageConfig = StorageService.getCloudStorageConfig()) {
  return getPublicCloudApiBaseUrl(config) || getPublicQrPageBaseUrl();
}

async function request<T>(path: string, options: RequestInit = {}, config = StorageService.getCloudStorageConfig()): Promise<T> {
  const baseUrl = getCloudBaseUrl(config);
  if (!baseUrl) throw new Error('Cloud storage URL is not configured.');
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiToken ? { Authorization: `Bearer ${config.apiToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || payload.message || `Cloud request failed (${response.status}).`);
  }
  return payload.data ?? payload;
}

async function publicRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getPublicCloudApiBaseUrl();
  if (!baseUrl) throw new Error('Cloud URL is not configured.');
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || payload.message || `Cloud request failed (${response.status}).`);
  }
  return payload.data ?? payload;
}

export interface PublicQrBootstrap {
  table: DiningTable;
  branch: RestaurantBranch | null;
  categories: MenuCategory[];
  menuItems: MenuItem[];
  vatRate: number;
}

export interface PublicQrOrderPayload {
  tableId: string;
  guestName: string;
  guestPhone: string;
  note?: string;
  vatRate?: number;
  items: Array<{
    menuItemId: string;
    quantity: number;
    spiceLevel?: string;
    note?: string;
  }>;
}

export const CloudClient = {
  isConfigured: () => {
    const config = StorageService.getCloudStorageConfig();
    return !!(config.enabled && (config.cloudflareTunnelUrl || config.lanApiUrl) && config.apiToken);
  },

  health: async (): Promise<CloudHealth> => {
    try {
      return await request<CloudHealth>('/health', {}, { ...StorageService.getCloudStorageConfig(), apiToken: '' });
    } catch (error: any) {
      return { ok: false, error: error.message || 'Cloud health check failed.' };
    }
  },

  list: async <T>(path: string): Promise<T[]> => request<T[]>(path),

  save: async <T>(path: string, value: T): Promise<T> => request<T>(path, {
    method: 'POST',
    body: JSON.stringify(value),
  }),

  remove: async (path: string, id: string): Promise<boolean> => {
    await request(`${path}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    return true;
  },

  backup: async () => request<{ backupPath: string }>('/backup', { method: 'POST' }),

  publicQrBootstrap: async (tableId: string): Promise<PublicQrBootstrap> => publicRequest<PublicQrBootstrap>(`/public/qr/bootstrap?tableId=${encodeURIComponent(tableId)}`),

  publicQrOrder: async (payload: PublicQrOrderPayload): Promise<RestaurantOrder> => publicRequest<RestaurantOrder>('/public/qr/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
};
