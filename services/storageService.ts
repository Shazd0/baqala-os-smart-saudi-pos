
import {
  BranchStaffAssignment,
  CloudStorageConfig,
  CloudSyncStatus,
  CreditEntry,
  CreditTransaction,
  DeliveryChannel,
  DeliveryProviderEvent,
  DiningArea,
  DiningTable,
  Deal,
  Expense,
  ExternalDeliveryOrder,
  GuestTab,
  HardwareConfig,
  HealthCertificate,
  HeldCart,
  Ingredient,
  InitialSetupPayload,
  KitchenTicket,
  LoyaltyProfile,
  MenuCategory,
  MenuItem,
  ModifierGroup,
  Permission,
  Product,
  Promotion,
  PurchaseInvoice,
  Recipe,
  Reservation,
  RestaurantBranch,
  RestaurantGroup,
  RestaurantOrder,
  ServiceChargeConfig,
  Shift,
  StaffMember,
  StockAdjustment,
  StoreConfig,
  Supplier,
  SyncQueueItem,
  Transaction,
  UpdateStatus,
  User,
  UserRole,
  WastageEntry,
  ZatcaSubmission,
  ZatcaState,
  Customer
} from '../types';
import { INITIAL_STORE_CONFIG } from '../constants';
import { FirebaseService, type FirestoreCollection } from './firebaseService';
import { getActivation } from './licenseService';
import { createTrialMockStore } from './trialMockData';
import {
  INSECURE_HASH_PREFIX,
  ZATCA_GENESIS_PIH,
  computeInvoiceHash,
  generateInvoiceUuid,
  getOrCreateSigningKey,
  isRealCryptoAvailable,
  signInvoiceHash,
} from './zatcaCrypto';

function isElectron(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).electronAPI !== 'undefined';
}

async function loadFromSQLite(): Promise<void> {
  if (!isElectron()) return;
  try {
    const all = await (window as any).electronAPI.readAll() as Record<string, unknown>;
    const STORE_KEYS = Object.keys(defaultPreviewStore) as Array<keyof typeof defaultPreviewStore>;
    STORE_KEYS.forEach(key => {
      const val = all[`store.${key}`];
      if (val !== null && val !== undefined) {
        (previewStore as any)[key] = val;
      }
    });
    if (all['store.activeBranchId']) previewStore.activeBranchId = all['store.activeBranchId'] as string;
  } catch (err) {
    console.warn('SQLite load failed, starting fresh', err);
  }
}

async function persistToSQLite(): Promise<void> {
  if (!isElectron()) return;
  const entries: Record<string, string> = {};
  const STORE_KEYS = Object.keys(defaultPreviewStore) as Array<keyof typeof defaultPreviewStore>;
  STORE_KEYS.forEach(key => {
    try {
      entries[`store.${key}`] = JSON.stringify((previewStore as any)[key]);
    } catch { /* skip non-serializable */ }
  });
  entries['store.activeBranchId'] = JSON.stringify(previewStore.activeBranchId);
  await (window as any).electronAPI.writeBatch(entries);
}

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  administrator: ['sell', 'refund', 'discount', 'manage_inventory', 'manage_customers', 'manage_expenses', 'manage_settings', 'manage_users', 'close_shift', 'backup_restore', 'zatca_admin'],
  cashier: ['sell', 'manage_customers']
};

const FIREBASE_BACKED_KEYS = [
  'users',
  'config',
  'products',
  'transactions',
  'customers',
  'expenses',
  'shifts',
  'heldCarts',
  'auditLogs',
  'suppliers',
  'stockAdjustments',
  'purchaseInvoices',
  'creditEntries',
  'creditTransactions',
  'deals',
  'ingredients',
  'recipes',
  'wastageEntries',
  'branches',
  'menuCategories',
  'modifierGroups',
  'menuItems',
  'diningAreas',
  'tables',
  'restaurantOrders',
  'kitchenTickets',
  'staffMembers',
  'healthCertificates',
  'syncQueue',
  'zatcaSubmissions',
  'restaurantGroups',
  'guestTabs',
  'reservations',
  'loyaltyProfiles',
  'branchStaffAssignments',
  'deliveryChannels',
  'externalDeliveryOrders',
  'deliveryProviderEvents',
  'promotions',
  'serviceChargeConfigs'
] as const;

const FIRESTORE_COLLECTION_BY_KEY: Partial<Record<(typeof FIREBASE_BACKED_KEYS)[number], FirestoreCollection>> = {
  users: 'users',
  config: 'storeConfig',
  products: 'products',
  transactions: 'transactions',
  customers: 'customers',
  expenses: 'expenses',
  shifts: 'shifts',
  heldCarts: 'heldCarts',
  auditLogs: 'auditLogs',
  suppliers: 'suppliers',
  stockAdjustments: 'stockAdjustments',
  purchaseInvoices: 'purchaseInvoices',
  creditEntries: 'creditEntries',
  creditTransactions: 'creditTransactions',
  deals: 'deals',
  ingredients: 'ingredients',
  recipes: 'recipes',
  wastageEntries: 'wastageEntries',
  branches: 'branches',
  menuCategories: 'menuCategories',
  modifierGroups: 'modifierGroups',
  menuItems: 'menuItems',
  diningAreas: 'diningAreas',
  tables: 'tables',
  restaurantOrders: 'restaurantOrders',
  kitchenTickets: 'kitchenTickets',
  staffMembers: 'staffMembers',
  healthCertificates: 'healthCertificates',
  syncQueue: 'syncQueue',
  zatcaSubmissions: 'zatcaSubmissions',
  restaurantGroups: 'restaurantGroups',
  guestTabs: 'guestTabs',
  reservations: 'reservations',
  loyaltyProfiles: 'loyaltyProfiles',
  branchStaffAssignments: 'branchStaffAssignments',
  deliveryChannels: 'deliveryChannels',
  externalDeliveryOrders: 'externalDeliveryOrders',
  deliveryProviderEvents: 'deliveryProviderEvents',
  promotions: 'promotions',
  serviceChargeConfigs: 'serviceChargeConfigs'
};

const FIREBASE_BACKED_COMMANDS = new Set([
  'getProducts',
  'saveProduct',
  'deleteProduct',
  'importProducts',
  'getTransactions',
  'saveTransaction',
  'getCustomers',
  'saveCustomer',
  'updateCustomerBalance',
  'getMenuCategories',
  'saveMenuCategory',
  'getModifierGroups',
  'saveModifierGroup',
  'getMenuItems',
  'saveMenuItem',
  'getDiningAreas',
  'getTables',
  'saveTable',
  'deleteTable',
  'getRestaurantOrders',
  'saveRestaurantOrder',
  'getKitchenTickets',
  'saveKitchenTicket',
  'getStaffMembers',
  'saveStaffMember',
  'getHealthCertificates',
  'saveHealthCertificate',
  'getBranches',
  'saveBranch',
  'getBranchStaffAssignments',
  'saveBranchStaffAssignment',
  'getDeliveryChannels',
  'saveDeliveryChannel',
  'getExternalDeliveryOrders',
  'saveExternalDeliveryOrder',
  'getDeliveryProviderEvents',
  'saveDeliveryProviderEvent',
  'getPromotions',
  'savePromotion',
  'getServiceChargeConfigs',
  'saveServiceChargeConfig'
]);

const now = () => Date.now();
let trialMockSeeded = false;

function isTrialMode() {
  return getActivation()?.plan === 'trial';
}

function shouldUseFirebase() {
  return FirebaseService.isConfigured() && !isTrialMode();
}

const DEFAULT_MENU_CATEGORIES: MenuCategory[] = [
  { id: 'cat-shawarma', nameEn: 'Shawarma', nameAr: 'شاورما', sortOrder: 1, active: true },
  { id: 'cat-grill', nameEn: 'Grill', nameAr: 'المشاوي', sortOrder: 2, active: true },
  { id: 'cat-beverages', nameEn: 'Beverages', nameAr: 'المشروبات', sortOrder: 3, active: true },
];

const DEFAULT_MODIFIER_GROUPS: ModifierGroup[] = [
  {
    id: 'mod-spice',
    nameEn: 'Spice Level',
    nameAr: 'درجة الحار',
    minSelections: 0,
    maxSelections: 1,
    required: false,
    options: [
      { id: 'spice-mild', nameEn: 'Mild', nameAr: 'خفيف', priceDelta: 0 },
      { id: 'spice-spicy', nameEn: 'Spicy', nameAr: 'حار', priceDelta: 0 },
    ],
  },
  {
    id: 'mod-extras',
    nameEn: 'Extras',
    nameAr: 'إضافات',
    minSelections: 0,
    maxSelections: 3,
    required: false,
    options: [
      { id: 'extra-cheese', nameEn: 'Cheese', nameAr: 'جبن', priceDelta: 2, caloriesDelta: 70 },
      { id: 'extra-fries', nameEn: 'Fries Side', nameAr: 'بطاطس جانبية', priceDelta: 5, caloriesDelta: 250 },
    ],
  },
];

const DEFAULT_MENU_ITEMS: MenuItem[] = [
  {
    id: 'menu-chicken-shawarma',
    nameEn: 'Spicy Chicken Shawarma',
    nameAr: 'شاورما دجاج حارة',
    descriptionEn: 'Chicken shawarma with garlic, pickles, and chili sauce.',
    descriptionAr: 'شاورما دجاج مع الثوم والمخلل وصلصة حارة.',
    categoryId: 'cat-shawarma',
    basePrice: 17.25,
    vatPercentage: 15,
    active: true,
    station: 'grill',
    modifierGroupIds: ['mod-spice', 'mod-extras'],
    nutrition: {
      caloriesKcal: 480,
      fatGrams: 18,
      saturatedFatGrams: 5,
      sugarGrams: 4,
      sodiumMilligrams: 1450,
      caffeineMilligrams: 0,
      allergens: ['Gluten', 'Dairy', 'Sesame'],
    },
    costPrice: 6.1,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: 'menu-orange-juice',
    nameEn: 'Fresh Orange Juice',
    nameAr: 'عصير برتقال طازج',
    descriptionEn: 'Freshly squeezed orange juice.',
    descriptionAr: 'عصير برتقال طازج.',
    categoryId: 'cat-beverages',
    basePrice: 11.5,
    vatPercentage: 15,
    active: true,
    station: 'beverage',
    modifierGroupIds: [],
    nutrition: {
      caloriesKcal: 110,
      fatGrams: 0,
      saturatedFatGrams: 0,
      sugarGrams: 21,
      sodiumMilligrams: 5,
      caffeineMilligrams: 0,
      allergens: [],
    },
    costPrice: 3,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: 'menu-cold-brew',
    nameEn: 'Cold Brew Coffee',
    nameAr: 'قهوة كولد برو',
    descriptionEn: 'Chilled coffee with caffeine disclosure.',
    descriptionAr: 'قهوة باردة مع إفصاح الكافيين.',
    categoryId: 'cat-beverages',
    basePrice: 16,
    vatPercentage: 15,
    active: true,
    station: 'beverage',
    modifierGroupIds: [],
    nutrition: {
      caloriesKcal: 35,
      fatGrams: 0,
      saturatedFatGrams: 0,
      sugarGrams: 3,
      sodiumMilligrams: 15,
      caffeineMilligrams: 180,
      caffeineServingMl: 300,
      allergens: [],
    },
    costPrice: 4.5,
    createdAt: now(),
    updatedAt: now(),
  },
];

