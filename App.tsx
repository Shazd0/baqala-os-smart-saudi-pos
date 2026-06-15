
import React, { useState, useEffect, useRef } from 'react';
import { BarChart3, Building2, ChefHat, DownloadCloud, FileText, LayoutDashboard, LogOut, MapPin, Menu, Monitor, Package, PanelLeftClose, PanelLeftOpen, Settings as SettingsIcon, ShoppingCart, Trash2, TrendingUp, Truck, Users, X, type LucideIcon } from 'lucide-react';
import RestaurantPOS from './components/RestaurantPOS';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Expenses from './components/Expenses';
import Orders from './components/Orders';
import Settings from './components/Settings';
import Compliance from './components/Compliance';
import KitchenDisplay from './components/KitchenDisplay';
import MenuManager from './components/MenuManager';
import RecipeInventory from './components/RecipeInventory';
import StaffCompliance from './components/StaffCompliance';
import TableFloor from './components/TableFloor';
import WasteLog from './components/WasteLog';
import RestaurantAdmin from './components/RestaurantAdmin';
import AdminPortal from './components/AdminPortal';
import TabOrdering from './components/TabOrdering';
import RestaurantFeatures from './components/RestaurantFeatures';
import HungerStationReport from './components/HungerStationReport';
import CustomerQrOrder from './components/CustomerQrOrder';
import ReceiptModal from './components/ReceiptModal';
import DeveloperBugReportConsole from './components/DeveloperBugReportConsole';
import SetupWizard from './components/SetupWizard';
import Login from './components/Login';
import PurchaseReport from './components/PurchaseReport';
import Suppliers from './components/Suppliers';
import Activation from './components/Activation';
import { ToastProvider } from './components/Toast';
import { StorageService } from './services/storageService';
import { isActivated, getActivation, trialDaysLeft } from './services/licenseService';
import { APP_LOGO_DATA_URL } from './services/appLogo';
import { Product, Transaction, Language, CartItem, StoreConfig, Customer, User } from './types';
import { TRANSLATIONS } from './constants';

type View = 'dashboard' | 'pos' | 'tables' | 'kds' | 'tabs' | 'stock' | 'vendors' | 'purchases' | 'waste' | 'menu' | 'invoices' | 'hungerstation' | 'staff' | 'restaurantAdmin' | 'adminPortal' | 'analytics' | 'settings' | 'compliance';
const APP_NAME = 'Oasis Dine RMS';

function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const qrTableId = urlParams.get('qrTable');
  const standaloneView = urlParams.get('standalone');

  if (qrTableId) {
    return (
      <ToastProvider>
        <CustomerQrOrder tableId={qrTableId} />
      </ToastProvider>
    );
  }

  return <StaffApp standaloneView={standaloneView} />;
}

