import { DiningTable, MenuCategory, MenuItem, RestaurantBranch, StoreConfig } from '../types';
import { CloudClient, PublicQrBootstrap, hasDedicatedCloudBackend } from './cloudClient';
import { FirebaseService } from './firebaseService';

export type QrOrderDataSource = 'cloud' | 'firestore';

export interface QrOrderBootstrap extends PublicQrBootstrap {
  source: QrOrderDataSource;
}

async function bootstrapFromFirestore(tableId: string): Promise<QrOrderBootstrap | null> {
  const [table, branches, categories, menuItems, storeConfigs] = await Promise.all([
    FirebaseService.getById<DiningTable>('tables', tableId),
    FirebaseService.list<RestaurantBranch>('branches'),
    FirebaseService.list<MenuCategory>('menuCategories'),
    FirebaseService.list<MenuItem>('menuItems'),
    FirebaseService.list<StoreConfig & { id: string }>('storeConfig'),
  ]);

  if (!table) return null;

  const branch = branches.find(item => item.id === table.branchId) || null;
  const storeConfig = storeConfigs.find(item => item.id === 'default') || storeConfigs[0];

  return {
    table,
    branch,
    categories: categories.filter(item => item.active !== false),
    menuItems: menuItems.filter(item => item.active !== false),
    vatRate: storeConfig?.vatRate ?? 0.15,
    source: 'firestore',
  };
}

export async function bootstrapQrOrdering(tableId: string): Promise<QrOrderBootstrap> {
  const normalizedTableId = String(tableId || '').trim();
  if (!normalizedTableId) {
    throw new Error('Missing table ID. Please scan the QR code on your table again.');
  }

  if (FirebaseService.isConfigured()) {
    const firestoreBootstrap = await bootstrapFromFirestore(normalizedTableId);
    if (firestoreBootstrap) return firestoreBootstrap;
  }

  if (hasDedicatedCloudBackend()) {
    const cloudBootstrap = await CloudClient.publicQrBootstrap(normalizedTableId);
    return { ...cloudBootstrap, source: 'cloud' };
  }

  throw new Error('Table not found. Please scan the QR code on your table again.');
}
