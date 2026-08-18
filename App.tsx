import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart3, BookOpen, Building2, DownloadCloud, FileText, LayoutDashboard, LogOut,
  Menu, Monitor, Package, Settings as SettingsIcon, ShoppingCart, Store, Tag,
  Truck, Users, Wallet, X, Clock, type LucideIcon,
} from 'lucide-react';
import POS from './components/POS';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Expenses from './components/Expenses';
import Orders from './components/Orders';
import Settings from './components/Settings';
import Compliance from './components/Compliance';
import StaffCompliance from './components/StaffCompliance';
import Branches from './components/Branches';
import AdminPortal from './components/AdminPortal';
import ReceiptModal from './components/ReceiptModal';
import DeveloperBugReportConsole from './components/DeveloperBugReportConsole';
import SetupWizard from './components/SetupWizard';
import Login from './components/Login';
import PurchaseReport from './components/PurchaseReport';
import Suppliers from './components/Suppliers';
import Activation from './components/Activation';
import Customers from './components/Customers';
import CreditBook from './components/CreditBook';
import Deals from './components/Deals';
import ShiftManager from './components/ShiftManager';
import ZReport from './components/ZReport';
import { ToastProvider } from './components/Toast';
import { StorageService } from './services/storageService';
import { CustomerDisplayService } from './services/printerService';
import { isActivated, getActivation, trialDaysLeft, initActivation } from './services/licenseService';
import { APP_LOGO_DATA_URL } from './services/appLogo';
import { Product, Transaction, Language, CartItem, StoreConfig, Customer, User } from './types';

type View =
  | 'dashboard'
  | 'pos'
  | 'stock'
  | 'vendors'
  | 'purchases'
  | 'invoices'
  | 'customers'
  | 'credit'
  | 'deals'
  | 'expenses'
  | 'staff'
  | 'branches'
  | 'adminPortal'
  | 'settings'
  | 'compliance'
  | 'zreport';

const APP_NAME = 'Baqala OS';
const SUPPORT_EMAIL = 'support@baqalaos.sa';