function StaffApp({ standaloneView }: { standaloneView: string | null }) {
  const [activated, setActivated] = useState<boolean>(() => isActivated());
  const [view, setView] = useState<View>('pos');
  const [lang, setLang] = useState<Language>('en');
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [config, setConfig] = useState<StoreConfig>(StorageService.getConfig());
  const [setupComplete, setSetupComplete] = useState(StorageService.isSetupComplete());
  const [currentUser, setCurrentUser] = useState<User | null>(StorageService.getCurrentUser());
  const [dataVersion, setDataVersion] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showDeveloperConsole, setShowDeveloperConsole] = useState(false);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarScrollTopRef = useRef(0);
  const developerBrandTapRef = useRef(0);
  
  // Receipt State
  const [showReceipt, setShowReceipt] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<Transaction | null>(null);

  // Initialize data
  useEffect(() => {
    refreshData();
    StorageService.syncFirebaseData().then(synced => {
      if (!synced) return;
      setSetupComplete(StorageService.isSetupComplete());
      refreshData();
    }).catch(() => {
      // Firebase-only production requires Firestore; setup will surface configuration errors.
    });
  }, []);

  const refreshData = () => {
    setProducts(StorageService.getProducts());
    setTransactions(StorageService.getTransactions());
    setCustomers(StorageService.getCustomers());
    setConfig(StorageService.getConfig());
    setCurrentUser(StorageService.getCurrentUser());
    setDataVersion(version => version + 1);
  };

  const t = TRANSLATIONS[lang];
  const branches = StorageService.getBranches();
  const activeBranchId = StorageService.getActiveBranchId();
  const activeBranch = branches.find(branch => branch.id === activeBranchId);
  const restaurantOrders = StorageService.getRestaurantOrders();
  const activeOrderCount = restaurantOrders.filter(order => !['paid', 'cancelled', 'served'].includes(order.status)).length;
  const activeTableCount = restaurantOrders.filter(order => order.tableId && !['paid', 'cancelled', 'served'].includes(order.status)).length;
  const lowStockCount = products.filter(product => Number(product.stock || 0) <= 5).length;
  const zatcaState = StorageService.getZatcaState();
  const zatcaReady = zatcaState.onboardingStatus === 'production_ready';
  const databaseLabel = StorageService.isTrialMode()
    ? 'Trial mock data'
    : StorageService.isFirebaseConfigured()
      ? 'Firebase'
      : 'Firebase required';

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (!setupComplete || !currentUser || StorageService.isDesktopRuntime()) return;
    let active = true;
    StorageService.syncFirebaseData().then(synced => {
      if (active && synced) refreshData();
    }).catch(() => {
      // Firebase-only mode does not fall back to local device storage.
    });
    return () => {
      active = false;
    };
  }, [setupComplete, currentUser?.id]);

  useEffect(() => {
    const shortcuts: Record<string, View> = {
      '1': 'dashboard',
      '2': 'pos',
      '3': 'tables',
      '4': 'kds',
      '5': 'stock',
      '6': 'menu',
      '7': 'invoices',
      '8': 'analytics',
      '9': 'settings',
    };

    const handleShortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setShowDeveloperConsole(true);
        return;
      }

      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = shortcuts[event.key];
      if (!target) return;
      event.preventDefault();
      setView(target);
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (!currentUser || currentUser.role === 'administrator') return;
    const assignedBranchIds = currentUser.branchIds?.length
      ? currentUser.branchIds
      : currentUser.primaryBranchId
        ? [currentUser.primaryBranchId]
        : [];
    if (assignedBranchIds.length && !assignedBranchIds.includes(StorageService.getActiveBranchId())) {
      StorageService.setActiveBranchId(assignedBranchIds[0]);
      refreshData();
    }
  }, [currentUser?.id, currentUser?.role]);

  const handleCheckout = (
    cartItems: CartItem[], 
    method: 'cash' | 'card' | 'credit', 
    customerId?: string, 
    discount: number = 0, 
    note?: string, 
    earnedPoints?: number,
    preCalculated?: { subtotal: number; vat: number; total: number; selectiveTaxAmount: number },
    paymentApprovalReference?: string
  ) => {
    let subtotal = 0;
    let vat = 0;
    let total = 0;
    let selectiveTaxAmount = 0;

    if (preCalculated) {
      subtotal = preCalculated.subtotal;
      vat = preCalculated.vat;
      total = preCalculated.total;
      selectiveTaxAmount = preCalculated.selectiveTaxAmount;
    } else {
      subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const subtotalAfterDiscount = subtotal - discount;
      vat = subtotalAfterDiscount * config.vatRate;
      total = subtotalAfterDiscount + vat;
    }

    const transaction: Transaction = {
      id: 'TX-' + Date.now().toString(),
      branchId: activeBranchId,
      timestamp: Date.now(),
      items: cartItems,
      subtotal,
      discount,
      vat,
      total,
      paymentMethod: method,
      paymentApprovalReference,
      customerId,
      cashierId: currentUser?.id,
      cashierName: currentUser?.name,
      status: 'completed',
      note,
      earnedPoints,
      selectiveTaxAmount
    };

    const savedTransaction = StorageService.saveTransaction(transaction);
    refreshData(); // Refresh all state
    setCurrentTransaction(savedTransaction);
    setShowReceipt(true);

    // ReceiptModal owns the branded receipt template and auto-print behavior.
  };

  const handleAddProduct = (product: Product) => {
    const updatedProducts = StorageService.saveProduct(product);
    setProducts([...updatedProducts]);
  };

  const completeSetup = () => {
    setSetupComplete(true);
    refreshData();
  };

  const handleActivated = () => {
    setActivated(true);
    setSetupComplete(StorageService.isSetupComplete());
    refreshData();
  };

  const handleLogin = () => {
    setCurrentUser(StorageService.getCurrentUser());
    refreshData();
  };

  const handleLogout = () => {
    StorageService.logout();
    setCurrentUser(null);
  };

  const restoreSidebarScroll = () => {
    window.requestAnimationFrame(() => {
      if (sidebarRef.current) {
        sidebarRef.current.scrollTop = sidebarScrollTopRef.current;
      }
    });
  };

  const handleViewChange = (target: View) => {
    if (sidebarRef.current) {
      sidebarScrollTopRef.current = sidebarRef.current.scrollTop;
    }
    setView(target);
    setMobileSidebarOpen(false);
    restoreSidebarScroll();
  };

  const openDeveloperConsole = () => setShowDeveloperConsole(true);

  const handleBrandTap = () => {
    const now = Date.now();
    if (now - developerBrandTapRef.current < 420) {
      openDeveloperConsole();
    }
    developerBrandTapRef.current = now;
  };

  useEffect(() => {
    restoreSidebarScroll();
  }, [view]);

  const developerTelemetryContext = {
    targetBranchId: activeBranchId,
    activeBranchName: activeBranch?.nameEn,
    activeUserSessionName: currentUser?.name || 'Unknown session',
    activeUserRole: currentUser?.role,
    networkSourceType: StorageService.isFirebaseConfigured() ? 'firestore' as const : 'local' as const,
    currentReactStateDump: {
      appVersion: '1.0.2',
      view,
      language: lang,
      activeBranchId,
      activeBranchName: activeBranch?.nameEn,
      activeOrderCount,
      activeTableCount,
      lowStockCount,
      productCount: products.length,
      transactionCount: transactions.length,
      customerCount: customers.length,
      dataVersion,
      firebaseConfigured: StorageService.isFirebaseConfigured(),
      zatcaReady,
    },
  };

  const navigationSections: Array<{
    title: string;
    items: Array<{ target: View; icon: LucideIcon; label: string; shortcut?: string }>;
  }> = [
    {
      title: lang === 'ar' ? 'العمليات' : 'OPERATIONS',
      items: [
        { target: 'dashboard', icon: LayoutDashboard, label: lang === 'ar' ? 'لوحة التحكم' : 'Dashboard', shortcut: 'Alt+1' },
        { target: 'pos', icon: ShoppingCart, label: lang === 'ar' ? 'نقطة البيع' : 'POS Terminal', shortcut: 'Alt+2' },
        { target: 'tables', icon: MapPin, label: lang === 'ar' ? 'خريطة الطاولات' : 'Table Map', shortcut: 'Alt+3' },
        { target: 'kds', icon: Monitor, label: lang === 'ar' ? 'شاشة المطبخ' : 'Kitchen Display', shortcut: 'Alt+4' },
        { target: 'tabs', icon: FileText, label: lang === 'ar' ? 'طلبات التابلت' : 'Tablet Ordering' },
      ],
    },
    {
      title: lang === 'ar' ? 'المخزون' : 'INVENTORY',
      items: [
        { target: 'stock', icon: Package, label: lang === 'ar' ? 'أصناف المخزون' : 'Stock Items', shortcut: 'Alt+5' },
        { target: 'vendors', icon: Truck, label: lang === 'ar' ? 'الموردون' : 'Vendors' },
        { target: 'purchases', icon: FileText, label: lang === 'ar' ? 'أوامر الشراء' : 'Purchase Orders' },
        { target: 'waste', icon: Trash2, label: lang === 'ar' ? 'سجل الهدر' : 'Waste Log' },
      ],
    },
    {
      title: lang === 'ar' ? 'القائمة والتقارير' : 'MENU & REPORTS',
      items: [
        { target: 'menu', icon: ChefHat, label: lang === 'ar' ? 'أصناف القائمة' : 'Menu Items', shortcut: 'Alt+6' },
        { target: 'invoices', icon: FileText, label: lang === 'ar' ? 'الفواتير' : 'Invoices', shortcut: 'Alt+7' },
        { target: 'hungerstation', icon: Truck, label: lang === 'ar' ? 'هنقرستيشن' : 'HungerStation' },
        ...(currentUser?.role === 'administrator' ? [
          { target: 'staff' as const, icon: Users, label: lang === 'ar' ? 'الموظفون' : 'Staff' },
          { target: 'restaurantAdmin' as const, icon: Building2, label: lang === 'ar' ? 'إدارة المطاعم' : 'Restaurant Admin' },
          { target: 'adminPortal' as const, icon: BarChart3, label: lang === 'ar' ? 'بوابة الإدارة' : 'Admin Portal' },
        ] : []),
        { target: 'analytics', icon: TrendingUp, label: lang === 'ar' ? 'التحليلات' : 'Analytics', shortcut: 'Alt+8' },
      ],
    },
    {
      title: lang === 'ar' ? 'النظام' : 'SYSTEM',
      items: [
        { target: 'settings', icon: SettingsIcon, label: lang === 'ar' ? 'الإعدادات' : 'Settings', shortcut: 'Alt+9' },
        { target: 'compliance', icon: DownloadCloud, label: lang === 'ar' ? 'زاتكا المرحلة الثانية' : 'ZATCA Phase 2' },
      ],
    },
  ];

  const NavButton = ({ target, icon: Icon, label, shortcut }: { target: View, icon: LucideIcon, label: string, shortcut?: string }) => {
    const active = view === target;
    const compact = sidebarCollapsed && !mobileSidebarOpen;
    const isPrimary = target === 'dashboard' || target === 'pos' || target === 'tables' || target === 'kds' || target === 'tabs';
    const badge = target === 'pos'
      ? activeOrderCount
      : target === 'tables'
        ? activeTableCount
        : target === 'stock'
          ? lowStockCount
          : undefined;
    return (
      <button
        type="button"
        aria-label={label}
        onMouseDown={event => event.preventDefault()}
        onClick={() => handleViewChange(target)}
        title={shortcut ? `${label} (${shortcut})` : label}
        className={`relative flex h-11 w-full items-center gap-3 overflow-hidden rounded-xl px-3 text-left transition-all duration-200 ease-out active:scale-[0.97] ${compact ? 'justify-center px-0' : ''} ${
          active
            ? isPrimary
              ? 'bg-[#007AFF] text-white shadow-[0_10px_26px_rgba(0,122,255,0.18)]'
              : 'bg-blue-50 text-blue-600'
            : 'bg-transparent text-slate-800 hover:bg-slate-100/80'
        }`}
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
          active
            ? isPrimary
              ? 'bg-white/15 text-white'
              : 'bg-blue-100 text-blue-600'
            : 'text-slate-400'
        }`}>
          <Icon size={18} strokeWidth={active ? 2.25 : 2} />
        </span>
        <span className={`ios-sidebar-text flex min-w-0 flex-1 items-center justify-between gap-2 ${compact ? 'ios-sidebar-text-collapsed' : ''}`}>
          <span className="min-w-0 truncate text-sm font-semibold tracking-tight">{label}</span>
          {badge !== undefined && badge > 0 && (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              target === 'stock'
                ? 'bg-amber-50 text-amber-600'
                : active && isPrimary
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-500'
            }`}>
              {badge}
            </span>
          )}
          {target === 'compliance' && (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              zatcaReady ? 'bg-emerald-50 text-emerald-600 shadow-[0_0_18px_rgba(52,199,89,0.16)]' : 'bg-blue-50 text-blue-600'
            }`}>
              {zatcaReady ? 'Sync' : 'Test'}
            </span>
          )}
        </span>
        {compact && badge !== undefined && badge > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#FF3B30] ring-2 ring-white" />
        )}
      </button>
    );
  };

  /* ── 1. License gate — MUST come before staff app ── */
  if (!activated) {
    return (
      <ToastProvider>
        <Activation onActivated={handleActivated} />
      </ToastProvider>
    );
  }

  /* ── 2. First-time store setup ── */
  if (!setupComplete) {
    return <SetupWizard onComplete={completeSetup} />;
  }

  /* ── 3. Login ── */
  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  if (standaloneView === 'kitchen') {
    return (
      <ToastProvider>
        <div className={`ios-app ios-shell overflow-hidden bg-[var(--ios-bg)] ${lang === 'ar' ? 'font-arabic' : ''}`}>
          <KitchenDisplay lang={lang} />
        </div>
      </ToastProvider>
    );
  }

  if (standaloneView === 'tabs') {
    return (
      <ToastProvider>
        <div className={`ios-app ios-shell overflow-hidden bg-[var(--ios-bg)] ${lang === 'ar' ? 'font-arabic' : ''}`}>
          <TabOrdering lang={lang} onChange={refreshData} />
        </div>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
    <div className={`ios-app ios-shell flex overflow-hidden ${lang === 'ar' ? 'font-arabic' : ''}`}>
      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label={lang === 'ar' ? 'إغلاق التنقل' : 'Close navigation'}
          onClick={() => setMobileSidebarOpen(false)}
          className="ios-mobile-sidebar-backdrop"
        />
      )}
      {/* Sidebar Navigation */}
      <nav
          className={`ios-sidebar-shell ${sidebarCollapsed ? 'ios-sidebar-collapsed' : ''} ${mobileSidebarOpen ? 'ios-sidebar-shell-open' : ''} relative z-30 flex h-full max-h-full w-[280px] flex-shrink-0 flex-col overflow-hidden border-r border-slate-200/80 bg-white shadow-[4px_0_24px_rgba(0,0,0,0.02)]`}
      >
        <div className="flex-shrink-0 px-4 py-5">
          <div className="flex items-start gap-3">
            <img src={APP_LOGO_DATA_URL} alt="Oasis Dine RMS" className="mt-0.5 h-9 w-9 object-contain" />
            <div className={`ios-sidebar-text min-w-0 flex-1 ${sidebarCollapsed && !mobileSidebarOpen ? 'ios-sidebar-text-collapsed' : ''}`}>
              <div className="flex items-center gap-2">
                <h1
                  onClick={handleBrandTap}
                  onDoubleClick={openDeveloperConsole}
                  className="cursor-default truncate text-xl font-black tracking-tight text-slate-950"
                  title="Double tap for developer reporting"
                >
                  Oasis Dine
                </h1>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400" />
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-500">RMS</span>
                <span className="truncate text-[11px] font-bold text-slate-400">{databaseLabel} database</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(value => !value)}
              className="ios-sidebar-collapse-toggle ml-auto flex h-9 min-h-0 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-all duration-200 hover:bg-blue-50 hover:text-blue-600"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Minimize sidebar'}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Minimize sidebar'}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="ios-mobile-sidebar-close ml-auto"
              aria-label={lang === 'ar' ? 'إغلاق القائمة' : 'Close menu'}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div
          ref={sidebarRef}
          onScroll={event => { sidebarScrollTopRef.current = event.currentTarget.scrollTop; }}
          className="scrollbar-none flex-1 space-y-6 overflow-y-auto px-4 py-3 no-scrollbar"
        >
          {navigationSections.map(section => (
            <div key={section.title}>
              <p className={`ios-sidebar-text mb-2 mt-4 block text-[11px] font-bold uppercase tracking-wider text-slate-400 ${sidebarCollapsed && !mobileSidebarOpen ? 'ios-sidebar-text-collapsed' : ''}`}>{section.title}</p>
              <div className="space-y-1.5">
                {section.items.map(item => (
                  <React.Fragment key={item.target}>
                    <NavButton target={item.target} icon={item.icon} label={item.label} shortcut={item.shortcut} />
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto flex-shrink-0 border-t border-slate-100 bg-slate-50/50 p-4">
          <div className={`rounded-2xl bg-white p-3 shadow-[0_4px_24px_rgba(0,0,0,0.03)] ${sidebarCollapsed && !mobileSidebarOpen ? 'ios-sidebar-footer-compact' : ''}`}>
            <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2">
              <p className={`ios-sidebar-text truncate text-xs font-black uppercase tracking-wider text-slate-400 ${sidebarCollapsed && !mobileSidebarOpen ? 'ios-sidebar-text-collapsed' : ''}`}>Active branch</p>
              <p className={`ios-sidebar-text mt-0.5 truncate text-sm font-black tracking-tight text-slate-900 ${sidebarCollapsed && !mobileSidebarOpen ? 'ios-sidebar-text-collapsed' : ''}`}>{activeBranch?.nameEn || 'Select Branch'}</p>
              {sidebarCollapsed && !mobileSidebarOpen && (
                <Building2 size={18} className="mx-auto text-blue-600" />
              )}
            </div>
            <div className={`flex items-center gap-3 ${sidebarCollapsed && !mobileSidebarOpen ? 'flex-col' : ''}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-black text-blue-600">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <div className={`ios-sidebar-text min-w-0 flex-1 ${sidebarCollapsed && !mobileSidebarOpen ? 'ios-sidebar-text-collapsed' : ''}`}>
                <p className="truncate text-sm font-black tracking-tight text-slate-900" title={currentUser.name}>{currentUser.name}</p>
                <p className="truncate text-xs font-semibold capitalize text-slate-500">{currentUser.role}</p>
              </div>
              <button
                onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')}
                className="flex h-9 min-h-0 w-9 items-center justify-center rounded-xl bg-slate-100 text-xs font-black text-slate-600"
              >
                {lang === 'en' ? 'AR' : 'EN'}
              </button>
              <button
                onClick={handleLogout}
                className="flex h-9 min-h-0 w-9 items-center justify-center rounded-xl bg-[#FFECEA] text-[#FF3B30]"
                aria-label={lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
        <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[var(--ios-bg)]">
        {/* Trial banner */}
        {(() => {
          const act = getActivation();
          if (act?.plan === 'trial') {
            const days = trialDaysLeft(act);
            return (
              <div className={`z-30 px-4 py-2 text-center text-xs font-semibold ${days <= 3 ? 'bg-[#FF3B30] text-white' : 'bg-[var(--ios-accent-soft)] text-[var(--ios-accent)]'}`}>
                {days > 0
                  ? `Trial: ${days} day${days === 1 ? '' : 's'} remaining - Purchase a license at support@oasisdine.sa`
                  : 'Trial expired - Please purchase a license to continue using Oasis Dine RMS'}
              </div>
            );
          }
          return null;
        })()}

        <div className="ios-header flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="ios-mobile-menu-button"
            aria-label={lang === 'ar' ? 'فتح التنقل' : 'Open navigation'}
          >
            <Menu size={20} />
            <span className="text-sm font-bold">{APP_NAME}</span>
          </button>
          <div className="flex items-center justify-end gap-3">
          <button
            onClick={() => handleViewChange('restaurantAdmin')}
            className="ios-button-secondary hidden min-h-0 items-center gap-2 px-3 py-2 text-xs lg:flex"
            title={lang === 'ar' ? 'الفرع النشط' : 'Active branch'}
          >
            <Building2 size={15} />
            <span>{activeBranch?.nameEn || (lang === 'ar' ? 'اختر فرعاً' : 'Select Branch')}</span>
          </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative animate-shell-in">
          {view === 'pos' && (
            <RestaurantPOS
              customers={customers}
              lang={lang} 
              onCheckout={handleCheckout} 
              shiftOpen={true}
              config={config}
              currentUser={currentUser}
              shiftId={undefined}
              onChange={refreshData}
            />
          )}

          {view === 'tables' && (
            <TableFloor lang={lang} onChange={refreshData} onCheckout={handleCheckout} />
          )}

          {view === 'kds' && (
            <KitchenDisplay lang={lang} />
          )}

          {view === 'tabs' && (
            <TabOrdering lang={lang} onChange={refreshData} />
          )}

          {view === 'dashboard' && (
            <div className="h-full overflow-y-auto">
               <Dashboard transactions={transactions} products={products} lang={lang} dataVersion={dataVersion} />
            </div>
          )}

          {view === 'stock' && (
            <RecipeInventory lang={lang} />
          )}

          {view === 'purchases' && (
            <div className="h-full overflow-hidden flex flex-col">
              <PurchaseReport
                products={products}
                transactions={transactions}
                lang={lang}
                onInventoryChange={refreshData}
              />
            </div>
          )}

          {view === 'vendors' && (
            <div className="h-full overflow-hidden flex flex-col">
              <Suppliers lang={lang} />
            </div>
          )}

          {view === 'waste' && (
            <WasteLog lang={lang} />
          )}

          {view === 'menu' && (
            <MenuManager lang={lang} />
          )}

          {view === 'staff' && (
            <StaffCompliance lang={lang} />
          )}

          {view === 'adminPortal' && currentUser.role === 'administrator' && (
            <AdminPortal lang={lang} />
          )}

          {view === 'restaurantAdmin' && (
            <RestaurantAdmin lang={lang} onChange={refreshData} />
          )}

          {view === 'invoices' && (
             <Orders 
               transactions={transactions} 
               lang={lang} 
               currentUser={currentUser}
               onRefund={refreshData}
               onReprint={(t) => { setCurrentTransaction(t); setShowReceipt(true); }}
             />
          )}

          {view === 'hungerstation' && (
            <HungerStationReport lang={lang} />
          )}

          {view === 'analytics' && (
            <RestaurantFeatures lang={lang} />
          )}

          {view === 'settings' && (
             <Settings lang={lang} onUpdate={refreshData} />
          )}

          {view === 'compliance' && (
             <Compliance lang={lang} />
          )}

        </div>
      </main>

      {/* Receipt Modal */}
      {showReceipt && currentTransaction && (
        <ReceiptModal 
          transaction={currentTransaction}
          customer={customers.find(c => c.id === currentTransaction.customerId)} 
          onClose={() => setShowReceipt(false)} 
          config={config}
          lang={lang}
        />
      )}

      <DeveloperBugReportConsole
        open={showDeveloperConsole}
        onOpen={openDeveloperConsole}
        onClose={() => setShowDeveloperConsole(false)}
        context={developerTelemetryContext}
      />

    </div>
    </ToastProvider>
  );
}

export default App;
