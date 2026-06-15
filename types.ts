
export interface Product {
  id: string;
  nameEn: string;
  nameAr: string;
  barcode: string;
  price: number;
  category: Category;
  stock: number;
  image?: string;
  expiryDate?: string;
  costPrice?: number;
  selectiveTax?: 'none' | 'energy' | 'tobacco'; // Selective tax classification for excisable goods (KSA)
  supplierId?: string;
  unit?: string;
}

export interface Supplier {
  id: string;
  name: string;
  vatNumber?: string;
  phone?: string;
  address?: string;
  contactName?: string;
  createdAt: number;
}

/** Promotional deal (e.g. "3 for 10 SAR", "Buy 2 get 1 free") */
export interface Deal {
  id: string;
  nameAr: string;
  nameEn: string;
  type: 'bundle_price' | 'buy_x_get_y' | 'percent_off';
  productId?: string;   // if blank = applies to all products
  categoryId?: string;
  minQty: number;       // trigger quantity
  freeQty?: number;     // for buy_x_get_y
  bundlePrice?: number; // for bundle_price (total price for minQty items)
  percentOff?: number;  // for percent_off
  active: boolean;
  expiresAt?: number;
  createdAt: number;
}

export interface StockAdjustment {
  id: string;
  productId: string;
  productName: string;
  quantityDelta: number;
  reason: 'purchase' | 'count' | 'damage' | 'expiry' | 'return' | 'manual';
  note?: string;
  user: string;
  timestamp: number;
}

export interface PurchaseInvoiceLine {
  productId: string;
  productName: string;
  /** Number of cases / packs purchased */
  quantity: number;
  /** Individual units per case / pack (1 = no bundling) */
  caseSize: number;
  /** Total individual units added to stock = quantity × caseSize */
  totalUnits: number;
  /** Cost per case / pack */
  unitCost: number;
  /** Inclusive cost per individual unit (always, regardless of entry mode) = product's costPrice */
  unitCostPerItem: number;
  /** True if unitCost was entered as VAT-inclusive */
  isCostInclusive?: boolean;
  total: number;
}

export interface PurchaseInvoice {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierVatNumber?: string;
  invoiceNumber: string;
  date: number;
  subtotal: number;
  vat: number;
  total: number;
  lines: PurchaseInvoiceLine[];
  note?: string;
  paidAt?: number;
}

export enum Category {
  DAIRY = 'Dairy',
  BAKERY = 'Bakery',
  BEVERAGES = 'Beverages',
  SNACKS = 'Snacks',
  PRODUCE = 'Produce',
  HOUSEHOLD = 'Household',
  TOBACCO = 'Tobacco',
  MISC = 'Misc' // New for custom items
}

export type OrderType = 'dine_in' | 'takeaway' | 'delivery' | 'qr_order' | 'kiosk';
export type TableState = 'vacant' | 'occupied' | 'ordering' | 'awaiting_bill' | 'dirty';
export type KitchenStationType = 'grill' | 'appetizers' | 'beverage' | 'packing' | 'expediter' | 'general';
export type RestaurantOrderStatus = 'draft' | 'fired' | 'preparing' | 'ready' | 'served' | 'awaiting_bill' | 'paid' | 'cancelled';
export type KitchenTicketStatus = 'new' | 'preparing' | 'ready' | 'served' | 'voided';
export type IngredientUnit = 'g' | 'kg' | 'ml' | 'l' | 'unit';
export type AllergenIdentifier =
  | 'Gluten'
  | 'Eggs'
  | 'Dairy'
  | 'Peanuts'
  | 'Tree Nuts'
  | 'Sesame'
  | 'Mustard'
  | 'Soy'
  | 'Celery'
  | 'Lupin'
  | 'Fish'
  | 'Crustaceans'
  | 'Molluscs'
  | 'Sulphites';

export interface ModifierOption {
  id: string;
  nameEn: string;
  nameAr: string;
  priceDelta: number;
  caloriesDelta?: number;
  defaultSelected?: boolean;
}