const DEFAULT_DINING_AREAS: DiningArea[] = [
  { id: 'area-main', nameEn: 'Main Dining', nameAr: 'الصالة الرئيسية', sortOrder: 1 },
  { id: 'area-family', nameEn: 'Family Section', nameAr: 'قسم العائلات', sortOrder: 2 },
];

const DEFAULT_TABLES: DiningTable[] = Array.from({ length: 10 }, (_, index) => ({
  id: `table-${index + 1}`,
  branchId: 'branch-main',
  areaId: index < 6 ? 'area-main' : 'area-family',
  label: `T${index + 1}`,
  seats: index < 6 ? 4 : 6,
  state: 'vacant' as const,
  updatedAt: now(),
}));

const DEFAULT_RESTAURANT_GROUP: RestaurantGroup = {
  id: 'group-oasis',
  nameEn: 'Baqala OS Group',
  nameAr: 'مجموعة بقالة',
  cloudTenantId: 'baqala-local-tenant',
  createdAt: now(),
  updatedAt: now(),
};

const DEFAULT_BRANCHES: RestaurantBranch[] = [
  {
    id: 'branch-main',
    groupId: DEFAULT_RESTAURANT_GROUP.id,
    nameEn: 'Main Branch',
    nameAr: 'الفرع الرئيسي',
    serviceTypes: [],
    operatingHours: [
      { day: 'sun', open: '09:00', close: '01:00' },
      { day: 'mon', open: '09:00', close: '01:00' },
      { day: 'tue', open: '09:00', close: '01:00' },
      { day: 'wed', open: '09:00', close: '01:00' },
      { day: 'thu', open: '09:00', close: '02:00' },
      { day: 'fri', open: '13:00', close: '02:00' },
      { day: 'sat', open: '09:00', close: '01:00' },
    ],
    cloudStatus: { status: 'unknown' },
    active: true,
    createdAt: now(),
    updatedAt: now(),
  },
];

const DEFAULT_CLOUD_CONFIG: CloudStorageConfig = {
  enabled: false,
  mode: 'cloud_only',
  cloudflareTunnelUrl: '',
  lanApiUrl: 'http://localhost:8787',
  apiToken: '',
  deviceId: `device-${Math.random().toString(16).slice(2)}`,
  syncIntervalMinutes: 5,
  status: 'not_configured',
};

const DEFAULT_CLOUD_SYNC_STATUS: CloudSyncStatus = {
  online: false,
  sourceOfTruth: 'mac_mini_cloud',
  queued: 0,
  synced: 0,
  failed: 0,
};

const defaultPreviewStore = {
  products: [] as Product[],
  transactions: [] as Transaction[],
  customers: [] as Customer[],
  expenses: [] as Expense[],
  shifts: [] as Shift[],
  heldCarts: [] as HeldCart[],
  users: [] as User[],
  auditLogs: [] as any[],
  config: INITIAL_STORE_CONFIG,
  zatca: {
    mode: 'sandbox',
    onboardingStatus: 'not_configured',
    reportingEndpoint: '',
    complianceCsid: '',
    productionCsid: ''
  } as ZatcaState,
  hardware: {
    receiptPrinter: '',
    receiptWidth: '80mm',
    autoPrintReceipt: true,
    cashDrawerEnabled: false,
    cashDrawerPulseCommand: '27,112,0,25,250',
    barcodeScannerMode: 'keyboard',
    barcodeMinLength: 4,
    requireCardApprovalReference: true,
    paymentGatewayEnabled: false,
    paymentGatewayUrl: '',
    paymentGatewayApiKey: '',
    paymentGatewayTerminalId: '',
    paymentGatewayTimeoutSeconds: 60
  } as HardwareConfig,
  suppliers: [] as Supplier[],
  stockAdjustments: [] as StockAdjustment[],
  purchaseInvoices: [] as PurchaseInvoice[],
  creditEntries: [] as CreditEntry[],
  creditTransactions: [] as CreditTransaction[],
  deals: [] as Deal[],
  menuCategories: DEFAULT_MENU_CATEGORIES,
  modifierGroups: DEFAULT_MODIFIER_GROUPS,
  menuItems: DEFAULT_MENU_ITEMS,
  diningAreas: DEFAULT_DINING_AREAS,
  tables: DEFAULT_TABLES,
  restaurantOrders: [] as RestaurantOrder[],
  kitchenTickets: [] as KitchenTicket[],
  ingredients: [] as Ingredient[],
  recipes: [] as Recipe[],
  wastageEntries: [] as WastageEntry[],
  staffMembers: [] as StaffMember[],
  healthCertificates: [] as HealthCertificate[],
  syncQueue: [] as SyncQueueItem[],
  zatcaSubmissions: [] as ZatcaSubmission[],
  restaurantGroups: [DEFAULT_RESTAURANT_GROUP] as RestaurantGroup[],
  branches: DEFAULT_BRANCHES,
  activeBranchId: DEFAULT_BRANCHES[0].id,
  branchStaffAssignments: [] as BranchStaffAssignment[],
  cloudStorageConfig: DEFAULT_CLOUD_CONFIG,
  cloudSyncStatus: DEFAULT_CLOUD_SYNC_STATUS,
  guestTabs: [] as GuestTab[],
  reservations: [] as Reservation[],
  loyaltyProfiles: [] as LoyaltyProfile[],
  deliveryChannels: [] as DeliveryChannel[],
  externalDeliveryOrders: [] as ExternalDeliveryOrder[],
  deliveryProviderEvents: [] as DeliveryProviderEvent[],
  promotions: [] as Promotion[],
  serviceChargeConfigs: [] as ServiceChargeConfig[],
};

const previewStore = (() => {
  const parsed = { ...defaultPreviewStore };
  if (shouldUseFirebase()) {
    FIREBASE_BACKED_KEYS.forEach(key => {
      (parsed as any)[key] = [];
    });
  }
  parsed.hardware = { ...defaultPreviewStore.hardware, ...(parsed.hardware || {}) };
  parsed.menuCategories = parsed.menuCategories?.length ? parsed.menuCategories : (shouldUseFirebase() ? [] : DEFAULT_MENU_CATEGORIES);
  parsed.modifierGroups = parsed.modifierGroups?.length ? parsed.modifierGroups : (shouldUseFirebase() ? [] : DEFAULT_MODIFIER_GROUPS);
  parsed.menuItems = parsed.menuItems?.length ? parsed.menuItems : (shouldUseFirebase() ? [] : DEFAULT_MENU_ITEMS);
  parsed.diningAreas = parsed.diningAreas?.length ? parsed.diningAreas : (shouldUseFirebase() ? [] : DEFAULT_DINING_AREAS);
  parsed.tables = parsed.tables?.length ? parsed.tables : (shouldUseFirebase() ? [] : DEFAULT_TABLES);
  parsed.restaurantGroups = parsed.restaurantGroups?.length ? parsed.restaurantGroups : [DEFAULT_RESTAURANT_GROUP];
  parsed.branches = parsed.branches?.length ? parsed.branches : DEFAULT_BRANCHES;
  parsed.activeBranchId = parsed.activeBranchId || parsed.branches[0]?.id || DEFAULT_BRANCHES[0].id;
  parsed.cloudStorageConfig = { ...DEFAULT_CLOUD_CONFIG, ...(parsed.cloudStorageConfig || {}) };
  parsed.cloudSyncStatus = { ...DEFAULT_CLOUD_SYNC_STATUS, ...(parsed.cloudSyncStatus || {}) };
  return parsed;
})();

let currentUser: User | null = null;

function ensureTrialMockStore() {
  if (!isTrialMode() || trialMockSeeded) return;
  Object.assign(previewStore, createTrialMockStore());
  trialMockSeeded = true;
}

type StoredPreviewUser = User & {
  passwordHash?: string;
  pinHash?: string;
  password?: string;
  quickPin?: string;
};

function persistPreviewStore() {
  if (isTrialMode()) return;
  if (isElectron()) {
    void persistToSQLite();
    return;
  }
  if (!shouldUseFirebase()) {
    throw new Error('Firebase is required. Local browser storage is disabled for production.');
  }
  const writes: Promise<void>[] = [];
  Object.entries(FIRESTORE_COLLECTION_BY_KEY).forEach(([key, collectionName]) => {
    if (key === 'config') return;
    const value = (previewStore as any)[key];
    if (!Array.isArray(value)) return;
    value.filter((item: { id?: string }) => item?.id).forEach((item: { id: string }) => {
      writes.push(FirebaseService.save(collectionName, item));
    });
  });
  writes.push(FirebaseService.save('storeConfig', { id: 'default', ...previewStore.config }));
  writes.push(FirebaseService.save('hardwareConfig', { id: 'default', ...previewStore.hardware }));
  // Scrub all credentials and key material before syncing to Firestore.
  // Private keys and API secrets must NEVER leave the device — they are only
  // valid for the device that generated the CSR and have no value on other devices.
  const { privateKeyPem: _pkp, complianceSecretKey: _csk, productionSecretKey: _psk, ...safezatca } = previewStore.zatca ?? {};
  writes.push(FirebaseService.save('zatcaState', { id: 'default', ...safezatca }));
  writes.push(FirebaseService.save('cloudStorageConfig', { id: 'default', ...previewStore.cloudStorageConfig }));
  writes.push(FirebaseService.save('cloudSyncStatus', { id: 'default', ...previewStore.cloudSyncStatus }));
  writes.push(FirebaseService.save('appState', {
    id: 'default',
    activeBranchId: previewStore.activeBranchId,
    setupComplete: previewStore.config.setupComplete,
    updatedAt: Date.now(),
  }));
  void Promise.all(writes).catch(error => {
    console.warn('Firestore persistence failed', error);
  });
}

function bridge<T>(command: string, payload: Record<string, unknown> = {}): T | null {
  ensureTrialMockStore();
  void command;
  void payload;
  return null;
}

function actor() {
  return currentUser?.name || 'System';
}

function requireBridgeOrPreview<T>(command: string, fallback: () => T, payload: Record<string, unknown> = {}): T {
  const result = bridge<T>(command, payload);
  return result ?? fallback();
}

function sanitizedPin(value?: string) {
  return String(value || '').replace(/\D/g, '').slice(0, 6);
}

function safeUser(user: StoredPreviewUser): User {
  const { passwordHash, pinHash, password, quickPin, ...safe } = user;
  return safe;
}

function normalizePhone(value?: string) {
  return String(value || '').replace(/\D/g, '').replace(/^0/, '966');
}

function findCreditEntryForCustomer(customer: Customer) {
  const phone = normalizePhone(customer.phone);
  return (previewStore.creditEntries ?? []).find(entry =>
    entry.customerId === customer.id ||
    (!!phone && normalizePhone(entry.customerPhone) === phone) ||
    (!!customer.name && entry.customerName.trim().toLowerCase() === customer.name.trim().toLowerCase())
  );
}

function findCustomerForCreditEntry(entry: CreditEntry) {
  const phone = normalizePhone(entry.customerPhone);
  return (previewStore.customers ?? []).find(customer =>
    customer.id === entry.customerId ||
    (!!phone && normalizePhone(customer.phone) === phone) ||
    (!!entry.customerName && customer.name.trim().toLowerCase() === entry.customerName.trim().toLowerCase())
  );
}

