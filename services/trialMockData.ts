import {
  BranchStaffAssignment,
  Category,
  CloudStorageConfig,
  CloudSyncStatus,
  CreditEntry,
  CreditTransaction,
  Customer,
  Deal,
  DeliveryChannel,
  DeliveryProviderEvent,
  DiningArea,
  DiningTable,
  Expense,
  ExternalDeliveryOrder,
  GuestTab,
  HardwareConfig,
  HealthCertificate,
  HeldCart,
  Ingredient,
  KitchenTicket,
  LoyaltyProfile,
  MenuCategory,
  MenuItem,
  ModifierGroup,
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
  SyncQueueItem,
  Transaction,
  User,
  WastageEntry,
  ZatcaState,
  ZatcaSubmission,
} from '../types';
import { APP_LOGO_DATA_URL } from './appLogo';

export interface TrialMockStore {
  products: Product[];
  transactions: Transaction[];
  customers: Customer[];
  expenses: Expense[];
  shifts: Shift[];
  heldCarts: HeldCart[];
  users: Array<User & { passwordHash?: string; pinHash?: string }>;
  auditLogs: Array<{ id: string; timestamp: number; user: string; event: string; description: string; storageNode: string }>;
  config: StoreConfig;
  zatca: ZatcaState;
  hardware: HardwareConfig;
  suppliers: SupplierLike[];
  stockAdjustments: StockAdjustment[];
  purchaseInvoices: PurchaseInvoice[];
  creditEntries: CreditEntry[];
  creditTransactions: CreditTransaction[];
  deals: Deal[];
  menuCategories: MenuCategory[];
  modifierGroups: ModifierGroup[];
  menuItems: MenuItem[];
  diningAreas: DiningArea[];
  tables: DiningTable[];
  restaurantOrders: RestaurantOrder[];
  kitchenTickets: KitchenTicket[];
  ingredients: Ingredient[];
  recipes: Recipe[];
  wastageEntries: WastageEntry[];
  staffMembers: StaffMember[];
  healthCertificates: HealthCertificate[];
  syncQueue: SyncQueueItem[];
  zatcaSubmissions: ZatcaSubmission[];
  restaurantGroups: RestaurantGroup[];
  branches: RestaurantBranch[];
  activeBranchId: string;
  branchStaffAssignments: BranchStaffAssignment[];
  cloudStorageConfig: CloudStorageConfig;
  cloudSyncStatus: CloudSyncStatus;
  guestTabs: GuestTab[];
  reservations: Reservation[];
  loyaltyProfiles: LoyaltyProfile[];
  deliveryChannels: DeliveryChannel[];
  externalDeliveryOrders: ExternalDeliveryOrder[];
  deliveryProviderEvents: DeliveryProviderEvent[];
  promotions: Promotion[];
  serviceChargeConfigs: ServiceChargeConfig[];
}

type SupplierLike = {
  id: string;
  name: string;
  vatNumber?: string;
  phone?: string;
  address?: string;
  contactName?: string;
  createdAt: number;
};

const day = 86400000;

const TRIAL_IMAGES = {
  milk: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=900&q=80',
  bread: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80',
  water: 'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=900&q=80',
  chips: 'https://images.unsplash.com/photo-1621447504864-d8686e12698c?auto=format&fit=crop&w=900&q=80',
  banana: 'https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=900&q=80',
  soap: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=900&q=80',
  energy: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=900&q=80',
  arabicCoffee: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=900&q=80',
  dates: 'https://images.unsplash.com/photo-1559181567-c3190ca9959b?auto=format&fit=crop&w=900&q=80',
  rice: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=900&q=80',
  eggs: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=900&q=80',
} as const;

function image(key: keyof typeof TRIAL_IMAGES) {
  return TRIAL_IMAGES[key];
}