export interface ModifierGroup {
  id: string;
  nameEn: string;
  nameAr: string;
  minSelections: number;
  maxSelections: number;
  required: boolean;
  options: ModifierOption[];
}

export interface MenuCategory {
  id: string;
  nameEn: string;
  nameAr: string;
  sortOrder: number;
  active: boolean;
}

export interface SfdaNutritionProfile {
  caloriesKcal: number;
  fatGrams: number;
  saturatedFatGrams: number;
  sugarGrams: number;
  sodiumMilligrams: number;
  caffeineMilligrams?: number;
  caffeineServingMl?: number;
  allergens: AllergenIdentifier[];
}

export interface MenuItem {
  id: string;
  branchIds?: string[];
  hungerStationExternalId?: string;
  hungerStationEnabled?: boolean;
  nameEn: string;
  nameAr: string;
  descriptionEn?: string;
  descriptionAr?: string;
  categoryId: string;
  basePrice: number;
  vatPercentage: number;
  active: boolean;
  station: KitchenStationType;
  modifierGroupIds: string[];
  image?: string;
  images?: string[];
  nutrition: SfdaNutritionProfile;
  costPrice?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Ingredient {
  id: string;
  branchId?: string;
  nameEn: string;
  nameAr: string;
  currentStock: number;
  unitOfMeasure: IngredientUnit;
  lowStockThreshold: number;
  movingAverageCost: number;
  supplierId?: string;
  batchNumber?: string;
  expiryDate?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RecipeComponent {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unitOfMeasure: IngredientUnit;
  deduct: boolean;
}

export interface Recipe {
  id: string;
  branchId?: string;
  menuItemId: string;
  menuItemName: string;
  components: RecipeComponent[];
  targetFoodCostPercentage: number;
  createdAt: number;
  updatedAt: number;
}

export interface DiningArea {
  id: string;
  nameEn: string;
  nameAr: string;
  sortOrder: number;
}

export interface DiningTable {
  id: string;
  publicCode?: string;
  branchId?: string;
  areaId: string;
  label: string;
  seats: number;
  state: TableState;
  activeOrderId?: string;
  coverCount?: number;
  updatedAt: number;
}

export interface RestaurantOrderModifier {
  groupId: string;
  optionId: string;
  nameEn: string;
  nameAr: string;
  priceDelta: number;
  caloriesDelta?: number;
}

export interface RestaurantOrderItem {
  id: string;
  menuItemId: string;
  nameEn: string;
  nameAr: string;
  quantity: number;
  unitPrice: number;
  modifiers: RestaurantOrderModifier[];
  station: KitchenStationType;
  note?: string;
  status: 'draft' | 'fired' | 'voided';
  firedAt?: number;
}

export interface RestaurantOrder {
  id: string;
  branchId?: string;
  externalProvider?: 'hungerstation';
  externalOrderId?: string;
  orderNumber: string;
  orderType: OrderType;
  status: RestaurantOrderStatus;
  tableId?: string;
  tableLabel?: string;
  customerId?: string;
  channel?: 'pos' | 'qr' | 'kiosk' | 'jahez' | 'hungerstation' | 'toyou' | 'ninja';
  items: RestaurantOrderItem[];
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  paymentMethod?: 'cash' | 'card' | 'credit' | 'apple_pay';
  paymentApprovalReference?: string;
  cashierId?: string;
  cashierName?: string;
  shiftId?: string;
  createdAt: number;
  updatedAt: number;
  paidAt?: number;
  note?: string;
  zatcaStatus?: Transaction['zatcaStatus'];
}

export interface KitchenTicketItem {
  orderItemId: string;
  nameEn: string;
  nameAr: string;
  quantity: number;
  modifiers: RestaurantOrderModifier[];
  note?: string;
}

export interface KitchenTicket {
  id: string;
  branchId?: string;
  orderId: string;
  orderNumber: string;
  station: KitchenStationType;
  tableLabel?: string;
  status: KitchenTicketStatus;
  items: KitchenTicketItem[];
  firedAt: number;
  dueAt: number;
  source: OrderType;
}

export interface WastageEntry {
  id: string;
  branchId?: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unitOfMeasure: IngredientUnit;
  reason: 'spoiled' | 'burned' | 'dropped' | 'expired' | 'training' | 'other';
  note?: string;
  createdAt: number;
  createdBy: string;
}

export interface HealthCertificate {
  id: string;
  staffMemberId: string;
  cardNumber: string;
  issuedAt?: string;
  expiresAt: string;
  status: 'valid' | 'expiring_soon' | 'expired';
}

export interface StaffMember {
  id: string;
  branchIds?: string[];
  nameEn: string;
  nameAr: string;
  role: 'cashier' | 'waiter' | 'chef' | 'manager' | 'driver';
  quickPin?: string;
  phone?: string;
  nationalIdOrIqama?: string;
  active: boolean;
  qiwaOccupation?: string;
  gosiRegistered?: boolean;
  healthCertificate?: HealthCertificate;
  createdAt: number;
  updatedAt: number;
}

export interface ZatcaSubmission {
  id: string;
  invoiceId: string;
  invoiceType: 'simplified' | 'standard';
  status: 'pending' | 'reported' | 'cleared' | 'failed';
  deadlineAt: number;
  attempts: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SyncQueueItem {
  id: string;
  branchId?: string;
  entity: 'branch' | 'assignment' | 'menu' | 'order' | 'tab' | 'invoice' | 'inventory' | 'staff' | 'audit' | 'reservation' | 'loyalty' | 'delivery' | 'promotion';
  operation: 'create' | 'update' | 'delete';
  payload: unknown;
  status: 'queued' | 'syncing' | 'synced' | 'failed';
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
  lastError?: string;
}

export type BranchPermission =
  | 'branch_pos'
  | 'branch_kds'
  | 'branch_inventory'
  | 'branch_purchases'
  | 'branch_staff'
  | 'branch_reports'
  | 'branch_settings'
  | 'branch_refunds'
  | 'branch_voids'
  | 'branch_discounts'
  | 'branch_tabs';

export interface RestaurantGroup {
  id: string;
  nameEn: string;
  nameAr: string;
  ownerName?: string;
  supportPhone?: string;
  cloudTenantId: string;
  createdAt: number;
  updatedAt: number;
}

export interface BranchOperatingHours {
  day: 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
  open: string;
  close: string;
  closed?: boolean;
}

export interface BranchCloudStatus {
  status: 'online' | 'offline' | 'degraded' | 'unknown';
  lastSyncAt?: number;
  lastBackupAt?: number;
  lastHealthCheckAt?: number;
  lastError?: string;
}

export interface BranchDevice {
  id: string;
  branchId: string;
  name: string;
  type: 'pos' | 'kds' | 'kiosk' | 'admin' | 'qr';
  lastSeenAt?: number;
  active: boolean;
}

export interface RestaurantBranch {
  id: string;
  groupId?: string;
  nameEn: string;
  nameAr: string;
  crNumber?: string;
  vatNumber?: string;
  phone?: string;
  address?: string;
  city?: string;
  managerStaffId?: string;
  serviceTypes: OrderType[];
  operatingHours: BranchOperatingHours[];
  cloudStatus: BranchCloudStatus;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BranchStaffAssignment {
  id: string;
  branchId: string;
  staffMemberId: string;
  userId?: string;
  role: StaffMember['role'] | 'administrator';
  permissions: BranchPermission[];
  startsAt?: string;
  endsAt?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CloudStorageConfig {
  enabled: boolean;
  mode: 'cloud_only';
  cloudflareTunnelUrl: string;
  lanApiUrl: string;
  apiToken: string;
  deviceId: string;
  syncIntervalMinutes: number;
  lastHealthCheckAt?: number;
  lastBackupAt?: number;
  status: 'not_configured' | 'online' | 'offline' | 'error';
  lastError?: string;
}

export interface CloudSyncStatus {
  online: boolean;
  sourceOfTruth: 'mac_mini_cloud';
  queued: number;
  synced: number;
  failed: number;
  lastSyncAt?: number;
  lastError?: string;
  serverVersion?: string;
}

export interface GuestTab {
  id: string;
  branchId: string;
  tableId?: string;
  tabNumber: string;
  guestName?: string;
  guestPhone?: string;
  status: 'open' | 'pending_approval' | 'sent_to_kitchen' | 'partially_paid' | 'closed' | 'cancelled';
  items: RestaurantOrderItem[];
  subtotal: number;
  discount: number;
  vat: number;
  serviceCharge: number;
  tips: number;
  total: number;
  splitPayments: Array<{
    id: string;
    guestName?: string;
    amount: number;
    method: 'cash' | 'card' | 'apple_pay' | 'credit';
    paidAt?: number;
  }>;
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
}

export interface Reservation {
  id: string;
  branchId: string;
  customerName: string;
  customerPhone: string;
  partySize: number;
  reservedAt: number;
  status: 'booked' | 'seated' | 'no_show' | 'cancelled';
  note?: string;
}

export interface LoyaltyProfile {
  id: string;
  branchId?: string;
  customerId?: string;
  customerName: string;
  phone: string;
  points: number;
  tier: 'bronze' | 'silver' | 'gold' | 'vip';
  lastVisitAt?: number;
}

export interface DeliveryChannel {
  id: string;
  branchId: string;
  provider: 'jahez' | 'hungerstation' | 'toyou' | 'ninja' | 'direct';
  active: boolean;
  menuSyncStatus: 'synced' | 'pending' | 'failed';
  lastSyncAt?: number;
  endpointUrl?: string;
  merchantId?: string;
  externalBranchId?: string;
  apiKey?: string;
  timeoutSeconds?: number;
  status?: 'not_configured' | 'online' | 'offline' | 'error';
  lastError?: string;
}

export type ExternalDeliveryProvider = 'jahez' | 'hungerstation' | 'toyou' | 'ninja' | 'direct';
export type ExternalDeliveryOrderStatus = 'new' | 'accepted' | 'rejected' | 'imported' | 'preparing' | 'ready' | 'cancelled' | 'failed';
export type DeliveryProviderEventType = 'connection_test' | 'orders_fetch' | 'order_accept' | 'order_reject' | 'order_import' | 'status_update' | 'menu_sync' | 'error';

export interface ExternalDeliveryOrderItem {
  id: string;
  externalMenuItemId?: string;
  nameEn: string;
  nameAr?: string;
  quantity: number;
  unitPrice: number;
  note?: string;
  modifiers?: RestaurantOrderModifier[];
}

export interface ExternalDeliveryOrder {
  id: string;
  provider: ExternalDeliveryProvider;
  branchId: string;
  externalOrderId: string;
  status: ExternalDeliveryOrderStatus;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  items: ExternalDeliveryOrderItem[];
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  note?: string;
  rawPayload?: unknown;
  importedRestaurantOrderId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DeliveryProviderEvent {
  id: string;
  provider: ExternalDeliveryProvider;
  branchId: string;
  type: DeliveryProviderEventType;
  status: 'pending' | 'success' | 'failed';
  message: string;
  externalOrderId?: string;
  createdAt: number;
  nextRetryAt?: number;
  payload?: unknown;
}

export interface Promotion {
  id: string;
  branchIds: string[];
  nameEn: string;
  nameAr: string;
  type: 'happy_hour' | 'combo' | 'percent' | 'fixed';
  value: number;
  startsAt?: number;
  endsAt?: number;
  active: boolean;
}

export interface ServiceChargeConfig {
  id: string;
  branchId: string;
  enabled: boolean;
  percentage: number;
  appliesTo: OrderType[];
}

export interface CartItem extends Product {
  quantity: number;
}

export interface Transaction {
  id: string;
  branchId?: string;
  timestamp: number;
  items: CartItem[];
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'credit';
  paymentApprovalReference?: string;
  customerId?: string;
  shiftId?: string;
  cashierId?: string;
  cashierName?: string;
  isRefund?: boolean;
  refundOf?: string;
  status: 'completed' | 'refunded';
  note?: string; // New
  earnedPoints?: number; // New
  
  // ZATCA Phase 2 Compliance elements
  uuid?: string;
  invoiceSeqNum?: number;
  previousInvoiceHash?: string;
  invoiceHash?: string;
  cryptographicSignature?: string;
  zatcaStatus?: 'reported' | 'pending' | 'failed' | 'sandbox_pending' | 'sandbox_reported';
  zatcaError?: string;
  xmlUbl?: string;
  selectiveTaxAmount?: number; // separated excisable tax amount (KSA)
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  balance: number;
  points: number; // New
  lastVisit: number;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: 'utilities' | 'rent' | 'salary' | 'maintenance' | 'other';
  date: number;
}

export interface Shift {
  id: string;
  startTime: number;
  endTime?: number;
  startCash: number;
  endCash?: number;
  expectedCash?: number;
  variance?: number;
  salesTotal: number;
  status: 'open' | 'closed';
  operator: string;
}

export interface HeldCart {
  id: string;
  timestamp: number;
  items: CartItem[];
  customerName?: string;
}

export type Language = 'en' | 'ar';

export interface StoreConfig {
  nameEn: string;
  nameAr: string;
  vatNumber: string;
  crNumber?: string;
  vatRate: number;
  phone: string;
  address?: string; // New
  currency: string; // New
  loyaltyRate: number; // New: Points per 1 Currency Unit
  footerMessage?: string; // New
  lowStockThreshold?: number; // Configurable low stock warning threshold
  setupComplete?: boolean;
  logoDataUrl?: string;
}

export type UserRole = 'administrator' | 'cashier';

export type Permission =
  | 'sell'
  | 'refund'
  | 'discount'
  | 'manage_inventory'
  | 'manage_customers'
  | 'manage_expenses'
  | 'manage_settings'
  | 'manage_users'
  | 'close_shift'
  | 'backup_restore'
  | 'zatca_admin';

export interface User {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  staffMemberId?: string;
  primaryBranchId?: string;
  branchIds?: string[];
  quickPin?: string;
  active: boolean;
  createdAt: number;
}

export interface InitialSetupPayload {
  config: StoreConfig;
  admin: {
    name: string;
    username: string;
    password: string;
  };
}

export interface ZatcaState {
  mode: 'sandbox' | 'production';
  onboardingStatus: 'not_configured' | 'csr_generated' | 'sandbox_ready' | 'production_ready';
  reportingEndpoint: string;
  complianceCsid: string;
  productionCsid: string;
  certificatePem?: string;
  publicKeyPem?: string;
  csrPayload?: string;
  lastError?: string;
  lastReportAt?: number;
  autoRetryEnabled?: boolean;
}

export interface HardwareConfig {
  receiptPrinter: string;
  receiptWidth: '58mm' | '80mm';
  autoPrintReceipt: boolean;
  cashDrawerEnabled: boolean;
  cashDrawerPulseCommand?: string;
  barcodeScannerMode: 'keyboard' | 'manual';
  barcodeMinLength: number;
  requireCardApprovalReference: boolean;
  paymentGatewayEnabled?: boolean;
  paymentGatewayUrl?: string;
  paymentGatewayApiKey?: string;
  paymentGatewayTerminalId?: string;
  paymentGatewayTimeoutSeconds?: number;
}

// ── دفتر الدين — Customer Credit Book ──────────────────────────────────────
export interface CreditEntry {
  id: string;
  customerId?: string;        // links to Customer if registered
  customerName: string;       // always stored for quick display
  customerPhone?: string;
  totalDebt: number;          // running balance (positive = owes store)
  creditLimit?: number;       // max allowed credit
  createdAt: number;
  lastActivityAt: number;
}

export interface CreditTransaction {
  id: string;
  creditEntryId: string;
  type: 'debt' | 'payment';   // debt = added to tab, payment = paid back
  amount: number;
  note?: string;
  linkedSaleId?: string;      // POS transaction ID if from a sale
  createdAt: number;
  createdBy: string;          // cashier name
}

export interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloaded: boolean;
  version?: string;
  error?: string;
}