function syncCreditEntryForCustomer(customer: Customer) {
  previewStore.creditEntries = previewStore.creditEntries ?? [];
  const existing = findCreditEntryForCustomer(customer);
  const now = Date.now();
  const synced: CreditEntry = {
    id: existing?.id || `CE-${customer.id || now}`,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    totalDebt: Number(customer.balance || existing?.totalDebt || 0),
    creditLimit: existing?.creditLimit,
    createdAt: existing?.createdAt || now,
    lastActivityAt: Math.max(existing?.lastActivityAt || 0, customer.lastVisit || now),
  };
  const idx = previewStore.creditEntries.findIndex(entry => entry.id === synced.id);
  if (idx >= 0) previewStore.creditEntries[idx] = synced;
  else previewStore.creditEntries.unshift(synced);
  return synced;
}

function syncCustomerForCreditEntry(entry: CreditEntry) {
  previewStore.customers = previewStore.customers ?? [];
  const existing = findCustomerForCreditEntry(entry);
  const now = Date.now();
  const synced: Customer = {
    id: existing?.id || entry.customerId || `CUS-${now}`,
    name: entry.customerName,
    phone: entry.customerPhone || existing?.phone || '',
    balance: Number(entry.totalDebt || 0),
    points: existing?.points || 0,
    lastVisit: entry.lastActivityAt || existing?.lastVisit || now,
  };
  const idx = previewStore.customers.findIndex(customer => customer.id === synced.id);
  if (idx >= 0) previewStore.customers[idx] = synced;
  else previewStore.customers.push(synced);
  return synced;
}

function syncExistingCustomerCreditLinks() {
  previewStore.creditEntries = previewStore.creditEntries ?? [];
  previewStore.customers = previewStore.customers ?? [];
  previewStore.customers.forEach(syncCreditEntryForCustomer);
  previewStore.creditEntries.forEach(entry => {
    const customer = syncCustomerForCreditEntry(entry);
    entry.customerId = customer.id;
    if (!entry.customerPhone && customer.phone) entry.customerPhone = customer.phone;
  });
}

function saveById<T extends { id: string }>(collection: T[], item: T) {
  const index = collection.findIndex(existing => existing.id === item.id);
  if (index >= 0) collection[index] = item;
  else collection.unshift(item);
  return collection;
}

function groupTicketsByStation(order: RestaurantOrder): KitchenTicket[] {
  const firedItems = order.items.filter(item => item.status === 'fired');
  const stations = new Map<string, typeof firedItems>();
  firedItems.forEach(item => {
    const stationItems = stations.get(item.station) || [];
    stationItems.push(item);
    stations.set(item.station, stationItems);
  });

  return [...stations.entries()].map(([station, items]) => ({
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

function emitKitchenTicketsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('oasis:kitchen-tickets-updated'));
}

function mirrorToFirestore<T extends { id: string }>(collectionName: FirestoreCollection, value: T) {
  if (!shouldUseFirebase()) return;
  void FirebaseService.save(collectionName, value).catch(error => {
    console.warn(`Firestore sync failed for ${collectionName}/${value.id}`, error);
  });
}

function deleteFromFirestore(collectionName: FirestoreCollection, id: string) {
  if (!shouldUseFirebase()) return;
  void FirebaseService.delete(collectionName, id).catch(error => {
    console.warn(`Firestore delete failed for ${collectionName}/${id}`, error);
  });
}

// ── ZATCA invoice hash chain ────────────────────────────────────────────────

export const ZATCA_INVOICE_SIGNED_EVENT = 'baqala:zatca-invoice-signed';

// `previewStore.transactions` is newest-first and may be re-ordered arbitrarily
// after a Firestore sync, so the chain is always derived from the ICV
// (invoiceSeqNum) rather than from array position.

/** Chained transactions sorted oldest → newest by ICV. */
function chainOrderedTransactions(): Transaction[] {
  return (previewStore.transactions || [])
    .filter(tx => Number.isFinite(Number(tx?.invoiceSeqNum)))
    .slice()
    .sort((a, b) => Number(a.invoiceSeqNum) - Number(b.invoiceSeqNum));
}

/** Next ICV and the best synchronously-known PIH for a new invoice. */
function nextChainAnchor(): { invoiceSeqNum: number; previousInvoiceHash: string } {
  const chained = chainOrderedTransactions();
  const last = chained[chained.length - 1];
  if (!last) return { invoiceSeqNum: 1, previousInvoiceHash: ZATCA_GENESIS_PIH };
  return {
    invoiceSeqNum: Number(last.invoiceSeqNum) + 1,
    previousInvoiceHash: last.invoiceHash || ZATCA_GENESIS_PIH,
  };
}

/**
 * Resolves to the invoice hash of the newest invoice once its async signing has
 * settled. This keeps back-to-back sales correctly chained even though the hash
 * of invoice N is only known a tick after invoice N+1 may have been saved.
 */
let chainTail: Promise<string> | null = null;

/** Lets an open receipt pick up the hash/signature that arrive a tick after the sale. */
function emitZatcaInvoiceSigned(id: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ZATCA_INVOICE_SIGNED_EVENT, { detail: { id } }));
}

function pendingZatcaStatus(): Transaction['zatcaStatus'] {
  return previewStore.zatca?.mode === 'production' ? 'pending' : 'sandbox_pending';
}

function persistQuietly() {
  try {
    persistPreviewStore();
  } catch (error) {
    console.warn('ZATCA chain persistence failed', error);
  }
}

/**
 * Second (asynchronous) half of signing: computes the real SHA-256 invoice hash
 * and the ECDSA signature, then patches the already-stored transaction in place.
 * `saveTransaction` stays synchronous because of this split.
 */
function finalizeZatcaChain(transaction: Transaction, sellerVat: string, fallbackPih: string) {
  const previous = chainTail ?? Promise.resolve(fallbackPih);

  const settled = previous.then(async previousHash => {
    const previousInvoiceHash = previousHash || ZATCA_GENESIS_PIH;
    const invoiceHash = await computeInvoiceHash(transaction, sellerVat, previousInvoiceHash);
    const signature = await signInvoiceHash(invoiceHash);
    const cryptoAvailable = isRealCryptoAvailable();

    const patch: Partial<Transaction> = {
      previousInvoiceHash,
      invoiceHash,
      cryptographicSignature: signature ?? undefined,
      zatcaStatus: signature ? pendingZatcaStatus() : 'failed',
      zatcaError: signature
        ? undefined
        : cryptoAvailable
          ? 'Local ECDSA signing failed on this device; invoice is hashed but unsigned.'
          : 'crypto.subtle unavailable (insecure origin) — invoice hash is a non-cryptographic placeholder and it is unsigned.',
    };

    // Patch every live reference: the object handed back to the caller (used for
    // the receipt) and whatever copy currently sits in the store.
    const stored = (previewStore.transactions || []).find(tx => tx.id === transaction.id);
    const targets = stored && stored !== transaction ? [transaction, stored] : [transaction];
    targets.forEach(target => Object.assign(target, patch));

    if (!previewStore.zatca?.publicKeyPem) {
      const key = await getOrCreateSigningKey();
      if (key) previewStore.zatca = { ...previewStore.zatca, publicKeyPem: key.publicKeyPem };
    }

    persistQuietly();
    mirrorToFirestore('transactions', stored ?? transaction);
    emitZatcaInvoiceSigned(transaction.id);
    return invoiceHash;
  });

  // A failure must not stall the chain for the next invoice.
  chainTail = settled.catch(() => fallbackPih);
  void settled.catch(error => console.warn('ZATCA invoice signing failed', error));
}

/**
 * Re-attempts local ECDSA signing for invoices that were hashed but never signed
 * (e.g. the browser had no `crypto.subtle` at checkout time). The invoice hash is
 * left untouched so the chain cannot be disturbed.
 */
async function resignQueuedInvoices(queued: Transaction[]) {
  let changed = false;
  for (const tx of queued) {
    const signature = await signInvoiceHash(String(tx.invoiceHash));
    if (!signature) continue;
    tx.cryptographicSignature = signature;
    tx.zatcaStatus = pendingZatcaStatus();
    tx.zatcaError = undefined;
    mirrorToFirestore('transactions', tx);
    changed = true;
  }
  if (changed) persistQuietly();
}