export function createTrialMockStore(): TrialMockStore {
  const now = Date.now();
  const branchId = 'branch-riyadh-olaya';

  const users: TrialMockStore['users'] = [
    { id: 'trial-admin', name: 'Trial Administrator', username: 'admin', role: 'administrator', active: true, createdAt: now - 10 * day, passwordHash: '', pinHash: '0000', primaryBranchId: branchId, branchIds: [branchId, 'branch-jeddah-corniche'] },
    { id: 'trial-cashier', name: 'Sara Alharbi', username: 'sara', role: 'cashier', active: true, createdAt: now - 8 * day, passwordHash: 'demo', pinHash: '1234', primaryBranchId: branchId, branchIds: [branchId] },
  ];

  const products: Product[] = [
    { id: 'prd-001', nameEn: 'Almarai Fresh Milk 1L', nameAr: 'حليب المراعي ١ لتر', barcode: '6281007001011', price: 7.5, costPrice: 5.2, category: Category.DAIRY, stock: 42, unit: 'bottle', expiryDate: '2026-07-04', selectiveTax: 'none', supplierId: 'sup-fresh', image: image('milk') },
    { id: 'prd-002', nameEn: 'Tamees Bread Pack', nameAr: 'خبز تميس', barcode: '6281007001028', price: 3, costPrice: 1.4, category: Category.BAKERY, stock: 68, unit: 'pack', expiryDate: '2026-06-18', selectiveTax: 'none', supplierId: 'sup-bakery', image: image('bread') },
    { id: 'prd-003', nameEn: 'Aquafina Water 600ml', nameAr: 'مياه أكوافينا ٦٠٠مل', barcode: '6281007001035', price: 1.5, costPrice: 0.65, category: Category.BEVERAGES, stock: 180, unit: 'bottle', expiryDate: '2027-01-30', selectiveTax: 'none', supplierId: 'sup-fresh', image: image('water') },
    { id: 'prd-004', nameEn: 'Lays Chili Chips', nameAr: 'ليز فلفل حار', barcode: '6281007001042', price: 4.5, costPrice: 2.6, category: Category.SNACKS, stock: 54, unit: 'bag', expiryDate: '2026-10-12', selectiveTax: 'none', supplierId: 'sup-snacks', image: image('chips') },
    { id: 'prd-005', nameEn: 'Banana 1kg', nameAr: 'موز ١ كجم', barcode: '6281007001059', price: 8.75, costPrice: 5.8, category: Category.PRODUCE, stock: 26, unit: 'kg', expiryDate: '2026-06-21', selectiveTax: 'none', supplierId: 'sup-fresh', image: image('banana') },
    { id: 'prd-006', nameEn: 'Dish Soap Lemon 750ml', nameAr: 'صابون صحون ليمون', barcode: '6281007001066', price: 11.5, costPrice: 7.25, category: Category.HOUSEHOLD, stock: 33, unit: 'bottle', selectiveTax: 'none', supplierId: 'sup-household', image: image('soap') },
    { id: 'prd-007', nameEn: 'Energy Drink 250ml', nameAr: 'مشروب طاقة ٢٥٠مل', barcode: '6281007001073', price: 9, costPrice: 4.9, category: Category.BEVERAGES, stock: 22, unit: 'can', expiryDate: '2026-12-01', selectiveTax: 'energy', supplierId: 'sup-snacks', image: image('energy') },
    { id: 'prd-008', nameEn: 'Arabic Coffee 250g', nameAr: 'قهوة عربية ٢٥٠جم', barcode: '6281007001080', price: 24, costPrice: 15.5, category: Category.MISC, stock: 18, unit: 'bag', expiryDate: '2027-02-16', selectiveTax: 'none', supplierId: 'sup-snacks', image: image('arabicCoffee') },
    { id: 'prd-009', nameEn: 'Sukkari Dates 1kg', nameAr: 'تمر سكري ١ كجم', barcode: '6281007001097', price: 32, costPrice: 21, category: Category.PRODUCE, stock: 24, unit: 'kg', expiryDate: '2027-03-01', selectiveTax: 'none', supplierId: 'sup-fresh', image: image('dates') },
    { id: 'prd-010', nameEn: 'Abu Bint Rice 5kg', nameAr: 'أرز أبو بنت ٥ كجم', barcode: '6281007001103', price: 38, costPrice: 26, category: Category.HOUSEHOLD, stock: 16, unit: 'bag', expiryDate: '2027-06-01', selectiveTax: 'none', supplierId: 'sup-household', image: image('rice') },
    { id: 'prd-011', nameEn: 'Fresh Eggs 30', nameAr: 'بيض طازج ٣٠ حبة', barcode: '6281007001110', price: 18.5, costPrice: 13, category: Category.DAIRY, stock: 40, unit: 'tray', expiryDate: '2026-07-12', selectiveTax: 'none', supplierId: 'sup-fresh', image: image('eggs') },
  ];

  const menuCategories: MenuCategory[] = [];
  const modifierGroups: ModifierGroup[] = [];
  const menuItems: MenuItem[] = [];
  const diningAreas: DiningArea[] = [];
  const tables: DiningTable[] = [];
  const restaurantOrders: RestaurantOrder[] = [];

  const transactions: Transaction[] = [
    { id: 'tx-9004', branchId, timestamp: now - 35 * 60000, items: [{ ...products[0], quantity: 2 }, { ...products[3], quantity: 3 }], subtotal: 28.5, discount: 0, vat: 4.28, total: 32.78, paymentMethod: 'card', paymentApprovalReference: 'APPR-44512', customerId: 'cus-001', shiftId: 'shift-open', cashierId: 'trial-cashier', cashierName: 'Sara Alharbi', status: 'completed', earnedPoints: 33, zatcaStatus: 'sandbox_reported' },
    { id: 'tx-9003', branchId, timestamp: now - 3 * 3600000, items: [{ ...products[2], quantity: 6 }, { ...products[7], quantity: 1 }], subtotal: 33, discount: 2, vat: 4.65, total: 35.65, paymentMethod: 'cash', shiftId: 'shift-open', cashierId: 'trial-cashier', cashierName: 'Sara Alharbi', status: 'completed', zatcaStatus: 'sandbox_pending' },
    { id: 'tx-9002', branchId, timestamp: now - day, items: [{ ...products[4], quantity: 2 }, { ...products[5], quantity: 1 }], subtotal: 29, discount: 0, vat: 4.35, total: 33.35, paymentMethod: 'credit', customerId: 'cus-002', cashierId: 'trial-admin', cashierName: 'Trial Administrator', status: 'completed', earnedPoints: 29, zatcaStatus: 'sandbox_reported' },
    { id: 'tx-9001', branchId, timestamp: now - 2 * day, items: [{ ...products[1], quantity: 8 }, { ...products[2], quantity: 12 }], subtotal: 42, discount: 4, vat: 5.7, total: 43.7, paymentMethod: 'card', paymentApprovalReference: 'APPR-44001', cashierId: 'trial-cashier', cashierName: 'Sara Alharbi', status: 'completed', zatcaStatus: 'reported' },
  ];

  const customers: Customer[] = [
    { id: 'cus-001', name: 'Fahad Alotaibi', phone: '966501112233', balance: 0, points: 185, lastVisit: now - 35 * 60000 },
    { id: 'cus-002', name: 'Noura Alshehri', phone: '966555551234', balance: 33.35, points: 92, lastVisit: now - day },
    { id: 'cus-003', name: 'Yousef Khan', phone: '966543219876', balance: 0, points: 410, lastVisit: now - 4 * day },
  ];

  const staffMembers: StaffMember[] = [
    { id: 'staff-admin', branchIds: [branchId], nameEn: 'Trial Administrator', nameAr: 'مدير التجربة', role: 'manager', quickPin: '0000', phone: '966500000001', nationalIdOrIqama: '1000000001', active: true, qiwaOccupation: 'Store Manager', gosiRegistered: true, createdAt: now - 60 * day, updatedAt: now - day },
    { id: 'staff-sara', branchIds: [branchId], nameEn: 'Sara Alharbi', nameAr: 'سارة الحربي', role: 'cashier', quickPin: '1234', phone: '966500000002', nationalIdOrIqama: '1000000002', active: true, qiwaOccupation: 'Cashier', gosiRegistered: true, createdAt: now - 50 * day, updatedAt: now - day },
    { id: 'staff-omar', branchIds: [branchId], nameEn: 'Omar Nasser', nameAr: 'عمر ناصر', role: 'cashier', phone: '966500000003', nationalIdOrIqama: '1000000003', active: true, qiwaOccupation: 'Stock Keeper', gosiRegistered: true, createdAt: now - 45 * day, updatedAt: now - day },
    { id: 'staff-lina', branchIds: [branchId], nameEn: 'Lina Ahmed', nameAr: 'لينا أحمد', role: 'cashier', phone: '966500000004', active: true, qiwaOccupation: 'Cashier', gosiRegistered: true, createdAt: now - 20 * day, updatedAt: now - day },
  ];

  const healthCertificates: HealthCertificate[] = [
    { id: 'hc-sara', staffMemberId: 'staff-sara', cardNumber: 'HC-2026-1101', issuedAt: '2026-01-10', expiresAt: '2027-01-10', status: 'valid' },
    { id: 'hc-omar', staffMemberId: 'staff-omar', cardNumber: 'HC-2025-8844', issuedAt: '2025-07-01', expiresAt: '2026-07-01', status: 'expiring_soon' },
    { id: 'hc-lina', staffMemberId: 'staff-lina', cardNumber: 'HC-2026-4472', issuedAt: '2026-03-14', expiresAt: '2027-03-14', status: 'valid' },
  ];

  const ingredients: Ingredient[] = [];
  const recipes: Recipe[] = [];

  const suppliers: SupplierLike[] = [
    { id: 'sup-fresh', name: 'Riyadh Fresh Foods Co.', vatNumber: '300000000000003', phone: '0115550101', address: 'Olaya, Riyadh', contactName: 'Abu Khalid', createdAt: now - 80 * day },
    { id: 'sup-bakery', name: 'Najd Bakery Supplies', vatNumber: '300000000000004', phone: '0115550102', address: 'Sulay, Riyadh', contactName: 'Mansour', createdAt: now - 76 * day },
    { id: 'sup-snacks', name: 'Gulf Snacks Trading', vatNumber: '300000000000005', phone: '0115550103', address: 'Al Malaz, Riyadh', contactName: 'Hassan', createdAt: now - 72 * day },
    { id: 'sup-household', name: 'Clean Shelf Wholesale', vatNumber: '300000000000006', phone: '0115550104', address: 'Exit 17, Riyadh', contactName: 'Nabil', createdAt: now - 70 * day },
  ];

  const purchaseInvoices: PurchaseInvoice[] = [
    { id: 'pinv-1001', supplierId: 'sup-fresh', supplierName: 'Riyadh Fresh Foods Co.', supplierVatNumber: '300000000000003', invoiceNumber: 'RF-2026-611', date: now - 2 * day, subtotal: 820, vat: 123, total: 943, paidAt: now - 2 * day, lines: [{ productId: 'prd-001', productName: 'Almarai Fresh Milk 1L', quantity: 8, caseSize: 12, totalUnits: 96, unitCost: 62.4, unitCostPerItem: 5.2, isCostInclusive: true, total: 499.2 }, { productId: 'prd-005', productName: 'Banana 1kg', quantity: 40, caseSize: 1, totalUnits: 40, unitCost: 5.8, unitCostPerItem: 5.8, total: 232 }] },
    { id: 'pinv-1002', supplierId: 'sup-snacks', supplierName: 'Gulf Snacks Trading', supplierVatNumber: '300000000000005', invoiceNumber: 'GS-2026-204', date: now - 5 * day, subtotal: 540, vat: 81, total: 621, lines: [{ productId: 'prd-004', productName: 'Lays Chili Chips', quantity: 12, caseSize: 24, totalUnits: 288, unitCost: 62.4, unitCostPerItem: 2.6, isCostInclusive: true, total: 748.8 }] },
  ];

  const kitchenTickets: KitchenTicket[] = [];
  const guestTabs: GuestTab[] = [];

  const branchStaffAssignments: BranchStaffAssignment[] = [
    { id: 'bsa-admin', branchId, staffMemberId: 'staff-admin', userId: 'trial-admin', role: 'administrator', permissions: ['branch_pos', 'branch_kds', 'branch_inventory', 'branch_purchases', 'branch_staff', 'branch_reports', 'branch_settings', 'branch_refunds', 'branch_voids', 'branch_discounts', 'branch_tabs'], active: true, createdAt: now - 30 * day, updatedAt: now - day },
    { id: 'bsa-sara', branchId, staffMemberId: 'staff-sara', userId: 'trial-cashier', role: 'cashier', permissions: ['branch_pos', 'branch_tabs'], active: true, createdAt: now - 30 * day, updatedAt: now - day },
  ];

  const deliveryChannels: DeliveryChannel[] = [];
  const externalDeliveryOrders: ExternalDeliveryOrder[] = [];

  const restaurantGroups: RestaurantGroup[] = [{ id: 'group-baqala-trial', nameEn: 'Baqala Trial Group', nameAr: 'مجموعة بقالة التجريبية', ownerName: 'Baqala Demo', supportPhone: '920000000', cloudTenantId: 'trial-offline', createdAt: now - 90 * day, updatedAt: now - day }];
  const branches: RestaurantBranch[] = [
    { id: branchId, groupId: 'group-baqala-trial', nameEn: 'Riyadh Olaya Branch', nameAr: 'فرع الرياض العليا', crNumber: '1010123456', vatNumber: '300000000000003', phone: '0115550100', address: 'Olaya Street, Riyadh', city: 'Riyadh', managerStaffId: 'staff-admin', serviceTypes: [], operatingHours: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((dayName, index) => ({ day: dayName as RestaurantBranch['operatingHours'][number]['day'], open: index === 5 ? '13:00' : '08:00', close: index >= 4 ? '00:00' : '23:00' })), cloudStatus: { status: 'offline', lastSyncAt: now - 6 * 3600000, lastBackupAt: now - day }, active: true, createdAt: now - 80 * day, updatedAt: now - day },
    { id: 'branch-jeddah-corniche', groupId: 'group-baqala-trial', nameEn: 'Jeddah Corniche Branch', nameAr: 'فرع جدة الكورنيش', crNumber: '4030123456', vatNumber: '300000000000003', phone: '0125550100', address: 'Corniche Road, Jeddah', city: 'Jeddah', serviceTypes: [], operatingHours: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map(dayName => ({ day: dayName as RestaurantBranch['operatingHours'][number]['day'], open: '08:00', close: '23:00' })), cloudStatus: { status: 'offline' }, active: true, createdAt: now - 70 * day, updatedAt: now - day },
  ];

  return {
    products,
    transactions,
    customers,
    expenses: [
      { id: 'exp-001', description: 'Electricity bill', amount: 280, category: 'utilities', date: now - 2 * day },
      { id: 'exp-002', description: 'Cleaning supplies', amount: 145, category: 'maintenance', date: now - day },
      { id: 'exp-003', description: 'Part-time cashier support', amount: 350, category: 'salary', date: now - 6 * day },
    ],
    shifts: [
      { id: 'shift-open',   branchId: 'default', openedBy: 'Sara Alharbi',        openedAt: now - 5 * 3600000, openingCash: 700,  totalSales: 68.43,  status: 'open' },
      { id: 'shift-closed', branchId: 'default', openedBy: 'Trial Administrator',  openedAt: now - day - 8 * 3600000, closedAt: now - day, openingCash: 500, closingCash: 2350, expectedCash: 2320, cashVariance: 30, totalSales: 1820, totalCashSales: 1820, totalCardSales: 0, totalRefunds: 0, totalVat: 237.39, invoiceCount: 22, status: 'closed' },
    ],
    heldCarts: [{ id: 'held-001', timestamp: now - 16 * 60000, items: [{ ...products[7], quantity: 1 }, { ...products[3], quantity: 2 }], customerName: 'Walk-in customer' }],
    users,
    auditLogs: [
      { id: 'audit-001', timestamp: now - 10 * 60000, user: 'Trial Mode', event: 'trial_seeded', description: 'Loaded offline trial mock data.', storageNode: 'Offline trial mock' },
      { id: 'audit-002', timestamp: now - 40 * 60000, user: 'Sara Alharbi', event: 'sale_completed', description: 'Completed POS sale tx-9004.', storageNode: 'Offline trial mock' },
    ],
    config: { nameEn: 'Olaya Trial Baqala', nameAr: 'بقالة العليا التجريبية', vatNumber: '300000000000003', crNumber: '1010123456', vatRate: 0.15, phone: '0115550100', address: 'Olaya Street, Riyadh, Saudi Arabia', currency: 'SAR', loyaltyRate: 1, footerMessage: 'شكراً لتسوقكم معنا — Trial data only.', lowStockThreshold: 5, setupComplete: true, logoDataUrl: APP_LOGO_DATA_URL },
    zatca: { mode: 'sandbox', onboardingStatus: 'sandbox_ready', reportingEndpoint: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation', complianceCsid: 'TRIAL-COMPLIANCE-CSID', productionCsid: '', lastReportAt: now - 35 * 60000, autoRetryEnabled: true },
    hardware: { receiptPrinter: 'Trial Thermal Printer', receiptWidth: '80mm', autoPrintReceipt: false, cashDrawerEnabled: true, cashDrawerPulseCommand: '27,112,0,25,250', barcodeScannerMode: 'keyboard', barcodeMinLength: 4, requireCardApprovalReference: false, paymentGatewayEnabled: false, paymentGatewayUrl: '', paymentGatewayApiKey: '', paymentGatewayTerminalId: 'TRIAL-T1', paymentGatewayTimeoutSeconds: 30 },
    suppliers,
    stockAdjustments: [
      { id: 'adj-001', productId: 'prd-001', productName: 'Almarai Fresh Milk 1L', quantityDelta: 24, reason: 'purchase', note: 'Trial stock receipt', user: 'Trial Administrator', timestamp: now - 2 * day },
      { id: 'adj-002', productId: 'prd-004', productName: 'Lays Chili Chips', quantityDelta: -3, reason: 'damage', note: 'Crushed bags', user: 'Sara Alharbi', timestamp: now - day },
    ],
    purchaseInvoices,
    creditEntries: [{ id: 'ce-cus-002', customerId: 'cus-002', customerName: 'Noura Alshehri', customerPhone: '966555551234', totalDebt: 33.35, creditLimit: 500, createdAt: now - 20 * day, lastActivityAt: now - day }],
    creditTransactions: [{ id: 'ct-001', creditEntryId: 'ce-cus-002', type: 'debt', amount: 33.35, note: 'POS credit sale tx-9002', linkedSaleId: 'tx-9002', createdAt: now - day, createdBy: 'Trial Administrator' }],
    deals: [{ id: 'deal-001', nameAr: 'اشتر ٢ كيس ليز واحصل على خصم', nameEn: 'Buy 2 Lays Save 10%', type: 'percent_off', productId: 'prd-004', minQty: 2, percentOff: 10, active: true, expiresAt: now + 12 * day, createdAt: now - 5 * day }],
    menuCategories,
    modifierGroups,
    menuItems,
    diningAreas,
    tables,
    restaurantOrders,
    kitchenTickets,
    ingredients,
    recipes,
    wastageEntries: [],
    staffMembers,
    healthCertificates,
    syncQueue: [{ id: 'sync-001', branchId, entity: 'inventory', operation: 'update', payload: { productId: 'prd-001' }, status: 'queued', attempts: 0, nextAttemptAt: now + 3600000, createdAt: now - 20 * 60000, lastError: 'Trial mode is offline by design.' }],
    zatcaSubmissions: [{ id: 'zatca-001', invoiceId: 'tx-9003', invoiceType: 'simplified', status: 'pending', deadlineAt: now + 23 * 3600000, attempts: 0, createdAt: now - 3 * 3600000, updatedAt: now - 3 * 3600000 }],
    restaurantGroups,
    branches,
    activeBranchId: branchId,
    branchStaffAssignments,
    cloudStorageConfig: { enabled: false, mode: 'cloud_only', cloudflareTunnelUrl: '', lanApiUrl: 'http://localhost:8787', apiToken: '', deviceId: 'trial-browser-device', syncIntervalMinutes: 0, status: 'not_configured', lastError: 'Trial mode uses offline mock data.' },
    cloudSyncStatus: { online: false, sourceOfTruth: 'mac_mini_cloud', queued: 1, synced: 42, failed: 0, lastSyncAt: now - 6 * 3600000, serverVersion: 'trial-offline' },
    guestTabs,
    reservations: [],
    loyaltyProfiles: [
      { id: 'loy-001', branchId, customerId: 'cus-001', customerName: 'Fahad Alotaibi', phone: '966501112233', points: 185, tier: 'silver', lastVisitAt: now - 35 * 60000 },
      { id: 'loy-002', branchId, customerId: 'cus-003', customerName: 'Yousef Khan', phone: '966543219876', points: 410, tier: 'gold', lastVisitAt: now - 4 * day },
    ],
    deliveryChannels,
    externalDeliveryOrders,
    deliveryProviderEvents: [],
    promotions: [],
    serviceChargeConfigs: [],
  };
}