function App() {
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
  const [showDeveloperConsole, setShowDeveloperConsole] = useState(false);
  const [showShiftManager, setShowShiftManager] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarScrollTopRef = useRef(0);
  const developerBrandTapRef = useRef(0);

  const [showReceipt, setShowReceipt] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    initActivation().then(() => {
      setActivated(isActivated());
    });
  }, []);

  useEffect(() => {
    void StorageService.loadFromSQLite().then(() => {
      refreshData();
    });
  }, []);

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

  const branches = StorageService.getBranches();
  const activeBranchId = StorageService.getActiveBranchId();
  const activeBranch = branches.find(branch => branch.id === activeBranchId);
  const lowStockCount = products.filter(product => Number(product.stock || 0) <= 5).length;
  const zatcaState = StorageService.getZatcaState();
  const zatcaReady = zatcaState.onboardingStatus === 'production_ready';
  const databaseLabel = StorageService.isTrialMode()
    ? (lang === 'ar' ? 'بيانات تجريبية' : 'Trial data')
    : StorageService.isFirebaseConfigured()
      ? 'Firebase'
      : (lang === 'ar' ? 'يلزم Firebase' : 'Firebase required');

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

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
      '3': 'stock',
      '4': 'invoices',
      '5': 'customers',
      '6': 'credit',
      '7': 'purchases',
      '8': 'expenses',
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
    refreshData();
    setCurrentTransaction(savedTransaction);
    setShowReceipt(true);
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

  const handleBranchSwitch = (branchId: string) => {
    if (!branchId) return;
    StorageService.setActiveBranchId(branchId);
    refreshData();
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
      title: lang === 'ar' ? 'العمليات' : 'Operations',
      items: [
        { target: 'dashboard', icon: LayoutDashboard, label: lang === 'ar' ? 'لوحة التحكم' : 'Dashboard', shortcut: 'Alt+1' },
        { target: 'pos', icon: ShoppingCart, label: lang === 'ar' ? 'نقطة البيع' : 'POS', shortcut: 'Alt+2' },
      ],
    },
    {
      title: lang === 'ar' ? 'المبيعات' : 'Sales',
      items: [
        { target: 'invoices', icon: FileText, label: lang === 'ar' ? 'الفواتير' : 'Invoices', shortcut: 'Alt+4' },
        { target: 'customers', icon: Users, label: lang === 'ar' ? 'العملاء' : 'Customers', shortcut: 'Alt+5' },
        { target: 'credit', icon: BookOpen, label: lang === 'ar' ? 'دفتر الآجل' : 'Credit book', shortcut: 'Alt+6' },
      ],
    },
    {
      title: lang === 'ar' ? 'المخزون' : 'Inventory',
      items: [
        { target: 'stock', icon: Package, label: lang === 'ar' ? 'المنتجات' : 'Products', shortcut: 'Alt+3' },
        { target: 'vendors', icon: Truck, label: lang === 'ar' ? 'الموردون' : 'Vendors' },
        { target: 'purchases', icon: FileText, label: lang === 'ar' ? 'المشتريات' : 'Purchases', shortcut: 'Alt+7' },
        { target: 'deals', icon: Tag, label: lang === 'ar' ? 'العروض' : 'Deals' },
      ],
    },
    {
      title: lang === 'ar' ? 'المتجر' : 'Store',
      items: [
        { target: 'expenses', icon: Wallet, label: lang === 'ar' ? 'المصاريف' : 'Expenses', shortcut: 'Alt+8' },
        { target: 'zreport' as const, icon: BarChart3, label: lang === 'ar' ? 'تقرير Z' : 'Z-Report' },
          ...(currentUser?.role === 'administrator' ? [
          { target: 'staff' as const, icon: Users, label: lang === 'ar' ? 'الموظفون' : 'Staff' },
          { target: 'branches' as const, icon: Building2, label: lang === 'ar' ? 'الفروع' : 'Branches' },
          { target: 'adminPortal' as const, icon: BarChart3, label: lang === 'ar' ? 'بوابة الإدارة' : 'Admin' },
        ] : []),
        { target: 'settings', icon: SettingsIcon, label: lang === 'ar' ? 'الإعدادات' : 'Settings', shortcut: 'Alt+9' },
        { target: 'compliance', icon: DownloadCloud, label: lang === 'ar' ? 'زاتكا' : 'ZATCA' },
      ],
    },
  ];

  const NavButton = ({ target, icon: Icon, label, shortcut }: { target: View; icon: LucideIcon; label: string; shortcut?: string }) => {
    const active = view === target;
    const badge = target === 'stock' ? lowStockCount : undefined;
    return (
      <button
        type="button"
        onMouseDown={event => event.preventDefault()}
        onClick={() => handleViewChange(target)}
        title={shortcut ? `${label} (${shortcut})` : label}
        className={`nav-item group relative flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left transition-all duration-200 ease-out ${
          active
            ? 'nav-item-active bg-[var(--ios-accent)] text-white shadow-[0_8px_24px_rgba(30,107,72,0.22)]'
            : 'bg-transparent text-[var(--ios-secondary)] hover:bg-[var(--ios-fill)] hover:text-[var(--ios-text)]'
        }`}
      >
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
          active ? 'bg-white/20 text-white' : 'text-[var(--ios-secondary)] group-hover:text-[var(--ios-accent)]'
        }`}>
          <Icon size={16} strokeWidth={active ? 2.5 : 2} />
        </span>
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className={`min-w-0 truncate text-[13px] font-semibold tracking-tight transition-all duration-200 ${active ? 'text-white' : ''}`}>{label}</span>
          {badge !== undefined && badge > 0 && (
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700'}`}>
              {badge}
            </span>
          )}
          {target === 'compliance' && (
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              active ? 'bg-white/25 text-white' : zatcaReady ? 'bg-emerald-100 text-emerald-700' : 'bg-[var(--ios-accent-soft)] text-[var(--ios-accent)]'
            }`}>
              {zatcaReady ? 'Sync' : 'Test'}
            </span>
          )}
        </span>
      </button>
    );
  };

  if (!activated) {
    return (
      <ToastProvider>
        <Activation onActivated={handleActivated} />
      </ToastProvider>
    );
  }

  if (!setupComplete) {
    return <SetupWizard onComplete={completeSetup} />;
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  const bottomTabs: Array<{ target: View; icon: LucideIcon; label: string }> = [
    { target: 'pos', icon: ShoppingCart, label: lang === 'ar' ? 'البيع' : 'POS' },
    { target: 'stock', icon: Package, label: lang === 'ar' ? 'المنتجات' : 'Stock' },
    { target: 'dashboard', icon: LayoutDashboard, label: lang === 'ar' ? 'التقارير' : 'Home' },
  ];

  return (
    <ToastProvider>
    <div className="ios-app flex h-screen overflow-hidden">
      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label={lang === 'ar' ? 'إغلاق التنقل' : 'Close navigation'}
          onClick={() => setMobileSidebarOpen(false)}
          className="ios-mobile-sidebar-backdrop"
        />
      )}
      <nav
        className={`ios-sidebar-shell ${mobileSidebarOpen ? 'ios-sidebar-shell-open' : ''} relative z-30 flex h-screen max-h-screen w-[260px] flex-shrink-0 flex-col overflow-hidden border-r border-[var(--ios-divider)]`}
        style={{ background: 'linear-gradient(180deg, #f8faf8 0%, #f3f5f2 100%)' }}
      >
        {/* Brand header */}
        <div className="flex-shrink-0 px-4 pb-3 pt-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--ios-accent)] shadow-[0_4px_14px_rgba(30,107,72,0.32)]">
              <img src={APP_LOGO_DATA_URL} alt="Baqala OS" className="h-5 w-5 object-contain brightness-0 invert" />
            </div>
            <div className="min-w-0 flex-1">
              <h1
                onClick={handleBrandTap}
                onDoubleClick={openDeveloperConsole}
                className="cursor-default truncate text-[15px] font-extrabold tracking-tight text-[var(--ios-text)]"
                title="Double tap for developer reporting"
              >
                {lang === 'ar' ? 'بقالة أو إس' : 'Baqala OS'}
              </h1>
              <p className="truncate text-[10px] font-semibold text-[var(--ios-tertiary)]">{databaseLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="ios-mobile-sidebar-close ml-auto shrink-0"
              aria-label={lang === 'ar' ? 'إغلاق القائمة' : 'Close menu'}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Nav sections */}
        <div
          ref={sidebarRef}
          onScroll={event => { sidebarScrollTopRef.current = event.currentTarget.scrollTop; }}
          className="flex-1 overflow-y-auto px-3 pb-3 no-scrollbar"
        >
          {navigationSections.map((section, si) => (
            <div key={section.title} className={si > 0 ? 'mt-4' : 'mt-1'}>
              <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--ios-tertiary)]">{section.title}</p>
              <div className="space-y-0.5">
                {section.items.map(item => (
                  <React.Fragment key={item.target}>
                    <NavButton target={item.target} icon={item.icon} label={item.label} shortcut={item.shortcut} />
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer — branch + user */}
        <div className="flex-shrink-0 p-3 pt-0">
          <div className="rounded-2xl border border-[var(--ios-divider)] bg-white p-3 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
            {/* Offline badge + shift button */}
            <div className="mb-2.5 flex items-center gap-2">
              {!isOnline && (
                <div className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  {lang === 'ar' ? 'غير متصل' : 'Offline'}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowShiftManager(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--ios-fill)] px-2.5 py-1.5 text-xs font-bold text-[var(--ios-text)] hover:bg-[var(--ios-accent-soft)] hover:text-[var(--ios-accent)] transition-colors"
              >
                <Clock size={12} />
                {lang === 'ar' ? 'الوردية' : 'Shift'}
              </button>
            </div>
            {/* Branch */}
            <div className="mb-2.5 flex items-center gap-2 rounded-xl bg-[var(--ios-fill)] px-2.5 py-2">
              <Store size={12} className="shrink-0 text-[var(--ios-accent)]" />
              <p className="min-w-0 flex-1 truncate text-[12px] font-bold tracking-tight text-[var(--ios-text)]">
                {lang === 'ar' ? (activeBranch?.nameAr || activeBranch?.nameEn) : (activeBranch?.nameEn || activeBranch?.nameAr) || (lang === 'ar' ? 'اختر فرعاً' : 'No branch')}
              </p>
            </div>
            {/* User row */}
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ios-accent)] text-[12px] font-bold text-white">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-bold tracking-tight text-[var(--ios-text)]" title={currentUser.name}>{currentUser.name}</p>
                <p className="truncate text-[10px] font-semibold capitalize text-[var(--ios-tertiary)]">{currentUser.role}</p>
              </div>
              <button
                onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')}
                className="flex h-8 min-h-0 w-8 items-center justify-center rounded-xl bg-[var(--ios-fill)] text-[11px] font-extrabold text-[var(--ios-text)] shadow-none"
              >
                {lang === 'en' ? 'AR' : 'EN'}
              </button>
              <button
                onClick={handleLogout}
                className="flex h-8 min-h-0 w-8 items-center justify-center rounded-xl bg-red-50 text-[#C2412D] shadow-none"
                aria-label={lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[var(--ios-bg)]">
        {(() => {
          const act = getActivation();
          if (act?.plan === 'trial') {
            const days = trialDaysLeft(act);
            return (
              <div className={`z-30 px-4 py-2 text-center text-xs font-semibold ${days <= 3 ? 'bg-[#C2412D] text-white' : 'bg-[var(--ios-accent-soft)] text-[var(--ios-accent)]'}`}>
                {days > 0
                  ? (lang === 'ar'
                    ? `التجربة: ${days} يوم متبقٍ — الترخيص عبر ${SUPPORT_EMAIL}`
                    : `Trial: ${days} day${days === 1 ? '' : 's'} remaining — license at ${SUPPORT_EMAIL}`)
                  : (lang === 'ar' ? 'انتهت التجربة — يرجى شراء ترخيص لمتابعة بقالة' : 'Trial expired — purchase a license to continue using Baqala OS')}
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
            <span className="text-sm font-bold">{lang === 'ar' ? 'بقالة' : APP_NAME}</span>
          </button>
          <div className="ms-auto hidden min-w-0 items-center gap-2 lg:flex">
            {CustomerDisplayService.isAvailable() && (
              <button
                type="button"
                onClick={() => CustomerDisplayService.open()}
                title={lang === 'ar' ? 'فتح شاشة العميل' : 'Open customer display'}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ios-fill)] text-[var(--ios-secondary)] hover:bg-[var(--ios-accent-soft)] hover:text-[var(--ios-accent)] transition-colors"
              >
                <Monitor size={16} />
              </button>
            )}
            <Store size={15} className="shrink-0 text-[var(--ios-secondary)]" />
            <select
              value={activeBranchId}
              onChange={event => handleBranchSwitch(event.target.value)}
              className="ios-input min-h-0 h-10 min-w-[180px] py-0 text-xs font-bold"
              title={lang === 'ar' ? 'الفرع النشط' : 'Active branch'}
            >
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>
                  {lang === 'ar' ? branch.nameAr || branch.nameEn : branch.nameEn}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div key={view} className="baqala-main-scroll relative flex-1 overflow-hidden animate-tab-in">
          {view === 'pos' && (
            <POS
              products={products}
              customers={customers}
              lang={lang}
              onCheckout={handleCheckout}
              shiftOpen={true}
              config={config}
            />
          )}

          {view === 'dashboard' && (
            <Dashboard transactions={transactions} products={products} lang={lang} dataVersion={dataVersion} />
          )}

          {view === 'stock' && (
            <div className="h-full overflow-hidden">
              <Inventory
                products={products}
                onAddProduct={handleAddProduct}
                onInventoryChange={refreshData}
                lang={lang}
              />
            </div>
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

          {view === 'customers' && (
            <Customers customers={customers} setCustomers={setCustomers} lang={lang} />
          )}

          {view === 'credit' && (
            <CreditBook lang={lang} />
          )}

          {view === 'deals' && (
            <Deals lang={lang} products={products} />
          )}

          {view === 'expenses' && (
            <Expenses lang={lang} onExpensesChange={refreshData} />
          )}

          {view === 'staff' && (
            <StaffCompliance lang={lang} />
          )}

          {view === 'adminPortal' && currentUser.role === 'administrator' && (
            <AdminPortal lang={lang} />
          )}

          {view === 'branches' && currentUser.role === 'administrator' && (
            <Branches lang={lang} onChange={refreshData} />
          )}

          {view === 'invoices' && (
            <Orders
              transactions={transactions}
              lang={lang}
              currentUser={currentUser}
              onRefund={refreshData}
              onReprint={(sale) => { setCurrentTransaction(sale); setShowReceipt(true); }}
            />
          )}

          {view === 'settings' && (
            <Settings lang={lang} onUpdate={refreshData} />
          )}

          {view === 'compliance' && (
            <Compliance lang={lang} />
          )}

          {view === 'zreport' && (
            <ZReport lang={lang} />
          )}
        </div>

        <nav className="baqala-bottom-tabs" aria-label={lang === 'ar' ? 'التنقل السريع' : 'Quick navigation'}>
          {bottomTabs.map(tab => {
            const Icon = tab.icon;
            const active = view === tab.target;
            return (
              <button
                key={tab.target}
                type="button"
                onClick={() => handleViewChange(tab.target)}
                className={`baqala-bottom-tab ${active ? 'baqala-bottom-tab-active' : ''}`}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </main>

      {showReceipt && currentTransaction && (
        <ReceiptModal
          transaction={currentTransaction}
          customer={customers.find(c => c.id === currentTransaction.customerId)}
          onClose={() => setShowReceipt(false)}
          config={config}
          lang={lang}
        />
      )}

      {showShiftManager && (
        <ShiftManager
          lang={lang}
          onClose={() => setShowShiftManager(false)}
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