export const StorageService = {
  isDesktopRuntime: () => false,

  isElectron,

  isTrialMode,

  isFirebaseConfigured: () => shouldUseFirebase(),

  loadFromSQLite,

  getBackupSettings: async (): Promise<{ autoBackup: boolean; backupFolder: string; lastBackupAt?: number | null; lastBackupPath?: string | null }> => {
    if (!isElectron()) return { autoBackup: false, backupFolder: '' };
    return (window as any).electronAPI.getBackupSettings();
  },

  saveBackupSettings: async (settings: { autoBackup: boolean; backupFolder: string }): Promise<void> => {
    if (!isElectron()) return;
    return (window as any).electronAPI.saveBackupSettings(settings);
  },

  selectBackupFolder: async (): Promise<string | null> => {
    if (!isElectron()) return null;
    return (window as any).electronAPI.selectBackupFolder();
  },

  exportBackup: async (folderPath?: string): Promise<{ success: boolean; path?: string }> => {
    if (!isElectron()) return { success: false };
    return (window as any).electronAPI.exportBackup(folderPath);
  },

  importBackup: async (filePath?: string): Promise<{ success: boolean }> => {
    if (!isElectron()) return { success: false };
    return (window as any).electronAPI.importBackup(filePath);
  },

  syncFirebaseData: async (): Promise<boolean> => {
    ensureTrialMockStore();
    if (!shouldUseFirebase()) return false;
    const entries = await Promise.all(
      Object.entries(FIRESTORE_COLLECTION_BY_KEY).map(async ([key, collectionName]) => {
        const data = await FirebaseService.list<any>(collectionName);
        return [key, data] as const;
      })
    );
    entries.forEach(([key, data]) => {
      if (key === 'config') {
        (previewStore as any)[key] = { ...previewStore.config, ...(data.find(item => item.id === 'default') || data[0] || {}) };
        return;
      }
      (previewStore as any)[key] = data;
    });
    const appState = await FirebaseService.list<{ id: string; activeBranchId?: string; setupComplete?: boolean }>('appState');
    const defaultAppState = appState.find(item => item.id === 'default') || appState[0];
    if (defaultAppState?.activeBranchId) previewStore.activeBranchId = defaultAppState.activeBranchId;
    if (defaultAppState?.setupComplete) previewStore.config = { ...previewStore.config, setupComplete: true };
    const [hardwareConfig, zatcaState, cloudStorageConfig, cloudSyncStatus] = await Promise.all([
      FirebaseService.list<HardwareConfig & { id: string }>('hardwareConfig'),
      FirebaseService.list<ZatcaState & { id: string }>('zatcaState'),
      FirebaseService.list<CloudStorageConfig & { id: string }>('cloudStorageConfig'),
      FirebaseService.list<CloudSyncStatus & { id: string }>('cloudSyncStatus'),
    ]);
    previewStore.hardware = { ...previewStore.hardware, ...(hardwareConfig.find(item => item.id === 'default') || hardwareConfig[0] || {}) };
    // Merge remote zatcaState but NEVER overwrite local key material with remote values
    // (which are always scrubbed before upload). This preserves the device-local private key.
    const remoteZatca = zatcaState.find(item => item.id === 'default') || zatcaState[0] || {};
    const { privateKeyPem: _pkp2, complianceSecretKey: _csk2, productionSecretKey: _psk2, ...safeRemoteZatca } = remoteZatca as ZatcaState & { id: string };
    previewStore.zatca = { ...safeRemoteZatca, ...previewStore.zatca };
    previewStore.cloudStorageConfig = { ...previewStore.cloudStorageConfig, ...(cloudStorageConfig.find(item => item.id === 'default') || cloudStorageConfig[0] || {}) };
    previewStore.cloudSyncStatus = { ...previewStore.cloudSyncStatus, ...(cloudSyncStatus.find(item => item.id === 'default') || cloudSyncStatus[0] || {}) };
    persistPreviewStore();
    return true;
  },

  getDataPath: () => requireBridgeOrPreview<{ dataDir: string; backupDir: string; dbPath: string }>('paths', () => ({
    dataDir: 'Firebase Firestore',
    backupDir: 'Firebase Firestore',
    dbPath: 'Firebase Firestore'
  })),

  isSetupComplete: (): boolean => requireBridgeOrPreview<boolean>('isSetupComplete', () => !!previewStore.config.setupComplete),

  createInitialSetup: (payload: InitialSetupPayload) => {
    const result = bridge<{ ok: boolean }>('createInitialSetup', payload as unknown as Record<string, unknown>);
    if (!result) {
      if (!shouldUseFirebase()) {
        throw new Error('Firebase is required before setup. Local setup storage is disabled.');
      }
      const config = payload.config;
      if (!config?.nameEn || !config?.nameAr || !config?.vatNumber || !config?.crNumber || !config?.phone || !config?.address || !payload.admin?.name || !payload.admin?.username || !payload.admin?.password) {
        throw new Error('Store English name, Arabic name, VAT number, CR number, phone, address, administrator username, and password are required.');
      }
      if (!/^\d{10}$/.test(String(config.crNumber))) {
        throw new Error('Saudi CR number must be 10 digits.');
      }
      previewStore.config = { ...previewStore.config, ...payload.config, setupComplete: true };
      const admin = {
        id: 'preview-admin',
        name: payload.admin.name,
        username: payload.admin.username,
        role: 'administrator',
        active: true,
        createdAt: Date.now(),
        passwordHash: payload.admin.password
      } as User & { passwordHash: string };
      previewStore.users = [admin];
      currentUser = null;
      void FirebaseService.save('storeConfig', { id: 'default', ...previewStore.config });
      void FirebaseService.save('users', admin);
      void FirebaseService.save('appState', {
        id: 'default',
        setupComplete: true,
        activeBranchId: previewStore.activeBranchId,
        updatedAt: Date.now(),
      });
      persistPreviewStore();
    }
    return true;
  },

  login: (username: string, password: string): User => {
    const user = bridge<User>('login', { username, password });
    if (user) {
      currentUser = user;
      return user;
    }
    if (isTrialMode()) {
      const trialAdmin = (previewStore.users as StoredPreviewUser[]).find(item => item.role === 'administrator' && item.active);
      if (!trialAdmin) throw new Error('Trial administrator is not available.');
      currentUser = safeUser(trialAdmin);
      return currentUser;
    }
    const previewUser = (previewStore.users as StoredPreviewUser[]).find(item =>
      item.active && item.username.toLowerCase() === username.trim().toLowerCase() && item.passwordHash === password
    );
    if (!previewUser) throw new Error('Invalid username or password.');
    currentUser = safeUser(previewUser);
    return currentUser;
  },

  loginWithQuickPin: (pin: string): User => {
    ensureTrialMockStore();
    if (isTrialMode()) {
      const trialAdmin = (previewStore.users as StoredPreviewUser[]).find(item => item.role === 'administrator' && item.active);
      if (!trialAdmin) throw new Error('Trial administrator is not available.');
      currentUser = safeUser(trialAdmin);
      return currentUser;
    }
    const quickPin = sanitizedPin(pin);
    if (!/^\d{4,6}$/.test(quickPin)) throw new Error('Quick Access PIN must be 4 to 6 digits.');
    const user = bridge<User>('loginWithQuickPin', { quickPin });
    if (user) {
      currentUser = user;
      return user;
    }
    const matches = (previewStore.users as StoredPreviewUser[]).filter(item =>
      item.active && (item.pinHash === quickPin || item.quickPin === quickPin)
    );
    if (matches.length !== 1) {
      throw new Error(matches.length > 1 ? 'Quick Access PIN is assigned to multiple employees.' : 'Invalid Quick Access PIN.');
    }
    currentUser = safeUser(matches[0]);
    return currentUser;
  },

  repairTrialAdmin: (password: string): User => {
    const repaired = bridge<User>('repairTrialAdmin', { password, actor: 'Trial Mode' });
    if (repaired) {
      currentUser = repaired;
      return repaired;
    }
    const admin = {
      id: 'preview-admin',
      name: 'Administrator',
      username: 'admin',
      role: 'administrator',
      active: true,
      createdAt: Date.now(),
      passwordHash: password
    } as User & { passwordHash: string };
    previewStore.users = [
      admin,
      ...(previewStore.users || []).filter(user => String(user.username || '').toLowerCase() !== 'admin')
    ];
    if (!previewStore.config.setupComplete) {
      previewStore.config = { ...previewStore.config, setupComplete: true };
    }
    currentUser = admin;
    persistPreviewStore();
    return admin;
  },

  logout: () => {
    currentUser = null;
  },

  getCurrentUser: () => currentUser,

  hasPermission: (permission: Permission) => {
    if (!currentUser) return false;
    const role = String(currentUser.role);
    const normalizedRole = role === 'admin' || role === 'manager' ? 'administrator' : role;
    return ROLE_PERMISSIONS[normalizedRole as UserRole].includes(permission);
  },

  getUsers: (): User[] => requireBridgeOrPreview<User[]>('getUsers', () => (previewStore.users as StoredPreviewUser[]).map(safeUser)),

  saveUser: (user: Partial<User> & { password?: string; quickPin?: string }) => requireBridgeOrPreview<User[]>('saveUser', () => {
    const existing = (previewStore.users as StoredPreviewUser[]).find(item => item.id === user.id);
    const pin = sanitizedPin(user.quickPin);
    const saved = {
      ...(existing || {}),
      id: user.id || Date.now().toString(),
      name: user.name || '',
      username: user.username || user.name || '',
      role: user.role || 'cashier',
      staffMemberId: user.staffMemberId,
      primaryBranchId: user.primaryBranchId,
      branchIds: user.branchIds || [],
      active: user.active !== false,
      createdAt: user.createdAt || Date.now(),
      passwordHash: (user as any).password || (user as any).passwordHash || existing?.passwordHash || '',
      pinHash: pin || existing?.pinHash || ''
    } as StoredPreviewUser;
    previewStore.users = [...previewStore.users.filter(item => item.id !== saved.id), saved];
    persistPreviewStore();
    return (previewStore.users as StoredPreviewUser[]).map(safeUser);
  }, { user, actor: actor() }),

  // --- PRODUCTS ---
  getProducts: (): Product[] => requireBridgeOrPreview<Product[]>('getProducts', () => previewStore.products),

  saveProduct: (product: Product) => requireBridgeOrPreview<Product[]>('saveProduct', () => {
    if (!product.nameEn?.trim()) throw new Error('Product English name is required.');
    if (!product.barcode?.trim()) throw new Error('Product barcode is required.');
    if (!Number.isFinite(product.price) || product.price <= 0) throw new Error('Product selling price must be greater than zero.');
    if (!Number.isFinite(product.stock) || product.stock < 0) throw new Error('Product stock cannot be negative.');
    if (product.costPrice !== undefined && product.costPrice < 0) throw new Error('Product cost cannot be negative.');
    const existingBarcode = previewStore.products.find(item => item.barcode && item.barcode === product.barcode && item.id !== product.id);
    if (existingBarcode) throw new Error(`Barcode already exists for ${existingBarcode.nameEn}.`);
    const saved = { ...product, id: product.id || `PRD-${Date.now()}` };
    previewStore.products = [...previewStore.products.filter(item => item.id !== saved.id), saved];
    persistPreviewStore();
    mirrorToFirestore('products', saved);
    return previewStore.products;
  }, { product, actor: actor() }),

  deleteProduct: (id: string) => requireBridgeOrPreview<Product[]>('deleteProduct', () => {
    previewStore.products = previewStore.products.filter(item => item.id !== id);
    persistPreviewStore();
    deleteFromFirestore('products', id);
    return previewStore.products;
  }, { id, actor: actor() }),

  importProducts: (products: Partial<Product>[]) => requireBridgeOrPreview<Product[]>('importProducts', () => {
    for (const product of products) {
      if (!product.nameEn || !product.barcode || Number(product.price || 0) <= 0) continue;
      const saved = {
        id: product.id || Date.now().toString() + Math.random().toString(16).slice(2),
        nameEn: product.nameEn,
        nameAr: product.nameAr || product.nameEn,
        barcode: product.barcode,
        price: Number(product.price || 0),
        costPrice: Number(product.costPrice || 0),
        stock: Number(product.stock || 0),
        category: product.category || 'Snacks',
        expiryDate: product.expiryDate || '',
        selectiveTax: product.selectiveTax || 'none',
        image: ''
      } as Product;
      previewStore.products = [...previewStore.products.filter(item => item.barcode !== saved.barcode), saved];
      mirrorToFirestore('products', saved);
    }
    persistPreviewStore();
    return previewStore.products;
  }, { products, actor: actor() }),

  getSuppliers: (): Supplier[] => requireBridgeOrPreview<Supplier[]>('getSuppliers', () => previewStore.suppliers),

  saveSupplier: (supplier: Supplier) => requireBridgeOrPreview<Supplier[]>('saveSupplier', () => {
    const saved = { ...supplier, id: supplier.id || Date.now().toString(), createdAt: supplier.createdAt || Date.now() };
    previewStore.suppliers = [...previewStore.suppliers.filter(item => item.id !== saved.id), saved];
    persistPreviewStore();
    return previewStore.suppliers;
  }, { supplier, actor: actor() }),

  deleteSupplier: (id: string) => requireBridgeOrPreview<Supplier[]>('deleteSupplier', () => {
    previewStore.suppliers = previewStore.suppliers.filter(item => item.id !== id);
    persistPreviewStore();
    return previewStore.suppliers;
  }, { id, actor: actor() }),

  getStockAdjustments: (): StockAdjustment[] => requireBridgeOrPreview<StockAdjustment[]>('getStockAdjustments', () => previewStore.stockAdjustments),

  adjustStock: (adjustment: Omit<StockAdjustment, 'id' | 'productName' | 'user' | 'timestamp'>) => requireBridgeOrPreview<{ products: Product[]; adjustments: StockAdjustment[] }>('adjustStock', () => {
    const product = previewStore.products.find(item => item.id === adjustment.productId);
    if (!product) throw new Error('Product not found');
    product.stock = Math.max(0, product.stock + adjustment.quantityDelta);
    const saved: StockAdjustment = { ...adjustment, id: Date.now().toString(), productName: product.nameEn, user: actor(), timestamp: Date.now() };
    previewStore.stockAdjustments.unshift(saved);
    persistPreviewStore();
    return { products: previewStore.products, adjustments: previewStore.stockAdjustments };
  }, { adjustment, actor: actor() }),

  getPurchaseInvoices: (): PurchaseInvoice[] => requireBridgeOrPreview<PurchaseInvoice[]>('getPurchaseInvoices', () => previewStore.purchaseInvoices),

  savePurchaseInvoice: (invoice: PurchaseInvoice) => requireBridgeOrPreview<{ invoices: PurchaseInvoice[]; products: Product[]; adjustments: StockAdjustment[] }>('savePurchaseInvoice', () => {
    // Assign a stable ID if creating new.
    const saved: PurchaseInvoice = { ...invoice, id: invoice.id || ('PINV-' + Date.now()) };
    const existing = previewStore.purchaseInvoices.findIndex(i => i.id === saved.id);
    if (existing >= 0) previewStore.purchaseInvoices[existing] = saved;
    else previewStore.purchaseInvoices.unshift(saved);
    saved.lines.forEach(line => {
      const product = previewStore.products.find(item => item.id === line.productId);
      if (product) {
        const units = line.totalUnits ?? line.quantity;
        product.stock += units;
        product.costPrice = line.unitCostPerItem ?? line.unitCost;
        previewStore.stockAdjustments.unshift({
          id: Date.now().toString() + line.productId,
          productId: line.productId,
          productName: product.nameEn,
          quantityDelta: units,
          reason: 'purchase',
          note: `Purchase invoice ${invoice.invoiceNumber}`,
          user: actor(),
          timestamp: Date.now()
        });
      }
    });
    persistPreviewStore();
    return { invoices: previewStore.purchaseInvoices, products: previewStore.products, adjustments: previewStore.stockAdjustments };
  }, { invoice: { ...invoice, id: invoice.id || ('PINV-' + Date.now()) }, actor: actor() }),

  // --- TRANSACTIONS ---
  saveTransaction: (transaction: Transaction) => {
    const saved = bridge<Transaction>('saveTransaction', { transaction, actor: actor() });
    if (saved) {
      mirrorToFirestore('transactions', saved);
      return saved;
    }

    // ZATCA chain, synchronous part. Everything assignable without Web Crypto is
    // set here so the caller gets a fully-identified invoice back immediately.
    // These are always re-assigned (never preserved) because refunds are built by
    // spreading the original transaction and would otherwise inherit its ICV/UUID.
    const sellerVat = String(previewStore.config?.vatNumber || '');
    const anchor = nextChainAnchor();
    transaction.uuid = generateInvoiceUuid();
    transaction.invoiceSeqNum = anchor.invoiceSeqNum;
    transaction.previousInvoiceHash = anchor.previousInvoiceHash;
    transaction.invoiceHash = undefined;
    transaction.cryptographicSignature = undefined;
    transaction.zatcaError = undefined;
    transaction.zatcaStatus = 'pending';

    previewStore.transactions.unshift(transaction);
    for (const item of transaction.items || []) {
      if (item.id?.startsWith('misc-')) continue;
      const product = previewStore.products.find(p => p.id === item.id);
      if (product) {
        const delta = transaction.isRefund ? item.quantity : -item.quantity;
        product.stock = Math.max(0, Number(product.stock || 0) + delta);
        mirrorToFirestore('products', product);
      }
    }
    if (transaction.customerId) {
      const customer = previewStore.customers.find(c => c.id === transaction.customerId);
      if (customer) {
        if (transaction.paymentMethod === 'credit') customer.balance += transaction.total;
        if (!transaction.isRefund && transaction.earnedPoints) customer.points = (customer.points || 0) + transaction.earnedPoints;
        customer.lastVisit = Date.now();
        mirrorToFirestore('customers', customer);
        const entry = syncCreditEntryForCustomer(customer);
        if (transaction.paymentMethod === 'credit') {
          previewStore.creditTransactions = previewStore.creditTransactions ?? [];
          previewStore.creditTransactions.unshift({
            id: `CT-${Date.now()}`,
            creditEntryId: entry.id,
            type: transaction.isRefund ? 'payment' : 'debt',
            amount: Math.abs(transaction.total),
            note: transaction.isRefund ? `Refund ${transaction.id}` : `POS credit sale ${transaction.id}`,
            linkedSaleId: transaction.id,
            createdAt: Date.now(),
            createdBy: actor(),
          });
        }
      }
    }
    persistPreviewStore();
    mirrorToFirestore('transactions', transaction);
    // Hash + signature land a tick later and patch the stored record in place.
    finalizeZatcaChain(transaction, sellerVat, anchor.previousInvoiceHash);
    return transaction;
  },

  getTransactions: (): Transaction[] => requireBridgeOrPreview<Transaction[]>('getTransactions', () => previewStore.transactions),

  // --- CUSTOMERS ---
  getCustomers: (): Customer[] => requireBridgeOrPreview<Customer[]>('getCustomers', () => {
    syncExistingCustomerCreditLinks();
    persistPreviewStore();
    return previewStore.customers;
  }),

  saveCustomer: (customer: Customer) => requireBridgeOrPreview<Customer[]>('saveCustomer', () => {
    const saved = {
      ...customer,
      id: customer.id || `CUS-${Date.now()}`,
      phone: customer.phone || '',
      balance: Number(customer.balance || 0),
      points: Number(customer.points || 0),
      lastVisit: customer.lastVisit || Date.now(),
    };
    previewStore.customers = [...previewStore.customers.filter(item => item.id !== saved.id), saved];
    syncCreditEntryForCustomer(saved);
    persistPreviewStore();
    mirrorToFirestore('customers', saved);
    return previewStore.customers;
  }, { customer, actor: actor() }),

  updateCustomerBalance: (id: string, amount: number) => requireBridgeOrPreview<Customer[]>('updateCustomerBalance', () => {
    previewStore.customers = previewStore.customers.map(customer => {
      if (customer.id !== id) return customer;
      const updated = { ...customer, balance: Number(customer.balance || 0) + amount, lastVisit: Date.now() };
      syncCreditEntryForCustomer(updated);
      return updated;
    });
    persistPreviewStore();
    return previewStore.customers;
  }, { id, amount, actor: actor() }),

  // --- EXPENSES ---
  getExpenses: (): Expense[] => requireBridgeOrPreview<Expense[]>('getExpenses', () => previewStore.expenses),

  addExpense: (expense: Expense) => requireBridgeOrPreview<Expense[]>('addExpense', () => {
    previewStore.expenses.unshift(expense);
    persistPreviewStore();
    return previewStore.expenses;
  }, { expense, actor: actor() }),

  // --- SHIFTS ---
  getShifts: (): Shift[] => requireBridgeOrPreview<Shift[]>('getShifts', () => previewStore.shifts),

  getCurrentShift: (): Shift | undefined => {
    const shifts = StorageService.getShifts();
    return shifts.find(s => s.status === 'open');
  },

  openShift: (shiftData: Omit<Shift, 'id' | 'status'>) => requireBridgeOrPreview<Shift>('openShift', () => {
    const shift: Shift = { ...shiftData, id: Date.now().toString(), status: 'open' };
    previewStore.shifts = [shift, ...previewStore.shifts.map(item => item.status === 'open' ? { ...item, status: 'closed' as const, closedAt: Date.now() } : item)];
    persistPreviewStore();
    return shift;
  }, { shiftData, actor: actor() }),

  closeShift: (id: string, closeData: Partial<Shift>) => requireBridgeOrPreview<Shift | null>('closeShift', () => {
    const idx = (previewStore.shifts as Shift[]).findIndex(s => s.id === id);
    if (idx < 0) return null;
    const updated: Shift = { ...(previewStore.shifts as Shift[])[idx], ...closeData, status: 'closed' as const, closedAt: Date.now() };
    (previewStore.shifts as Shift[])[idx] = updated;
    persistPreviewStore();
    return updated;
  }, { id, closeData, actor: actor() }),

  // --- HELD CARTS ---
  getHeldCarts: (): HeldCart[] => requireBridgeOrPreview<HeldCart[]>('getHeldCarts', () => previewStore.heldCarts),

  saveHeldCart: (cart: HeldCart) => requireBridgeOrPreview<HeldCart[]>('saveHeldCart', () => {
    previewStore.heldCarts.push(cart);
    persistPreviewStore();
    return previewStore.heldCarts;
  }, { cart }),

  removeHeldCart: (id: string) => requireBridgeOrPreview<HeldCart[]>('removeHeldCart', () => {
    previewStore.heldCarts = previewStore.heldCarts.filter(cart => cart.id !== id);
    persistPreviewStore();
    return previewStore.heldCarts;
  }, { id }),

  // --- CONFIG ---
  getConfig: (): StoreConfig => requireBridgeOrPreview<StoreConfig>('getConfig', () => previewStore.config),

  saveConfig: (config: StoreConfig) => requireBridgeOrPreview<StoreConfig>('saveConfig', () => {
    const lockedIdentity = previewStore.config?.setupComplete ? {
      vatNumber: previewStore.config.vatNumber,
      crNumber: previewStore.config.crNumber,
      phone: previewStore.config.phone,
      address: previewStore.config.address,
      vatRate: previewStore.config.vatRate,
      currency: previewStore.config.currency,
    } : {};
    previewStore.config = { ...previewStore.config, ...config, ...lockedIdentity };
    persistPreviewStore();
    return previewStore.config;
  }, { config, actor: actor() }),

  // --- COMPLIANCE, BACKUP, HARDWARE ---
  getAuditLogs: (): any[] => requireBridgeOrPreview<any[]>('getAuditLogs', () => previewStore.auditLogs),

  addAuditLog: (event: string, description: string, user: string = actor()) => requireBridgeOrPreview<any[]>('addAuditLog', () => {
    previewStore.auditLogs.unshift({ id: Date.now().toString(), timestamp: Date.now(), user, event, description, storageNode: 'Firebase Firestore' });
    persistPreviewStore();
    return previewStore.auditLogs;
  }, { event, description, user }),

  /**
   * Walks the stored invoices oldest → newest and checks two invariants:
   *   1. ICV increments by exactly 1 — no gaps, no duplicates.
   *   2. Each invoice's PIH equals the previous invoice's hash (genesis PIH at ICV 1).
   * Invoices whose hash has not landed yet (async signing still in flight) are
   * skipped for the PIH check instead of being reported as breaks.
   * `brokenIndex` is the index within the ICV-ordered chain.
   */
  validateCryptographicChain: (): { valid: boolean; brokenIndex?: number } => requireBridgeOrPreview('validateCryptographicChain', () => {
    const chain = chainOrderedTransactions();
    let previousSeqNum: number | null = null;
    let previousHash: string | null = null;

    for (let index = 0; index < chain.length; index++) {
      const tx = chain[index];
      const seqNum = Number(tx.invoiceSeqNum);

      if (previousSeqNum !== null && seqNum !== previousSeqNum + 1) {
        return { valid: false, brokenIndex: index };
      }

      if (tx.invoiceHash) {
        // At the start of the known chain there is nothing to compare against
        // unless this really is invoice #1, which must carry the genesis PIH.
        const expectedPih = previousHash ?? (seqNum === 1 ? ZATCA_GENESIS_PIH : null);
        if (expectedPih !== null && (tx.previousInvoiceHash || '') !== expectedPih) {
          return { valid: false, brokenIndex: index };
        }
      }

      previousSeqNum = seqNum;
      previousHash = tx.invoiceHash || null;
    }

    return { valid: true };
  }),

  /** Live counters for the compliance screen: how much of the chain is actually hashed/signed. */
  getZatcaChainStats: (): { chained: number; signed: number; awaiting: number; currentIcv: number; latestHash?: string } => requireBridgeOrPreview('getZatcaChainStats', () => {
    const chain = chainOrderedTransactions();
    const hashed = chain.filter(tx => !!tx.invoiceHash);
    return {
      chained: chain.length,
      signed: chain.filter(tx => !!tx.cryptographicSignature).length,
      awaiting: chain.length - hashed.length,
      currentIcv: chain.length ? Number(chain[chain.length - 1].invoiceSeqNum) : 0,
      latestHash: hashed[hashed.length - 1]?.invoiceHash,
    };
  }),

  getZatcaState: (): ZatcaState => requireBridgeOrPreview<ZatcaState>('getZatcaState', () => previewStore.zatca),

  saveZatcaState: (state: Partial<ZatcaState>) => requireBridgeOrPreview<ZatcaState>('saveZatcaState', () => {
    previewStore.zatca = { ...previewStore.zatca, ...state };
    persistPreviewStore();
    return previewStore.zatca;
  }, { state, actor: actor() }),

  generateZatcaCsr: () => requireBridgeOrPreview<ZatcaState>('generateCsr', () => {
    previewStore.zatca = { ...previewStore.zatca, onboardingStatus: 'csr_generated', csrPayload: btoa(JSON.stringify({ preview: true })) };
    persistPreviewStore();
    return previewStore.zatca;
  }, { actor: actor() }),

  markZatcaSandboxReady: (complianceCsid: string) => requireBridgeOrPreview<ZatcaState>('markZatcaSandboxReady', () => {
    previewStore.zatca = { ...previewStore.zatca, onboardingStatus: 'sandbox_ready', complianceCsid };
    persistPreviewStore();
    return previewStore.zatca;
  }, { complianceCsid, actor: actor() }),

  retryZatcaQueue: () => requireBridgeOrPreview<{ queued: number; transactions: Transaction[] }>('retryZatcaQueue', () => {
    const queue = previewStore.transactions.filter(tx => tx.zatcaStatus === 'pending' || tx.zatcaStatus === 'sandbox_pending' || tx.zatcaStatus === 'failed');
    // The only thing that can genuinely be retried offline is local signing of an
    // invoice that already has a real hash but no signature.
    const resignable = queue.filter(tx =>
      !!tx.invoiceHash && !tx.invoiceHash.startsWith(INSECURE_HASH_PREFIX) && !tx.cryptographicSignature
    );
    if (resignable.length) void resignQueuedInvoices(resignable);
    return { queued: queue.length, transactions: previewStore.transactions };
  }, { actor: actor() }),

  markZatcaReported: (id: string, status: Transaction['zatcaStatus'] = 'sandbox_reported') => requireBridgeOrPreview<Transaction[]>('markZatcaReported', () => {
    previewStore.transactions = previewStore.transactions.map(tx => tx.id === id ? { ...tx, zatcaStatus: status } : tx);
    persistPreviewStore();
    return previewStore.transactions;
  }, { id, status, actor: actor() }),

  getHardwareConfig: (): HardwareConfig => requireBridgeOrPreview<HardwareConfig>('getHardwareConfig', () => previewStore.hardware),

  saveHardwareConfig: (config: HardwareConfig) => requireBridgeOrPreview<HardwareConfig>('saveHardwareConfig', () => {
    previewStore.hardware = config;
    persistPreviewStore();
    return previewStore.hardware;
  }, { config, actor: actor() }),

  backupData: () => requireBridgeOrPreview<string>('backup', () => 'Backups are managed in Firebase. Local backups are disabled.'),

  restoreBackup: async () => {
    return false;
  },

  checkForUpdates: (): UpdateStatus => requireBridgeOrPreview<UpdateStatus>('checkForUpdates', () => ({
    checking: false,
    available: false,
    downloaded: false,
    error: 'Auto-update is not used in the web-only Firebase build.'
  })),

  installUpdate: () => requireBridgeOrPreview<boolean>('installUpdate', () => false),

  testCashDrawer: () => requireBridgeOrPreview<{ ok: boolean; message: string }>('testCashDrawer', () => ({
    ok: false,
    message: 'Cash drawer test requires the packaged desktop app and a supported receipt printer.'
  }), { actor: actor() }),

  resetAllData: () => {
    if (!StorageService.hasPermission('backup_restore')) {
      throw new Error('You do not have permission to reset data.');
    }
    return requireBridgeOrPreview<boolean>('resetAllData', () => {
      previewStore.products = [];
      previewStore.transactions = [];
      previewStore.customers = [];
      previewStore.expenses = [];
      previewStore.shifts = [];
      previewStore.heldCarts = [];
      previewStore.config = INITIAL_STORE_CONFIG;
      persistPreviewStore();
      return true;
    }, { actor: actor() });
  },

  // ── دفتر الدين — Credit Book ──────────────────────────────────────────────
  getCreditEntries: (): CreditEntry[] => {
    const bridged = bridge<CreditEntry[]>('getCreditEntries');
    if (bridged) return bridged;
    syncExistingCustomerCreditLinks();
    persistPreviewStore();
    return previewStore.creditEntries ?? [];
  },

  getCreditTransactions: (): CreditTransaction[] => {
    const bridged = bridge<CreditTransaction[]>('getCreditTransactions');
    return bridged ?? (previewStore.creditTransactions ?? []);
  },

  saveCreditEntry: (entry: CreditEntry): CreditEntry => {
    const bridged = bridge<CreditEntry>('saveCreditEntry', { entry, actor: actor() });
    if (bridged) return bridged;
    previewStore.creditEntries = previewStore.creditEntries ?? [];
    const customer = syncCustomerForCreditEntry(entry);
    const saved = { ...entry, customerId: customer.id, customerPhone: entry.customerPhone || customer.phone };
    const idx = previewStore.creditEntries.findIndex(e => e.id === saved.id);
    if (idx >= 0) previewStore.creditEntries[idx] = saved;
    else previewStore.creditEntries.unshift(saved);
    persistPreviewStore();
    return saved;
  },

  addCreditTransaction: (tx: Omit<CreditTransaction, 'id' | 'createdAt' | 'createdBy'>): { entry: CreditEntry; tx: CreditTransaction } => {
    const bridged = bridge<{ entry: CreditEntry; tx: CreditTransaction }>('addCreditTransaction', { tx, actor: actor() });
    if (bridged) return bridged;
    previewStore.creditEntries = previewStore.creditEntries ?? [];
    previewStore.creditTransactions = previewStore.creditTransactions ?? [];

    const saved: CreditTransaction = {
      ...tx,
      id: `CT-${Date.now()}`,
      createdAt: Date.now(),
      createdBy: actor(),
    };
    previewStore.creditTransactions.unshift(saved);

    const entryIdx = previewStore.creditEntries.findIndex(e => e.id === tx.creditEntryId);
    if (entryIdx >= 0) {
      const entry = previewStore.creditEntries[entryIdx];
      entry.totalDebt += tx.type === 'debt' ? tx.amount : -tx.amount;
      entry.lastActivityAt = Date.now();
      const customer = syncCustomerForCreditEntry(entry);
      entry.customerId = customer.id;
      persistPreviewStore();
      return { entry, tx: saved };
    }
    persistPreviewStore();
    return { entry: previewStore.creditEntries[0], tx: saved };
  },

  deleteCreditEntry: (id: string): void => {
    bridge('deleteCreditEntry', { id, actor: actor() });
    const entry = (previewStore.creditEntries ?? []).find(e => e.id === id);
    previewStore.creditEntries = (previewStore.creditEntries ?? []).filter(e => e.id !== id);
    previewStore.creditTransactions = (previewStore.creditTransactions ?? []).filter(t => t.creditEntryId !== id);
    if (entry?.customerId) {
      previewStore.customers = (previewStore.customers ?? []).map(customer =>
        customer.id === entry.customerId ? { ...customer, balance: 0, lastVisit: Date.now() } : customer
      );
    }
    persistPreviewStore();
  },

  /* ── Deals / Promotions ── */
  getDeals: (): Deal[] => {
    const bridged = bridge<Deal[]>('getDeals');
    return bridged ?? (previewStore.deals ?? []);
  },

  saveDeal: (deal: Deal): Deal[] => {
    bridge('saveDeal', { deal, actor: actor() });
    previewStore.deals = previewStore.deals ?? [];
    const idx = previewStore.deals.findIndex(d => d.id === deal.id);
    if (idx >= 0) previewStore.deals[idx] = deal;
    else previewStore.deals.unshift(deal);
    persistPreviewStore();
    return [...previewStore.deals];
  },

  deleteDeal: (id: string): Deal[] => {
    bridge('deleteDeal', { id, actor: actor() });
    previewStore.deals = (previewStore.deals ?? []).filter(d => d.id !== id);
    persistPreviewStore();
    return [...previewStore.deals];
  },

  getActiveDeals: (): Deal[] => {
    const all = StorageService.getDeals();
    const now = Date.now();
    return all.filter(d => d.active && (!d.expiresAt || d.expiresAt > now));
  },

  // ── Baqala OS domain collections ──────────────────────────────────────────
  getMenuCategories: (): MenuCategory[] => {
    const bridged = bridge<MenuCategory[]>('getMenuCategories');
    return bridged?.length ? bridged : previewStore.menuCategories;
  },

  saveMenuCategory: (category: MenuCategory): MenuCategory[] => requireBridgeOrPreview<MenuCategory[]>('saveMenuCategory', () => {
    const saved = { ...category, id: category.id || `MCAT-${Date.now()}` };
    previewStore.menuCategories = saveById(previewStore.menuCategories, saved);
    persistPreviewStore();
    mirrorToFirestore('menuCategories', saved);
    return previewStore.menuCategories;
  }, { category, actor: actor() }),

  getModifierGroups: (): ModifierGroup[] => {
    const bridged = bridge<ModifierGroup[]>('getModifierGroups');
    return bridged?.length ? bridged : previewStore.modifierGroups;
  },

  saveModifierGroup: (group: ModifierGroup): ModifierGroup[] => requireBridgeOrPreview<ModifierGroup[]>('saveModifierGroup', () => {
    const saved = { ...group, id: group.id || `MOD-${Date.now()}` };
    previewStore.modifierGroups = saveById(previewStore.modifierGroups, saved);
    persistPreviewStore();
    mirrorToFirestore('modifierGroups', saved);
    return previewStore.modifierGroups;
  }, { group, actor: actor() }),

  getMenuItems: (): MenuItem[] => {
    const bridged = bridge<MenuItem[]>('getMenuItems');
    return bridged?.length ? bridged : previewStore.menuItems;
  },

  saveMenuItem: (item: MenuItem): MenuItem[] => requireBridgeOrPreview<MenuItem[]>('saveMenuItem', () => {
    const saved: MenuItem = {
      ...item,
      id: item.id || `MENU-${Date.now()}`,
      vatPercentage: Number(item.vatPercentage || 15),
      active: item.active !== false,
      createdAt: item.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    previewStore.menuItems = saveById(previewStore.menuItems, saved);
    persistPreviewStore();
    mirrorToFirestore('menuItems', saved);
    return previewStore.menuItems;
  }, { item, actor: actor() }),

  getDiningAreas: (): DiningArea[] => {
    const bridged = bridge<DiningArea[]>('getDiningAreas');
    return bridged?.length ? bridged : previewStore.diningAreas;
  },

  getTables: (): DiningTable[] => {
    const bridged = bridge<DiningTable[]>('getTables');
    return bridged?.length ? bridged : previewStore.tables;
  },

  syncTablesFromFirestore: async (): Promise<DiningTable[] | null> => {
    if (!shouldUseFirebase()) return null;
    const remoteTables = await FirebaseService.list<DiningTable>('tables');
    if (!remoteTables.length) return null;
    previewStore.tables = remoteTables;
    persistPreviewStore();
    return previewStore.tables;
  },

  saveTable: (table: DiningTable): DiningTable[] => {
    const saved = { ...table, id: table.id || `TBL-${Date.now()}`, updatedAt: Date.now() };
    const bridged = bridge<DiningTable[]>('saveTable', { table: saved, actor: actor() });
    if (bridged) {
      mirrorToFirestore('tables', saved);
      return bridged;
    }
    previewStore.tables = saveById(previewStore.tables, saved);
    persistPreviewStore();
    mirrorToFirestore('tables', saved);
    return previewStore.tables;
  },

  deleteTable: (id: string): DiningTable[] => {
    const bridged = bridge<DiningTable[]>('deleteTable', { id, actor: actor() });
    if (bridged) {
      deleteFromFirestore('tables', id);
      return bridged;
    }
    previewStore.tables = previewStore.tables.filter(table => table.id !== id);
    persistPreviewStore();
    deleteFromFirestore('tables', id);
    return previewStore.tables;
  },

  getRestaurantOrders: (): RestaurantOrder[] => requireBridgeOrPreview<RestaurantOrder[]>('getRestaurantOrders', () => previewStore.restaurantOrders),

  saveRestaurantOrder: (order: RestaurantOrder): RestaurantOrder => {
    const saved: RestaurantOrder = {
      ...order,
      id: order.id || `ORD-${Date.now()}`,
      orderNumber: order.orderNumber || `OD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String((previewStore.restaurantOrders?.length || 0) + 1).padStart(4, '0')}`,
      createdAt: order.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    const bridged = bridge<RestaurantOrder>('saveRestaurantOrder', { order: saved, actor: actor() });
    if (bridged) {
      emitKitchenTicketsChanged();
      mirrorToFirestore('restaurantOrders', bridged);
      return bridged;
    }

    previewStore.restaurantOrders = saveById(previewStore.restaurantOrders, saved);
    if (saved.tableId) {
      previewStore.tables = previewStore.tables.map(table => {
        if (table.id !== saved.tableId) return table;
        const updatedTable: DiningTable = {
          ...table,
          state: saved.status === 'paid' ? 'dirty' : saved.status === 'awaiting_bill' ? 'awaiting_bill' : 'occupied',
          activeOrderId: saved.status === 'paid' ? undefined : saved.id,
          coverCount: saved.items.length || table.coverCount,
          updatedAt: Date.now(),
        };
        mirrorToFirestore('tables', updatedTable);
        return updatedTable;
      });
    }
    if (saved.status === 'fired' || saved.status === 'preparing' || saved.status === 'paid') {
      const generatedTickets = groupTicketsByStation(saved);
      const newTickets = generatedTickets.filter(ticket => !previewStore.kitchenTickets.some(existing => existing.id === ticket.id));
      generatedTickets.forEach(ticket => {
        const existing = previewStore.kitchenTickets.find(item => item.id === ticket.id);
        const status = existing && existing.status !== 'ready' && existing.status !== 'served' && existing.status !== 'voided'
          ? existing.status
          : ticket.status;
        previewStore.kitchenTickets = saveById(previewStore.kitchenTickets, {
          ...ticket,
          status,
          firedAt: existing?.firedAt || ticket.firedAt,
          dueAt: existing?.dueAt || ticket.dueAt,
        });
        mirrorToFirestore('kitchenTickets', previewStore.kitchenTickets.find(item => item.id === ticket.id) || ticket);
      });
      if (newTickets.length) StorageService.deductRecipeStock(saved);
      if (generatedTickets.length) emitKitchenTicketsChanged();
    }
    persistPreviewStore();
    mirrorToFirestore('restaurantOrders', saved);
    return saved;
  },

  getKitchenTickets: (): KitchenTicket[] => requireBridgeOrPreview<KitchenTicket[]>('getKitchenTickets', () => previewStore.kitchenTickets),

  saveKitchenTicket: (ticket: KitchenTicket): KitchenTicket[] => requireBridgeOrPreview<KitchenTicket[]>('saveKitchenTicket', () => {
    previewStore.kitchenTickets = saveById(previewStore.kitchenTickets, ticket);
    persistPreviewStore();
    emitKitchenTicketsChanged();
    mirrorToFirestore('kitchenTickets', ticket);
    return previewStore.kitchenTickets;
  }, { ticket, actor: actor() }),

  getIngredients: (): Ingredient[] => requireBridgeOrPreview<Ingredient[]>('getIngredients', () => previewStore.ingredients),

  saveIngredient: (ingredient: Ingredient): Ingredient[] => requireBridgeOrPreview<Ingredient[]>('saveIngredient', () => {
    const saved = { ...ingredient, id: ingredient.id || `ING-${Date.now()}`, createdAt: ingredient.createdAt || Date.now(), updatedAt: Date.now() };
    previewStore.ingredients = saveById(previewStore.ingredients, saved);
    persistPreviewStore();
    return previewStore.ingredients;
  }, { ingredient, actor: actor() }),

  getRecipes: (): Recipe[] => requireBridgeOrPreview<Recipe[]>('getRecipes', () => previewStore.recipes),

  saveRecipe: (recipe: Recipe): Recipe[] => requireBridgeOrPreview<Recipe[]>('saveRecipe', () => {
    const saved = { ...recipe, id: recipe.id || `RCP-${Date.now()}`, createdAt: recipe.createdAt || Date.now(), updatedAt: Date.now() };
    previewStore.recipes = saveById(previewStore.recipes, saved);
    persistPreviewStore();
    return previewStore.recipes;
  }, { recipe, actor: actor() }),

  deductRecipeStock: (order: RestaurantOrder): Ingredient[] => {
    const bridged = bridge<Ingredient[]>('deductRecipeStock', { order, actor: actor() });
    if (bridged) return bridged;
    const recipes = previewStore.recipes || [];
    previewStore.ingredients = (previewStore.ingredients || []).map(ingredient => {
      const consumed = order.items.reduce((sum, orderItem) => {
        const recipe = recipes.find(item => item.menuItemId === orderItem.menuItemId);
        const component = recipe?.components.find(item => item.ingredientId === ingredient.id && item.deduct);
        return sum + (component ? component.quantity * orderItem.quantity : 0);
      }, 0);
      return consumed > 0 ? { ...ingredient, currentStock: Math.max(0, ingredient.currentStock - consumed), updatedAt: Date.now() } : ingredient;
    });
    persistPreviewStore();
    return previewStore.ingredients;
  },

  getWastageEntries: (): WastageEntry[] => requireBridgeOrPreview<WastageEntry[]>('getWastageEntries', () => previewStore.wastageEntries),

  addWastageEntry: (entry: WastageEntry): { entries: WastageEntry[]; ingredients: Ingredient[] } => requireBridgeOrPreview<{ entries: WastageEntry[]; ingredients: Ingredient[] }>('addWastageEntry', () => {
    const saved = { ...entry, id: entry.id || `WST-${Date.now()}`, createdAt: entry.createdAt || Date.now(), createdBy: entry.createdBy || actor() };
    previewStore.wastageEntries.unshift(saved);
    previewStore.ingredients = previewStore.ingredients.map(ingredient => ingredient.id === saved.ingredientId
      ? { ...ingredient, currentStock: Math.max(0, ingredient.currentStock - saved.quantity), updatedAt: Date.now() }
      : ingredient);
    persistPreviewStore();
    return { entries: previewStore.wastageEntries, ingredients: previewStore.ingredients };
  }, { entry, actor: actor() }),

  getStaffMembers: (): StaffMember[] => requireBridgeOrPreview<StaffMember[]>('getStaffMembers', () => previewStore.staffMembers),

  saveStaffMember: (staff: StaffMember): StaffMember[] => requireBridgeOrPreview<StaffMember[]>('saveStaffMember', () => {
    const saved = { ...staff, id: staff.id || `STF-${Date.now()}`, createdAt: staff.createdAt || Date.now(), updatedAt: Date.now() };
    previewStore.staffMembers = saveById(previewStore.staffMembers, saved);
    persistPreviewStore();
    mirrorToFirestore('staffMembers', saved);
    return previewStore.staffMembers;
  }, { staff, actor: actor() }),

  getHealthCertificates: (): HealthCertificate[] => requireBridgeOrPreview<HealthCertificate[]>('getHealthCertificates', () => previewStore.healthCertificates),

  saveHealthCertificate: (certificate: HealthCertificate): HealthCertificate[] => requireBridgeOrPreview<HealthCertificate[]>('saveHealthCertificate', () => {
    previewStore.healthCertificates = saveById(previewStore.healthCertificates, certificate);
    persistPreviewStore();
    mirrorToFirestore('healthCertificates', certificate);
    return previewStore.healthCertificates;
  }, { certificate, actor: actor() }),

  getZatcaSubmissions: (): ZatcaSubmission[] => requireBridgeOrPreview<ZatcaSubmission[]>('getZatcaSubmissions', () => previewStore.zatcaSubmissions),

  saveZatcaSubmission: (submission: ZatcaSubmission): ZatcaSubmission[] => requireBridgeOrPreview<ZatcaSubmission[]>('saveZatcaSubmission', () => {
    previewStore.zatcaSubmissions = saveById(previewStore.zatcaSubmissions, { ...submission, updatedAt: Date.now() });
    persistPreviewStore();
    return previewStore.zatcaSubmissions;
  }, { submission, actor: actor() }),

  getSyncQueue: (): SyncQueueItem[] => requireBridgeOrPreview<SyncQueueItem[]>('getSyncQueue', () => previewStore.syncQueue),

  enqueueSyncItem: (item: SyncQueueItem): SyncQueueItem[] => requireBridgeOrPreview<SyncQueueItem[]>('enqueueSyncItem', () => {
    previewStore.syncQueue = saveById(previewStore.syncQueue, { ...item, id: item.id || `SYNC-${Date.now()}`, createdAt: item.createdAt || Date.now() });
    persistPreviewStore();
    return previewStore.syncQueue;
  }, { item, actor: actor() }),

  getRestaurantGroups: (): RestaurantGroup[] => requireBridgeOrPreview<RestaurantGroup[]>('getRestaurantGroups', () => previewStore.restaurantGroups),

  getBranches: (): RestaurantBranch[] => requireBridgeOrPreview<RestaurantBranch[]>('getBranches', () => previewStore.branches),

  saveBranch: (branch: RestaurantBranch): RestaurantBranch[] => requireBridgeOrPreview<RestaurantBranch[]>('saveBranch', () => {
    const saved = { ...branch, id: branch.id || `BR-${Date.now()}`, createdAt: branch.createdAt || Date.now(), updatedAt: Date.now() };
    previewStore.branches = saveById(previewStore.branches, saved);
    if (!previewStore.activeBranchId) previewStore.activeBranchId = saved.id;
    persistPreviewStore();
    mirrorToFirestore('branches', saved);
    return previewStore.branches;
  }, { branch, actor: actor() }),

  getActiveBranchId: (): string => requireBridgeOrPreview<string>('getActiveBranchId', () => previewStore.activeBranchId || previewStore.branches[0]?.id || ''),

  setActiveBranchId: (branchId: string): string => requireBridgeOrPreview<string>('setActiveBranchId', () => {
    previewStore.activeBranchId = branchId;
    persistPreviewStore();
    return previewStore.activeBranchId;
  }, { branchId, actor: actor() }),

  getBranchStaffAssignments: (): BranchStaffAssignment[] => requireBridgeOrPreview<BranchStaffAssignment[]>('getBranchStaffAssignments', () => previewStore.branchStaffAssignments),

  saveBranchStaffAssignment: (assignment: BranchStaffAssignment): BranchStaffAssignment[] => requireBridgeOrPreview<BranchStaffAssignment[]>('saveBranchStaffAssignment', () => {
    const saved = { ...assignment, id: assignment.id || `BSA-${Date.now()}`, createdAt: assignment.createdAt || Date.now(), updatedAt: Date.now() };
    previewStore.branchStaffAssignments = saveById(previewStore.branchStaffAssignments, saved);
    persistPreviewStore();
    mirrorToFirestore('branchStaffAssignments', saved);
    return previewStore.branchStaffAssignments;
  }, { assignment, actor: actor() }),

  getCloudStorageConfig: (): CloudStorageConfig => requireBridgeOrPreview<CloudStorageConfig>('getCloudStorageConfig', () => previewStore.cloudStorageConfig),

  saveCloudStorageConfig: (config: CloudStorageConfig): CloudStorageConfig => requireBridgeOrPreview<CloudStorageConfig>('saveCloudStorageConfig', () => {
    previewStore.cloudStorageConfig = { ...DEFAULT_CLOUD_CONFIG, ...config };
    persistPreviewStore();
    return previewStore.cloudStorageConfig;
  }, { config, actor: actor() }),

  getCloudSyncStatus: (): CloudSyncStatus => requireBridgeOrPreview<CloudSyncStatus>('getCloudSyncStatus', () => ({
    ...previewStore.cloudSyncStatus,
    queued: previewStore.syncQueue.filter(item => item.status === 'queued').length,
    synced: previewStore.syncQueue.filter(item => item.status === 'synced').length,
    failed: previewStore.syncQueue.filter(item => item.status === 'failed').length,
  })),

  getGuestTabs: (): GuestTab[] => requireBridgeOrPreview<GuestTab[]>('getGuestTabs', () => previewStore.guestTabs),

  saveGuestTab: (tab: GuestTab): GuestTab[] => requireBridgeOrPreview<GuestTab[]>('saveGuestTab', () => {
    const saved = { ...tab, id: tab.id || `TAB-${Date.now()}`, createdAt: tab.createdAt || Date.now(), updatedAt: Date.now() };
    previewStore.guestTabs = saveById(previewStore.guestTabs, saved);
    persistPreviewStore();
    return previewStore.guestTabs;
  }, { tab, actor: actor() }),

  getReservations: (): Reservation[] => requireBridgeOrPreview<Reservation[]>('getReservations', () => previewStore.reservations),
  saveReservation: (reservation: Reservation): Reservation[] => requireBridgeOrPreview<Reservation[]>('saveReservation', () => {
    previewStore.reservations = saveById(previewStore.reservations, { ...reservation, id: reservation.id || `RSV-${Date.now()}` });
    persistPreviewStore();
    return previewStore.reservations;
  }, { reservation, actor: actor() }),

  getLoyaltyProfiles: (): LoyaltyProfile[] => requireBridgeOrPreview<LoyaltyProfile[]>('getLoyaltyProfiles', () => previewStore.loyaltyProfiles),
  saveLoyaltyProfile: (profile: LoyaltyProfile): LoyaltyProfile[] => requireBridgeOrPreview<LoyaltyProfile[]>('saveLoyaltyProfile', () => {
    previewStore.loyaltyProfiles = saveById(previewStore.loyaltyProfiles, { ...profile, id: profile.id || `LOY-${Date.now()}` });
    persistPreviewStore();
    return previewStore.loyaltyProfiles;
  }, { profile, actor: actor() }),

  getDeliveryChannels: (): DeliveryChannel[] => requireBridgeOrPreview<DeliveryChannel[]>('getDeliveryChannels', () => previewStore.deliveryChannels),
  saveDeliveryChannel: (channel: DeliveryChannel): DeliveryChannel[] => requireBridgeOrPreview<DeliveryChannel[]>('saveDeliveryChannel', () => {
    const saved = { ...channel, id: channel.id || `DCH-${Date.now()}` };
    previewStore.deliveryChannels = saveById(previewStore.deliveryChannels, saved);
    persistPreviewStore();
    mirrorToFirestore('deliveryChannels', saved);
    return previewStore.deliveryChannels;
  }, { channel, actor: actor() }),

  getExternalDeliveryOrders: (): ExternalDeliveryOrder[] => requireBridgeOrPreview<ExternalDeliveryOrder[]>('getExternalDeliveryOrders', () => previewStore.externalDeliveryOrders || []),

  saveExternalDeliveryOrder: (order: ExternalDeliveryOrder): ExternalDeliveryOrder[] => requireBridgeOrPreview<ExternalDeliveryOrder[]>('saveExternalDeliveryOrder', () => {
    const existing = (previewStore.externalDeliveryOrders || []).find(item =>
      item.provider === order.provider && item.branchId === order.branchId && item.externalOrderId === order.externalOrderId
    );
    const saved = {
      ...existing,
      ...order,
      id: existing?.id || order.id || `EXT-${Date.now()}`,
      createdAt: existing?.createdAt || order.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    previewStore.externalDeliveryOrders = saveById(previewStore.externalDeliveryOrders || [], saved);
    persistPreviewStore();
    mirrorToFirestore('externalDeliveryOrders', saved);
    return previewStore.externalDeliveryOrders;
  }, { order, actor: actor() }),

  getDeliveryProviderEvents: (): DeliveryProviderEvent[] => requireBridgeOrPreview<DeliveryProviderEvent[]>('getDeliveryProviderEvents', () => previewStore.deliveryProviderEvents || []),

  saveDeliveryProviderEvent: (event: DeliveryProviderEvent): DeliveryProviderEvent[] => requireBridgeOrPreview<DeliveryProviderEvent[]>('saveDeliveryProviderEvent', () => {
    const saved = { ...event, id: event.id || `DPE-${Date.now()}`, createdAt: event.createdAt || Date.now() };
    previewStore.deliveryProviderEvents = saveById(previewStore.deliveryProviderEvents || [], saved);
    persistPreviewStore();
    mirrorToFirestore('deliveryProviderEvents', saved);
    return previewStore.deliveryProviderEvents;
  }, { event, actor: actor() }),

  importExternalDeliveryOrder: (externalOrder: ExternalDeliveryOrder): RestaurantOrder => {
    const bridged = bridge<RestaurantOrder>('importExternalDeliveryOrder', { externalOrder, actor: actor() });
    if (bridged) return bridged;

    const existingExternal = (previewStore.externalDeliveryOrders || []).find(item =>
      item.provider === externalOrder.provider && item.branchId === externalOrder.branchId && item.externalOrderId === externalOrder.externalOrderId
    );
    if (existingExternal?.importedRestaurantOrderId) {
      const existingOrder = (previewStore.restaurantOrders || []).find(order => order.id === existingExternal.importedRestaurantOrderId);
      if (existingOrder) return existingOrder;
    }

    const menuItems = previewStore.menuItems || [];
    const items = externalOrder.items.map(item => {
      const mapped = menuItems.find(menuItem =>
        menuItem.hungerStationExternalId && menuItem.hungerStationExternalId === item.externalMenuItemId
      ) || menuItems.find(menuItem => menuItem.id === item.externalMenuItemId);
      return {
        id: `HSI-${externalOrder.externalOrderId}-${item.id}`,
        menuItemId: mapped?.id || item.externalMenuItemId || `hs-unmapped-${item.id}`,
        nameEn: mapped?.nameEn || item.nameEn,
        nameAr: mapped?.nameAr || item.nameAr || item.nameEn,
        quantity: Number(item.quantity || 1),
        unitPrice: Number(mapped?.basePrice ?? item.unitPrice ?? 0),
        modifiers: item.modifiers || [],
        station: mapped?.station || 'packing',
        note: item.note || (!mapped ? `Unmapped HungerStation item ${item.externalMenuItemId || item.id}` : undefined),
        status: 'fired' as const,
        firedAt: Date.now(),
      };
    });
    const restaurantOrder: RestaurantOrder = {
      id: `ORD-HS-${externalOrder.externalOrderId}`,
      branchId: externalOrder.branchId,
      externalProvider: 'hungerstation',
      externalOrderId: externalOrder.externalOrderId,
      orderNumber: '',
      orderType: 'delivery',
      channel: 'hungerstation',
      status: 'fired',
      items,
      subtotal: Number(externalOrder.subtotal || 0),
      discount: Number(externalOrder.discount || 0),
      vat: Number(externalOrder.vat || 0),
      total: Number(externalOrder.total || 0),
      createdAt: externalOrder.createdAt || Date.now(),
      updatedAt: Date.now(),
      note: [
        `HungerStation #${externalOrder.externalOrderId}`,
        externalOrder.customerName ? `Customer: ${externalOrder.customerName}` : '',
        externalOrder.customerPhone ? `Mobile: ${externalOrder.customerPhone}` : '',
        externalOrder.deliveryAddress ? `Address: ${externalOrder.deliveryAddress}` : '',
        externalOrder.note || '',
      ].filter(Boolean).join(' / '),
    };
    const savedOrder = StorageService.saveRestaurantOrder(restaurantOrder);
    const savedExternal = {
      ...externalOrder,
      id: existingExternal?.id || externalOrder.id || `EXT-${Date.now()}`,
      status: 'imported' as const,
      importedRestaurantOrderId: savedOrder.id,
      updatedAt: Date.now(),
    };
    previewStore.externalDeliveryOrders = saveById(previewStore.externalDeliveryOrders || [], savedExternal);
    previewStore.deliveryProviderEvents = saveById(previewStore.deliveryProviderEvents || [], {
      id: `DPE-HS-IMPORT-${externalOrder.externalOrderId}`,
      provider: 'hungerstation',
      branchId: externalOrder.branchId,
      type: 'order_import',
      status: 'success',
      message: `Imported HungerStation order ${externalOrder.externalOrderId}.`,
      externalOrderId: externalOrder.externalOrderId,
      createdAt: Date.now(),
    });
    persistPreviewStore();
    return savedOrder;
  },

  getPromotions: (): Promotion[] => requireBridgeOrPreview<Promotion[]>('getPromotions', () => previewStore.promotions),
  savePromotion: (promotion: Promotion): Promotion[] => requireBridgeOrPreview<Promotion[]>('savePromotion', () => {
    const saved = { ...promotion, id: promotion.id || `PRM-${Date.now()}` };
    previewStore.promotions = saveById(previewStore.promotions, saved);
    persistPreviewStore();
    mirrorToFirestore('promotions', saved);
    return previewStore.promotions;
  }, { promotion, actor: actor() }),

  getServiceChargeConfigs: (): ServiceChargeConfig[] => requireBridgeOrPreview<ServiceChargeConfig[]>('getServiceChargeConfigs', () => previewStore.serviceChargeConfigs),
  saveServiceChargeConfig: (config: ServiceChargeConfig): ServiceChargeConfig[] => requireBridgeOrPreview<ServiceChargeConfig[]>('saveServiceChargeConfig', () => {
    const saved = { ...config, id: config.id || `SVC-${Date.now()}`, branchId: config.branchId || StorageService.getActiveBranchId() };
    previewStore.serviceChargeConfigs = saveById(previewStore.serviceChargeConfigs, saved);
    persistPreviewStore();
    mirrorToFirestore('serviceChargeConfigs', saved);
    return previewStore.serviceChargeConfigs;
  }, { config, actor: actor() }),
};
