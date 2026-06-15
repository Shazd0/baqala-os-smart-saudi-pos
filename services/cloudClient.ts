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

export function getPublicCloudBaseUrl(config: CloudStorageConfig = StorageService.getCloudStorageConfig()) {
  const params = new URLSearchParams(window.location.search);
  const queryUrl = params.get('cloudUrl');
  if (queryUrl) return cleanUrl(queryUrl);
  const configured = config.enabled ? getCloudBaseUrl(config) : '';
  if (configured) return configured;
  return cleanUrl(window.location.origin);
}

// True only when a real cloud server (LAN/Cloudflare tunnel) is explicitly configured.
// When the app is served statically (e.g. Netlify) without a cloud server, the public
// base URL falls back to the page origin, which has no `/public/qr/*` endpoints. In that
// case we must NOT attempt cloud HTTP calls — they always 404 — and use Firebase instead.
export function hasExplicitPublicCloudUrl(config: CloudStorageConfig = StorageService.getCloudStorageConfig()) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('cloudUrl')) return true;
  return !!(config.enabled && getCloudBaseUrl(config));
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
  const baseUrl = getPublicCloudBaseUrl();
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
  hasExplicitPublicCloudUrl: () => hasExplicitPublicCloudUrl(),

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
