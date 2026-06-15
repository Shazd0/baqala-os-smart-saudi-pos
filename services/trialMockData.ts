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
  shawarma: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=900&q=80',
  sajWrap: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80',
  mixedGrill: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=80',
  hummus: 'https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=900&q=80',
  lemonade: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=900&q=80',
  saudiCoffee: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=900&q=80',
} as const;

function image(key: keyof typeof TRIAL_IMAGES) {
  return TRIAL_IMAGES[key];
}

function orderItem(item: MenuItem, quantity: number, note?: string) {
  return {
    id: `oi-${item.id}-${quantity}-${String(note || '').slice(0, 6)}`,
    menuItemId: item.id,
    nameEn: item.nameEn,
    nameAr: item.nameAr,
    quantity,
    unitPrice: item.basePrice,
    modifiers: [],
    station: item.station,
    note,
    status: 'fired' as const,
    firedAt: Date.now() - 18 * 60000,
  };
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
  ];

  const menuCategories: MenuCategory[] = [
    { id: 'cat-shawarma', nameEn: 'Shawarma', nameAr: 'شاورما', sortOrder: 1, active: true },
    { id: 'cat-grill', nameEn: 'Grill', nameAr: 'المشاوي', sortOrder: 2, active: true },
    { id: 'cat-appetizers', nameEn: 'Appetizers', nameAr: 'المقبلات', sortOrder: 3, active: true },
    { id: 'cat-beverages', nameEn: 'Beverages', nameAr: 'المشروبات', sortOrder: 4, active: true },
  ];

  const modifierGroups: ModifierGroup[] = [
    { id: 'mod-spice', nameEn: 'Spice Level', nameAr: 'درجة الحار', minSelections: 0, maxSelections: 1, required: false, options: [{ id: 'spice-mild', nameEn: 'Mild', nameAr: 'خفيف', priceDelta: 0 }, { id: 'spice-hot', nameEn: 'Hot', nameAr: 'حار', priceDelta: 0 }] },
    { id: 'mod-sides', nameEn: 'Sides', nameAr: 'الإضافات', minSelections: 0, maxSelections: 2, required: false, options: [{ id: 'side-fries', nameEn: 'Fries', nameAr: 'بطاطس', priceDelta: 5, caloriesDelta: 260 }, { id: 'side-garlic', nameEn: 'Garlic Sauce', nameAr: 'ثوم', priceDelta: 2, caloriesDelta: 80 }] },
  ];

  const menuItems: MenuItem[] = [
    { id: 'menu-chicken-shawarma', branchIds: [branchId], hungerStationExternalId: 'HS-1001', hungerStationEnabled: true, nameEn: 'Chicken Shawarma', nameAr: 'شاورما دجاج', descriptionEn: 'Garlic, pickles, fries, and toasted saj.', descriptionAr: 'ثوم ومخلل وبطاطس في خبز صاج.', categoryId: 'cat-shawarma', basePrice: 16, vatPercentage: 15, active: true, station: 'grill', modifierGroupIds: ['mod-spice', 'mod-sides'], image: image('shawarma'), images: [image('shawarma'), image('sajWrap')], nutrition: { caloriesKcal: 520, fatGrams: 18, saturatedFatGrams: 4, sugarGrams: 3, sodiumMilligrams: 1200, allergens: ['Gluten', 'Dairy', 'Sesame'] }, costPrice: 6.3, createdAt: now - 30 * day, updatedAt: now - day },
    { id: 'menu-mixed-grill', branchIds: [branchId], hungerStationExternalId: 'HS-1002', hungerStationEnabled: true, nameEn: 'Mixed Grill Plate', nameAr: 'مشكل مشاوي', descriptionEn: 'Kebab, shish tawook, lamb kofta, rice, and salad.', descriptionAr: 'كباب وشيش طاووق وكفتة مع رز وسلطة.', categoryId: 'cat-grill', basePrice: 49, vatPercentage: 15, active: true, station: 'grill', modifierGroupIds: ['mod-spice'], image: image('mixedGrill'), images: [image('mixedGrill')], nutrition: { caloriesKcal: 980, fatGrams: 44, saturatedFatGrams: 13, sugarGrams: 6, sodiumMilligrams: 1680, allergens: ['Dairy'] }, costPrice: 22, createdAt: now - 25 * day, updatedAt: now - day },
    { id: 'menu-hummus', branchIds: [branchId], nameEn: 'Hummus with Olive Oil', nameAr: 'حمص بزيت الزيتون', descriptionEn: 'Creamy chickpeas, tahini, lemon, and olive oil.', descriptionAr: 'حمص وطحينة وليمون وزيت زيتون.', categoryId: 'cat-appetizers', basePrice: 14, vatPercentage: 15, active: true, station: 'appetizers', modifierGroupIds: [], image: image('hummus'), images: [image('hummus')], nutrition: { caloriesKcal: 310, fatGrams: 16, saturatedFatGrams: 2, sugarGrams: 2, sodiumMilligrams: 540, allergens: ['Sesame'] }, costPrice: 4.2, createdAt: now - 20 * day, updatedAt: now - day },
    { id: 'menu-mint-lemonade', branchIds: [branchId], hungerStationExternalId: 'HS-1003', hungerStationEnabled: true, nameEn: 'Mint Lemonade', nameAr: 'ليمون نعناع', descriptionEn: 'Fresh lemon, mint, ice, and light syrup.', descriptionAr: 'ليمون طازج ونعناع وثلج.', categoryId: 'cat-beverages', basePrice: 13, vatPercentage: 15, active: true, station: 'beverage', modifierGroupIds: [], image: image('lemonade'), images: [image('lemonade')], nutrition: { caloriesKcal: 140, fatGrams: 0, saturatedFatGrams: 0, sugarGrams: 28, sodiumMilligrams: 15, allergens: [] }, costPrice: 3.8, createdAt: now - 18 * day, updatedAt: now - day },
    { id: 'menu-saudi-coffee', branchIds: [branchId], nameEn: 'Saudi Coffee', nameAr: 'قهوة سعودية', descriptionEn: 'Cardamom Saudi coffee with dates.', descriptionAr: 'قهوة سعودية بالهيل مع تمر.', categoryId: 'cat-beverages', basePrice: 18, vatPercentage: 15, active: true, station: 'beverage', modifierGroupIds: [], image: image('saudiCoffee'), images: [image('saudiCoffee')], nutrition: { caloriesKcal: 90, fatGrams: 0, saturatedFatGrams: 0, sugarGrams: 18, sodiumMilligrams: 5, caffeineMilligrams: 75, caffeineServingMl: 180, allergens: [] }, costPrice: 5, createdAt: now - 18 * day, updatedAt: now - day },
  ];

  const diningAreas: DiningArea[] = [
    { id: 'area-main', nameEn: 'Main Dining', nameAr: 'الصالة الرئيسية', sortOrder: 1 },
    { id: 'area-family', nameEn: 'Family Section', nameAr: 'قسم العائلات', sortOrder: 2 },
    { id: 'area-patio', nameEn: 'Patio', nameAr: 'الجلسات الخارجية', sortOrder: 3 },
  ];

  const tables: DiningTable[] = Array.from({ length: 14 }, (_, index) => {
    const active = index === 1 ? 'ord-1002' : index === 4 ? 'ord-1001' : undefined;
    return {
      id: `table-${index + 1}`,
      branchId,
      areaId: index < 6 ? 'area-main' : index < 11 ? 'area-family' : 'area-patio',
      label: `T${index + 1}`,
      seats: index < 6 ? 4 : 6,
      state: active ? (index === 4 ? 'awaiting_bill' : 'occupied') : index === 8 ? 'dirty' : 'vacant',
      activeOrderId: active,
      coverCount: active ? (index === 4 ? 3 : 2) : undefined,
      updatedAt: now - index * 7 * 60000,
    };
  });

  const order1Items = [orderItem(menuItems[0], 2), orderItem(menuItems[3], 2)];
  const order2Items = [orderItem(menuItems[1], 1, 'Medium well'), orderItem(menuItems[2], 1), orderItem(menuItems[4], 1)];
  const restaurantOrders: RestaurantOrder[] = [
    { id: 'ord-1001', branchId, orderNumber: 'OD-1001', orderType: 'dine_in', status: 'awaiting_bill', tableId: 'table-5', tableLabel: 'T5', channel: 'pos', items: order1Items, subtotal: 58, discount: 0, vat: 8.7, total: 66.7, cashierId: 'trial-cashier', cashierName: 'Sara Alharbi', shiftId: 'shift-open', createdAt: now - 46 * 60000, updatedAt: now - 8 * 60000 },
    { id: 'ord-1002', branchId, orderNumber: 'OD-1002', orderType: 'dine_in', status: 'preparing', tableId: 'table-2', tableLabel: 'T2', channel: 'pos', items: order2Items, subtotal: 81, discount: 5, vat: 11.4, total: 87.4, cashierId: 'trial-cashier', cashierName: 'Sara Alharbi', shiftId: 'shift-open', createdAt: now - 28 * 60000, updatedAt: now - 3 * 60000 },
  ];

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
    { id: 'staff-admin', branchIds: [branchId], nameEn: 'Trial Administrator', nameAr: 'مدير التجربة', role: 'manager', quickPin: '0000', phone: '966500000001', nationalIdOrIqama: '1000000001', active: true, qiwaOccupation: 'Restaurant Manager', gosiRegistered: true, createdAt: now - 60 * day, updatedAt: now - day },
    { id: 'staff-sara', branchIds: [branchId], nameEn: 'Sara Alharbi', nameAr: 'سارة الحربي', role: 'cashier', quickPin: '1234', phone: '966500000002', nationalIdOrIqama: '1000000002', active: true, qiwaOccupation: 'Cashier', gosiRegistered: true, createdAt: now - 50 * day, updatedAt: now - day },
    { id: 'staff-omar', branchIds: [branchId], nameEn: 'Omar Nasser', nameAr: 'عمر ناصر', role: 'chef', phone: '966500000003', nationalIdOrIqama: '1000000003', active: true, qiwaOccupation: 'Chef', gosiRegistered: true, createdAt: now - 45 * day, updatedAt: now - day },
    { id: 'staff-lina', branchIds: [branchId], nameEn: 'Lina Ahmed', nameAr: 'لينا أحمد', role: 'waiter', phone: '966500000004', active: true, qiwaOccupation: 'Waiter', gosiRegistered: true, createdAt: now - 20 * day, updatedAt: now - day },
  ];

  const healthCertificates: HealthCertificate[] = [
    { id: 'hc-sara', staffMemberId: 'staff-sara', cardNumber: 'HC-2026-1101', issuedAt: '2026-01-10', expiresAt: '2027-01-10', status: 'valid' },
    { id: 'hc-omar', staffMemberId: 'staff-omar', cardNumber: 'HC-2025-8844', issuedAt: '2025-07-01', expiresAt: '2026-07-01', status: 'expiring_soon' },
    { id: 'hc-lina', staffMemberId: 'staff-lina', cardNumber: 'HC-2026-4472', issuedAt: '2026-03-14', expiresAt: '2027-03-14', status: 'valid' },
  ];

  const ingredients: Ingredient[] = [
    { id: 'ing-chicken', branchId, nameEn: 'Marinated Chicken', nameAr: 'دجاج متبل', currentStock: 28, unitOfMeasure: 'kg', lowStockThreshold: 8, movingAverageCost: 18, supplierId: 'sup-fresh', batchNumber: 'CH-0615', expiryDate: '2026-06-20', createdAt: now - 9 * day, updatedAt: now - 2 * 3600000 },
    { id: 'ing-beef', branchId, nameEn: 'Kebab Mix', nameAr: 'خلطة كباب', currentStock: 16, unitOfMeasure: 'kg', lowStockThreshold: 6, movingAverageCost: 32, supplierId: 'sup-fresh', batchNumber: 'KB-0615', expiryDate: '2026-06-19', createdAt: now - 9 * day, updatedAt: now - 2 * 3600000 },
    { id: 'ing-lemon', branchId, nameEn: 'Fresh Lemon', nameAr: 'ليمون طازج', currentStock: 12, unitOfMeasure: 'kg', lowStockThreshold: 4, movingAverageCost: 7, supplierId: 'sup-fresh', createdAt: now - 8 * day, updatedAt: now - 2 * 3600000 },
    { id: 'ing-hummus', branchId, nameEn: 'Cooked Chickpeas', nameAr: 'حمص مطبوخ', currentStock: 9, unitOfMeasure: 'kg', lowStockThreshold: 3, movingAverageCost: 5, supplierId: 'sup-fresh', createdAt: now - 8 * day, updatedAt: now - 2 * 3600000 },
  ];

  const recipes: Recipe[] = [
    { id: 'rcp-shawarma', branchId, menuItemId: 'menu-chicken-shawarma', menuItemName: 'Chicken Shawarma', components: [{ ingredientId: 'ing-chicken', ingredientName: 'Marinated Chicken', quantity: 0.18, unitOfMeasure: 'kg', deduct: true }], targetFoodCostPercentage: 32, createdAt: now - 12 * day, updatedAt: now - day },
    { id: 'rcp-mixed-grill', branchId, menuItemId: 'menu-mixed-grill', menuItemName: 'Mixed Grill Plate', components: [{ ingredientId: 'ing-beef', ingredientName: 'Kebab Mix', quantity: 0.35, unitOfMeasure: 'kg', deduct: true }, { ingredientId: 'ing-chicken', ingredientName: 'Marinated Chicken', quantity: 0.2, unitOfMeasure: 'kg', deduct: true }], targetFoodCostPercentage: 38, createdAt: now - 12 * day, updatedAt: now - day },
    { id: 'rcp-hummus', branchId, menuItemId: 'menu-hummus', menuItemName: 'Hummus with Olive Oil', components: [{ ingredientId: 'ing-hummus', ingredientName: 'Cooked Chickpeas', quantity: 0.22, unitOfMeasure: 'kg', deduct: true }], targetFoodCostPercentage: 30, createdAt: now - 12 * day, updatedAt: now - day },
  ];

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

  const kitchenTickets: KitchenTicket[] = [
    { id: 'kot-1002-grill', branchId, orderId: 'ord-1002', orderNumber: 'OD-1002', station: 'grill', tableLabel: 'T2', status: 'preparing', items: [{ orderItemId: order2Items[0].id, nameEn: order2Items[0].nameEn, nameAr: order2Items[0].nameAr, quantity: 1, modifiers: [], note: 'Medium well' }], firedAt: now - 18 * 60000, dueAt: now + 6 * 60000, source: 'dine_in' },
    { id: 'kot-1002-beverage', branchId, orderId: 'ord-1002', orderNumber: 'OD-1002', station: 'beverage', tableLabel: 'T2', status: 'ready', items: [{ orderItemId: order2Items[2].id, nameEn: order2Items[2].nameEn, nameAr: order2Items[2].nameAr, quantity: 1, modifiers: [] }], firedAt: now - 18 * 60000, dueAt: now - 2 * 60000, source: 'dine_in' },
  ];

  const guestTabs: GuestTab[] = [
    { id: 'tab-001', branchId, tableId: 'table-3', tabNumber: 'TAB-1001', guestName: 'Majed', guestPhone: '966522220001', status: 'open', items: [orderItem(menuItems[0], 1), orderItem(menuItems[3], 1)], subtotal: 29, discount: 0, vat: 4.35, serviceCharge: 0, tips: 0, total: 33.35, splitPayments: [], createdAt: now - 22 * 60000, updatedAt: now - 10 * 60000 },
    { id: 'tab-002', branchId, tableId: 'table-7', tabNumber: 'TAB-1002', guestName: 'Family Walk-in', status: 'pending_approval', items: [orderItem(menuItems[1], 2), orderItem(menuItems[2], 2)], subtotal: 126, discount: 10, vat: 17.4, serviceCharge: 0, tips: 0, total: 133.4, splitPayments: [], createdAt: now - 12 * 60000, updatedAt: now - 5 * 60000 },
  ];

  const branchStaffAssignments: BranchStaffAssignment[] = [
    { id: 'bsa-admin', branchId, staffMemberId: 'staff-admin', userId: 'trial-admin', role: 'administrator', permissions: ['branch_pos', 'branch_kds', 'branch_inventory', 'branch_purchases', 'branch_staff', 'branch_reports', 'branch_settings', 'branch_refunds', 'branch_voids', 'branch_discounts', 'branch_tabs'], active: true, createdAt: now - 30 * day, updatedAt: now - day },
    { id: 'bsa-sara', branchId, staffMemberId: 'staff-sara', userId: 'trial-cashier', role: 'cashier', permissions: ['branch_pos', 'branch_tabs'], active: true, createdAt: now - 30 * day, updatedAt: now - day },
  ];

  const deliveryChannels: DeliveryChannel[] = [
    { id: 'dch-hungerstation', branchId, provider: 'hungerstation', active: true, menuSyncStatus: 'synced', lastSyncAt: now - 45 * 60000, endpointUrl: 'https://mock.hungerstation.example/orders', merchantId: 'HS-OASIS-TRIAL', externalBranchId: 'HS-RUH-001', status: 'online', timeoutSeconds: 20 },
    { id: 'dch-jahez', branchId, provider: 'jahez', active: true, menuSyncStatus: 'pending', lastSyncAt: now - 2 * 3600000, merchantId: 'JH-OASIS-TRIAL', status: 'online', timeoutSeconds: 20 },
  ];

  const externalDeliveryOrders: ExternalDeliveryOrder[] = [
    { id: 'ext-hs-7001', provider: 'hungerstation', branchId, externalOrderId: 'HS-7001', status: 'new', customerName: 'Abeer', customerPhone: '966533330001', deliveryAddress: 'Al Murooj, Riyadh', items: [{ id: '1', externalMenuItemId: 'HS-1001', nameEn: 'Chicken Shawarma', nameAr: 'شاورما دجاج', quantity: 2, unitPrice: 16 }, { id: '2', externalMenuItemId: 'HS-1003', nameEn: 'Mint Lemonade', nameAr: 'ليمون نعناع', quantity: 2, unitPrice: 13 }], subtotal: 58, discount: 0, vat: 8.7, total: 66.7, note: 'No pickles', createdAt: now - 9 * 60000, updatedAt: now - 9 * 60000 },
    { id: 'ext-hs-7000', provider: 'hungerstation', branchId, externalOrderId: 'HS-7000', status: 'imported', customerName: 'Rakan', customerPhone: '966533330002', deliveryAddress: 'King Fahd Road', importedRestaurantOrderId: 'ord-1002', items: [{ id: '1', externalMenuItemId: 'HS-1002', nameEn: 'Mixed Grill Plate', nameAr: 'مشكل مشاوي', quantity: 1, unitPrice: 49 }], subtotal: 49, discount: 0, vat: 7.35, total: 56.35, createdAt: now - 48 * 60000, updatedAt: now - 32 * 60000 },
  ];

  const restaurantGroups: RestaurantGroup[] = [{ id: 'group-oasis-trial', nameEn: 'Oasis Trial Restaurant Group', nameAr: 'مجموعة مطاعم أواسس التجريبية', ownerName: 'Oasis Demo', supportPhone: '920000000', cloudTenantId: 'trial-offline', createdAt: now - 90 * day, updatedAt: now - day }];
  const branches: RestaurantBranch[] = [
    { id: branchId, groupId: 'group-oasis-trial', nameEn: 'Riyadh Olaya Branch', nameAr: 'فرع الرياض العليا', crNumber: '1010123456', vatNumber: '300000000000003', phone: '0115550100', address: 'Olaya Street, Riyadh', city: 'Riyadh', managerStaffId: 'staff-admin', serviceTypes: ['dine_in', 'takeaway', 'delivery', 'qr_order', 'kiosk'], operatingHours: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((dayName, index) => ({ day: dayName as RestaurantBranch['operatingHours'][number]['day'], open: index === 5 ? '13:00' : '09:00', close: index >= 4 ? '02:00' : '01:00' })), cloudStatus: { status: 'offline', lastSyncAt: now - 6 * 3600000, lastBackupAt: now - day }, active: true, createdAt: now - 80 * day, updatedAt: now - day },
    { id: 'branch-jeddah-corniche', groupId: 'group-oasis-trial', nameEn: 'Jeddah Corniche Branch', nameAr: 'فرع جدة الكورنيش', crNumber: '4030123456', vatNumber: '300000000000003', phone: '0125550100', address: 'Corniche Road, Jeddah', city: 'Jeddah', serviceTypes: ['dine_in', 'takeaway', 'delivery'], operatingHours: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map(dayName => ({ day: dayName as RestaurantBranch['operatingHours'][number]['day'], open: '10:00', close: '01:00' })), cloudStatus: { status: 'offline' }, active: true, createdAt: now - 70 * day, updatedAt: now - day },
  ];

  return {
    products,
    transactions,
    customers,
    expenses: [
      { id: 'exp-001', description: 'Kitchen gas refill', amount: 280, category: 'utilities', date: now - 2 * day },
      { id: 'exp-002', description: 'Cleaning supplies', amount: 145, category: 'maintenance', date: now - day },
      { id: 'exp-003', description: 'Part-time delivery support', amount: 350, category: 'salary', date: now - 6 * day },
    ],
    shifts: [
      { id: 'shift-open', startTime: now - 5 * 3600000, startCash: 700, salesTotal: 68.43, status: 'open', operator: 'Sara Alharbi' },
      { id: 'shift-closed', startTime: now - day - 8 * 3600000, endTime: now - day, startCash: 500, endCash: 2350, expectedCash: 2320, variance: 30, salesTotal: 1820, status: 'closed', operator: 'Trial Administrator' },
    ],
    heldCarts: [{ id: 'held-001', timestamp: now - 16 * 60000, items: [{ ...products[7], quantity: 1 }, { ...products[3], quantity: 2 }], customerName: 'Walk-in customer' }],
    users,
    auditLogs: [
      { id: 'audit-001', timestamp: now - 10 * 60000, user: 'Trial Mode', event: 'trial_seeded', description: 'Loaded offline trial mock data.', storageNode: 'Offline trial mock' },
      { id: 'audit-002', timestamp: now - 40 * 60000, user: 'Sara Alharbi', event: 'sale_completed', description: 'Completed POS sale tx-9004.', storageNode: 'Offline trial mock' },
    ],
    config: { nameEn: 'Oasis Trial Restaurant', nameAr: 'مطعم أواسس التجريبي', vatNumber: '300000000000003', crNumber: '1010123456', vatRate: 0.15, phone: '0115550100', address: 'Olaya Street, Riyadh, Saudi Arabia', currency: 'SAR', loyaltyRate: 1, footerMessage: 'Trial data only - no Firebase connection required.', lowStockThreshold: 5, setupComplete: true, logoDataUrl: APP_LOGO_DATA_URL },
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
    deals: [{ id: 'deal-001', nameAr: 'اشتر ٢ واحصل على خصم', nameEn: 'Buy 2 Shawarma Save 10%', type: 'percent_off', productId: 'menu-chicken-shawarma', minQty: 2, percentOff: 10, active: true, expiresAt: now + 12 * day, createdAt: now - 5 * day }],
    menuCategories,
    modifierGroups,
    menuItems,
    diningAreas,
    tables,
    restaurantOrders,
    kitchenTickets,
    ingredients,
    recipes,
    wastageEntries: [{ id: 'wst-001', branchId, ingredientId: 'ing-lemon', ingredientName: 'Fresh Lemon', quantity: 1.5, unitOfMeasure: 'kg', reason: 'expired', note: 'Trial expiry example', createdAt: now - day, createdBy: 'Omar Nasser' }],
    staffMembers,
    healthCertificates,
    syncQueue: [{ id: 'sync-001', branchId, entity: 'menu', operation: 'update', payload: { menuItemId: 'menu-chicken-shawarma' }, status: 'queued', attempts: 0, nextAttemptAt: now + 3600000, createdAt: now - 20 * 60000, lastError: 'Trial mode is offline by design.' }],
    zatcaSubmissions: [{ id: 'zatca-001', invoiceId: 'tx-9003', invoiceType: 'simplified', status: 'pending', deadlineAt: now + 23 * 3600000, attempts: 0, createdAt: now - 3 * 3600000, updatedAt: now - 3 * 3600000 }],
    restaurantGroups,
    branches,
    activeBranchId: branchId,
    branchStaffAssignments,
    cloudStorageConfig: { enabled: false, mode: 'cloud_only', cloudflareTunnelUrl: '', lanApiUrl: 'http://localhost:8787', apiToken: '', deviceId: 'trial-browser-device', syncIntervalMinutes: 0, status: 'not_configured', lastError: 'Trial mode uses offline mock data.' },
    cloudSyncStatus: { online: false, sourceOfTruth: 'mac_mini_cloud', queued: 1, synced: 42, failed: 0, lastSyncAt: now - 6 * 3600000, serverVersion: 'trial-offline' },
    guestTabs,
    reservations: [
      { id: 'rsv-001', branchId, customerName: 'Abdullah Family', customerPhone: '966500000111', partySize: 6, reservedAt: now + 2 * 3600000, status: 'booked', note: 'Family section' },
      { id: 'rsv-002', branchId, customerName: 'Mona Alqahtani', customerPhone: '966500000222', partySize: 3, reservedAt: now - 45 * 60000, status: 'seated', note: 'Birthday dessert' },
    ],
    loyaltyProfiles: [
      { id: 'loy-001', branchId, customerId: 'cus-001', customerName: 'Fahad Alotaibi', phone: '966501112233', points: 185, tier: 'silver', lastVisitAt: now - 35 * 60000 },
      { id: 'loy-002', branchId, customerId: 'cus-003', customerName: 'Yousef Khan', phone: '966543219876', points: 410, tier: 'gold', lastVisitAt: now - 4 * day },
    ],
    deliveryChannels,
    externalDeliveryOrders,
    deliveryProviderEvents: [
      { id: 'dpe-001', provider: 'hungerstation', branchId, type: 'orders_fetch', status: 'success', message: 'Fetched 2 trial delivery orders.', createdAt: now - 8 * 60000 },
      { id: 'dpe-002', provider: 'jahez', branchId, type: 'menu_sync', status: 'pending', message: 'Menu sync queued in offline trial mode.', createdAt: now - 35 * 60000, nextRetryAt: now + 3600000 },
    ],
    promotions: [
      { id: 'promo-001', branchIds: [branchId], nameEn: 'Lunch Grill Combo', nameAr: 'عرض غداء المشاوي', type: 'combo', value: 15, startsAt: now - day, endsAt: now + 7 * day, active: true },
      { id: 'promo-002', branchIds: [branchId], nameEn: 'Happy Hour Drinks', nameAr: 'ساعة المشروبات', type: 'happy_hour', value: 20, startsAt: now - day, endsAt: now + 14 * day, active: true },
    ],
    serviceChargeConfigs: [{ id: 'svc-dinein', branchId, enabled: true, percentage: 0, appliesTo: ['dine_in'] }],
  };
}
