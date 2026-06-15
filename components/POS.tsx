
import React, { useState, useEffect, useRef } from 'react';
import { Product, CartItem, Language, Category, Customer, HeldCart, Transaction, StoreConfig } from '../types';
import { TRANSLATIONS } from '../constants';
import { StorageService } from '../services/storageService';
import { calculateSaleTotals } from '../services/pricing';
import { firstError, positiveNumber, requiredText } from '../services/validationService';
import { Search, Plus, Minus, Trash2, ShoppingCart, CreditCard, Banknote, ScanBarcode, User, PauseCircle, Percent, History, RotateCcw, Check, X, Keyboard, StickyNote, Box, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';

interface POSProps {
  products: Product[];
  customers: Customer[];
  lang: Language;
  onCheckout: (items: CartItem[], method: 'cash' | 'card' | 'credit', customerId?: string, discount?: number, note?: string, earnedPoints?: number, preCalculated?: { subtotal: number; vat: number; total: number; selectiveTaxAmount: number }, paymentApprovalReference?: string) => void;
  shiftOpen: boolean;
  config?: StoreConfig;
}

const POS: React.FC<POSProps> = ({ products, customers, lang, onCheckout, shiftOpen, config }) => {
  const t = TRANSLATIONS[lang];
  const { toast } = useToast();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | 'All'>('All');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [discount, setDiscount] = useState<number>(0);
  const [note, setNote] = useState<string>('');
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [showHeldModal, setShowHeldModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  
  // Custom Item
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  const [customItemPrice, setCustomItemPrice] = useState<number>(0);
  const [customItemName, setCustomItemName] = useState('');

  // Payment Confirmation State
  const [checkoutModal, setCheckoutModal] = useState<{show: boolean, method: 'cash' | 'card' | 'credit' | null}>({ show: false, method: null });
  const [amountTendered, setAmountTendered] = useState<number>(0);
  const [paymentApprovalReference, setPaymentApprovalReference] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const hardware = StorageService.getHardwareConfig();

  // Keyboard Shortcuts & Barcode Scanner globally
  useEffect(() => {
     let rawBarcode = '';
     let lastKeyStrokeTime = Date.now();

     const handleKeyDown = (e: KeyboardEvent) => {
        const activeEl = document.activeElement;
        const isInputActive = activeEl && (
           activeEl.tagName === 'INPUT' || 
           activeEl.tagName === 'TEXTAREA' || 
           activeEl.tagName === 'SELECT'
        );

        // Cashier shortcuts: keep them available even when the barcode field is focused.
        if (e.key === 'F2') {
           e.preventDefault();
           barcodeInputRef.current?.focus();
           return;
        }
        if (e.key === 'F3') {
           e.preventDefault();
           searchInputRef.current?.focus();
           return;
        }
        if (e.key === 'F4' && cart.length > 0) {
           e.preventDefault();
           handlePaymentInitiate('cash');
           return;
        }
        if (e.key === 'F6' && cart.length > 0) {
           e.preventDefault();
           handlePaymentInitiate('credit');
           return;
        }
        if (e.key === 'F8' && cart.length > 0) {
           e.preventDefault();
           handlePaymentInitiate('card');
           return;
        }
        if (e.key === 'F9' && cart.length > 0) {
           e.preventDefault();
           handleHoldCart();
           return;
        }
        if (e.key === 'F10' && cart.length > 0) {
           e.preventDefault();
           clearCart();
           return;
        }
        if (e.key === 'Escape') {
           setCheckoutModal({ show: false, method: null });
           setShowHeldModal(false);
           setShowHistory(false);
           setShowNoteModal(false);
           setShowCustomItemModal(false);
           setConfirmDialog(null);
           return;
        }

        // Barcode auto sensing
        const now = Date.now();
        const elapsed = now - lastKeyStrokeTime;
        lastKeyStrokeTime = now;

        if (elapsed > 50) {
           rawBarcode = '';
        }

        if (e.key === 'Enter') {
           if (rawBarcode.length >= (hardware.barcodeMinLength || 4)) {
              e.preventDefault();
              const p = products.find(prod => prod.barcode === rawBarcode);
              if (p) {
                 addToCart(p);
                 if (activeEl === barcodeInputRef.current && barcodeInputRef.current) {
                    barcodeInputRef.current.value = '';
                 }
              } else {
                 toast(lang === 'ar' ? `المنتج ذو الباركود ${rawBarcode} غير موجود` : `Barcode not found: ${rawBarcode}`, 'warning');
              }
              rawBarcode = '';
              return;
           }
        } else if (e.key.length === 1 && /^[0-9a-zA-Z\-]$/.test(e.key)) {
           if (!isInputActive || activeEl === barcodeInputRef.current) {
              rawBarcode += e.key;
           }
        }
     };
     window.addEventListener('keydown', handleKeyDown);
     return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, cart, lang, shiftOpen]);

  // Beep Sound
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1000;
      gain.gain.value = 0.1;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1);
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      // Audio can be unavailable on locked-down Windows terminals.
    }
  };

  useEffect(() => {
    setHeldCarts(StorageService.getHeldCarts());
    setRecentTransactions(StorageService.getTransactions().slice(0, 20));
  }, []);

  const addToCart = (product: Product) => {
    if (!shiftOpen) {
      toast(lang === 'ar' ? 'الرجاء فتح الوردية أولاً' : 'Please open shift first', 'warning');
      return;
    }

    // Only check stock for non-custom items
    if (product.category !== Category.MISC && product.stock <= 0) {
       toast(lang === 'ar' ? 'نفذت الكمية' : 'Out of stock', 'warning');
       return;
    }

    playBeep();

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (product.category !== Category.MISC && existing.quantity >= product.stock) {
           toast(lang === 'ar' ? 'الكمية غير متوفرة' : 'Not enough stock', 'warning');
           return prev;
        }
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const addCustomItem = (e: React.FormEvent) => {
     e.preventDefault();
     const error = firstError(
       requiredText(customItemName, lang === 'ar' ? 'اسم المنتج' : 'Custom item name'),
       positiveNumber(customItemPrice, lang === 'ar' ? 'سعر البيع' : 'Custom item price')
     );
     if (error) {
       toast(error, 'error');
       return;
     }
     const item: Product = {
        id: `misc-${Date.now()}`,
        nameEn: customItemName.trim(),
        nameAr: customItemName.trim(),
        price: customItemPrice,
        category: Category.MISC,
        stock: 9999,
        barcode: '',
        image: ''
     };
     addToCart(item);
     setShowCustomItemModal(false);
     setCustomItemName('');
     setCustomItemPrice(0);
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        // Check stock limit when increasing (skip for misc)
        if (delta > 0 && item.category !== Category.MISC) {
           const product = products.find(p => p.id === id);
           if (product && item.quantity >= product.stock) {
               toast(lang === 'ar' ? 'الكمية غير متوفرة' : 'Not enough stock', 'warning');
               return item;
           }
        }
        return { ...item, quantity: Math.max(0, item.quantity + delta) };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const barcode = barcodeInputRef.current?.value;
    if (barcode) {
      const product = products.find(p => p.barcode === barcode);
      if (product) {
        addToCart(product);
        setSearchTerm('');
        if (barcodeInputRef.current) {
            barcodeInputRef.current.value = '';
            barcodeInputRef.current.focus();
        }
      } else {
        toast(lang === 'ar' ? 'المنتج غير موجود' : 'Product not found', 'error');
        if (barcodeInputRef.current) barcodeInputRef.current.value = '';
      }
    }
  };

  const handleHoldCart = () => {
    if (cart.length === 0) return;
    const hold: HeldCart = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      items: cart,
      customerName: selectedCustomer?.name || 'Guest'
    };
    const updated = StorageService.saveHeldCart(hold);
    setHeldCarts(updated);
    setCart([]);
    setSelectedCustomer(null);
    setDiscount(0);
    setNote('');
  };

  const clearCart = () => {
    setCart([]);
    setSelectedCustomer(null);
    setDiscount(0);
    setNote('');
  };

  const handleRecallCart = (heldCart: HeldCart) => {
    setCart(heldCart.items);
    const updated = StorageService.removeHeldCart(heldCart.id);
    setHeldCarts(updated);
    setShowHeldModal(false);
  };

  const handleRefund = (transaction: Transaction) => {
    if (!StorageService.hasPermission('refund')) {
      toast(lang === 'ar' ? 'ليست لديك صلاحية الاسترجاع' : 'You do not have permission to refund sales', 'error');
      return;
    }
    if (recentTransactions.some(tx => tx.isRefund && tx.refundOf === transaction.id)) {
      toast(lang === 'ar' ? 'تم استرجاع هذه الفاتورة مسبقاً' : 'This invoice already has a linked refund', 'warning');
      return;
    }
    setConfirmDialog({
      title: lang === 'ar' ? 'تأكيد الاسترجاع' : 'Confirm refund',
      message: t.refund + ' ' + transaction.id.slice(-6) + '?',
      danger: true,
      onConfirm: () => {
        const refundTx: Transaction = {
          ...transaction,
          id: 'REF-' + Date.now().toString(),
          timestamp: Date.now(),
          isRefund: true,
          refundOf: transaction.id,
          total: -transaction.total,
          subtotal: -transaction.subtotal,
          vat: -transaction.vat,
          status: 'refunded'
        };
        StorageService.saveTransaction(refundTx);
        setRecentTransactions(StorageService.getTransactions().slice(0, 20));
        setConfirmDialog(null);
        toast(lang === 'ar' ? 'تم الاسترجاع بنجاح' : 'Refund processed successfully', 'success');
      }
    });
  };

  // --- Payment Logic ---
  const handlePaymentInitiate = async (method: 'cash' | 'card' | 'credit') => {
      if (cart.length === 0) return;
      
      if (method === 'credit' && !selectedCustomer) {
        toast(lang === 'ar' ? 'الرجاء اختيار عميل للدفع الآجل' : 'Please select a customer for credit payment', 'warning');
        return;
      }

      setCheckoutModal({ show: true, method });
      setAmountTendered(0);
      setPaymentApprovalReference('');
  };

  const calculateTotals = () => calculateSaleTotals(cart, discount);

  const processPayment = (overrideMethod?: 'cash' | 'card' | 'credit', overrideReference?: string) => {
    const totals = calculateTotals();
    const method = overrideMethod || checkoutModal.method;
    const approvalReference = overrideReference || paymentApprovalReference.trim();
    if (!method) return;
    const confirmMessage = lang === 'ar'
      ? `تأكيد إصدار الفاتورة؟\n\nالإجمالي: ${totals.total.toFixed(2)} ر.س\nطريقة الدفع: ${method === 'card' ? 'مدى / بطاقة' : method === 'credit' ? 'آجل' : 'نقدي'}`
      : `Confirm this bill?\n\nTotal: ${totals.total.toFixed(2)} SAR\nPayment: ${method === 'card' ? 'Card' : method === 'credit' ? 'Credit' : 'Cash'}`;
    
    if (method === 'cash' && amountTendered < totals.total) {
       toast(lang === 'ar' ? 'المبلغ المدفوع غير كاف' : 'Insufficient Amount Tendered', 'error');
       return;
    }

    if (method === 'card' && hardware.requireCardApprovalReference && !approvalReference) {
       toast(lang === 'ar' ? 'أدخل رقم موافقة عملية البطاقة' : 'Enter the card terminal approval/reference number', 'warning');
       return;
    }

    setConfirmDialog({
      title: lang === 'ar' ? 'تأكيد إصدار الفاتورة' : 'Confirm bill',
      message: confirmMessage,
      onConfirm: () => {
        onCheckout(cart, method, selectedCustomer?.id, discount, note, undefined, totals, approvalReference || undefined);
        if (method === 'cash' && hardware.cashDrawerEnabled) {
          StorageService.testCashDrawer();
        }
        
        // Clear and Reset
        setCart([]);
        setDiscount(0);
        setNote('');
        setSelectedCustomer(null);
        setCheckoutModal({ show: false, method: null });
        setConfirmDialog(null);
      }
    });
  };

  const normalizeArabic = (str: string) => {
    return str
      .replace(/[أإآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[\u064B-\u0652]/g, ''); // strip Tashkeel
  };

  const filteredProducts = products.filter(p => {
    const term = normalizeArabic(searchTerm.toLowerCase());
    const nameEn = p.nameEn.toLowerCase();
    const nameAr = normalizeArabic(p.nameAr);
    const barcode = p.barcode;
    const matchesSearch = nameEn.includes(term) || nameAr.includes(term) || barcode.includes(term);
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const { subtotal, vat, selectiveTaxAmount, total } = calculateTotals();

  return (
    <div className="flex h-full flex-col md:flex-row bg-gray-100">
      {/* LEFT SIDE: Products */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Top Bar */}
        <div className="bg-white p-4 shadow-sm z-10">
          <div className="flex gap-4 mb-4">
            <form onSubmit={handleBarcodeSubmit} className="flex-1 relative">
              <input 
                 ref={barcodeInputRef}
                 autoFocus
                 className="w-full pl-12 pr-4 py-3 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-primary-500 transition-all text-gray-900"
                 placeholder={t.scanBarcode}
              />
              <ScanBarcode className={`absolute ${lang === 'ar' ? 'right-4' : 'left-4'} top-3.5 text-gray-500`} />
            </form>
            <div className="relative flex-1">
               <input 
                  ref={searchInputRef}
                  className="w-full pl-10 pr-4 py-3 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-primary-500 transition-all text-gray-900"
                  placeholder={`${t.search} (F3)`}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
               />
               <Search className={`absolute ${lang === 'ar' ? 'right-3' : 'left-3'} top-3.5 text-gray-400`} size={20} />
            </div>
          </div>
          
          {/* Categories */}
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            <button 
              onClick={() => setSelectedCategory('All')}
              className={`px-4 py-2 rounded-lg whitespace-nowrap text-sm font-medium transition-colors
                ${selectedCategory === 'All' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              All
            </button>
            {Object.values(Category).map(cat => (
              <button 
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-lg whitespace-nowrap text-sm font-medium transition-colors
                  ${selectedCategory === cat ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-20">
            {/* Custom Item Button */}
            <button 
                onClick={() => setShowCustomItemModal(true)}
                className="bg-primary-50 border-2 border-dashed border-primary-200 p-3 rounded-xl shadow-sm hover:bg-primary-100 transition-all flex flex-col items-center text-center justify-center min-h-[160px]"
            >
                <div className="w-16 h-16 mb-2 rounded-full bg-primary-200 flex items-center justify-center text-primary-600">
                    <Box size={32} />
                </div>
                <h3 className="font-bold text-primary-800 text-sm">{t.miscItem}</h3>
            </button>

            {filteredProducts.map(product => {
              const threshold = config?.lowStockThreshold ?? 5;
              const isOutOfStock = product.stock <= 0;
              const isLowStock = product.stock > 0 && product.stock <= threshold;

              return (
                <button
                  key={product.id}
                  disabled={isOutOfStock}
                  onClick={() => addToCart(product)}
                  className={`p-3 rounded-2xl flex flex-col items-center text-center group border min-h-[160px] relative btn-spring
                    ${isOutOfStock
                      ? 'bg-red-50/10 border-red-200 opacity-60 cursor-not-allowed'
                      : isLowStock
                        ? 'bg-amber-50/20 border-amber-300 shadow shadow-amber-100/40 hover:border-amber-400 hover:shadow-md low-stock-pulse'
                        : 'bg-white/80 border-slate-100 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-100/50 shadow-sm backdrop-blur-sm'}`}
                >
                  <div className="w-24 h-24 mb-3 rounded-lg bg-gray-50 overflow-hidden relative">
                     {product.image ? (
                        <img src={product.image} className={`w-full h-full object-cover mix-blend-multiply ${isOutOfStock ? 'grayscale' : ''}`} loading="lazy" />
                     ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                           <Box size={36} />
                        </div>
                     )}
                     <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                     
                     {/* Stock Badge */}
                     {isOutOfStock ? (
                        <div className="absolute top-1 right-1 bg-red-600 text-white text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                           {t.outOfStock}
                        </div>
                     ) : isLowStock ? (
                        <div className="absolute top-1 right-1 bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 shadow-sm">
                           <AlertTriangle size={10} />
                           <span>{product.stock}</span>
                        </div>
                     ) : product.stock <= 15 ? (
                        <div className="absolute top-1 right-1 bg-green-500 text-white text-[10px] px-1.5 rounded-full font-bold">
                           {product.stock}
                        </div>
                     ) : null}
                  </div>
                  <h3 className="font-bold text-gray-800 text-sm line-clamp-2 h-10 leading-tight">
                    {lang === 'ar' ? product.nameAr : product.nameEn}
                  </h3>
                  
                  {isLowStock && (
                     <div className="mt-1 flex items-center justify-center gap-1 text-[11px] text-amber-700 font-semibold leading-none">
                        <AlertTriangle size={12} className="text-amber-500" />
                        <span>{lang === 'ar' ? 'منخفض' : 'Low stock'}</span>
                     </div>
                  )}

                  <div className="mt-2 text-primary-600 font-bold">
                    {product.price.toFixed(2)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: Cart */}
      <div className="w-full md:w-[400px] bg-white shadow-xl z-20 flex flex-col h-full border-l border-gray-200">
        
        {/* Customer & Actions */}
        <div className="p-4 border-b bg-gray-50">
           <div className="flex justify-between items-center mb-3">
              <div className="flex gap-2">
                 <button onClick={() => setShowHeldModal(true)} className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-orange-50 text-orange-600 relative" title={t.holdCart}>
                    <PauseCircle size={20} />
                    {heldCarts.length > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />}
                 </button>
                 <button onClick={() => setShowHistory(true)} className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-blue-50 text-blue-600" title="History">
                    <History size={20} />
                 </button>
                 <button onClick={() => setShowNoteModal(true)} className={`p-2 bg-white border border-gray-300 rounded-lg hover:bg-yellow-50 ${note ? 'text-yellow-600' : 'text-gray-600'}`} title={t.addNote}>
                    <StickyNote size={20} />
                 </button>
              </div>
              <button 
                 onClick={clearCart} 
                 className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center gap-1"
              >
                 <Trash2 size={16} /> {t.clearCart}
              </button>
           </div>
           
           <div className="relative">
              <select 
                className="w-full p-2 pl-9 rounded-lg border border-gray-300 bg-white appearance-none text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                value={selectedCustomer?.id || ''}
                onChange={(e) => setSelectedCustomer(customers.find(c => c.id === e.target.value) || null)}
              >
                <option value="">{t.selectCustomer} (Walk-in)</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <User size={16} className={`absolute ${lang === 'ar' ? 'right-3' : 'left-3'} top-2.5 text-gray-500`} />
           </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50">
                <ShoppingCart size={48} className="mb-2" />
                <p>{t.noItems}</p>
                <div className="mt-8 grid grid-cols-2 gap-2 text-xs text-gray-500">
                   <div className="flex items-center gap-1"><Keyboard size={14}/> F2 Barcode</div>
                   <div className="flex items-center gap-1"><Keyboard size={14}/> F3 Search</div>
                   <div className="flex items-center gap-1"><Keyboard size={14}/> F4 Cash</div>
                   <div className="flex items-center gap-1"><Keyboard size={14}/> F6 Credit</div>
                   <div className="flex items-center gap-1"><Keyboard size={14}/> F8 Card</div>
                   <div className="flex items-center gap-1"><Keyboard size={14}/> F9 Hold</div>
                </div>
             </div>
          ) : (
             <div className="flex flex-col space-y-3">
                <AnimatePresence initial={false}>
                   {cart.map(item => (
                      <motion.div 
                         key={item.id} 
                         layout
                         initial={{ opacity: 0, x: 20 }}
                         animate={{ opacity: 1, x: 0 }}
                         exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0, paddingBottom: 0 }}
                         transition={{ type: "spring", stiffness: 450, damping: 30 }}
                         className="flex justify-between items-center group border-b border-gray-50 pb-2 overflow-hidden"
                      >
                         <div className="flex-1">
                            <div className="font-medium text-gray-900 text-sm">{lang === 'ar' ? item.nameAr : item.nameEn}</div>
                            <div className="text-xs text-gray-500">{item.price.toFixed(2)} x {item.quantity}</div>
                         </div>
                         <div className="flex items-center gap-3">
                            <div className="flex items-center bg-gray-100 rounded-lg">
                               <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-gray-200 rounded-l-lg transition-colors"><Minus size={14} /></button>
                               <motion.span 
                                  key={`${item.id}-${item.quantity}`}
                                  initial={{ scale: 0.8, color: "#22c55e" }}
                                  animate={{ scale: 1, color: "#111827" }}
                                  transition={{ duration: 0.12 }}
                                  className="w-8 text-center text-sm font-bold block"
                                >
                                  {item.quantity}
                               </motion.span>
                               <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-gray-200 rounded-r-lg transition-colors"><Plus size={14} /></button>
                            </div>
                            <div className="font-bold w-16 text-end text-sm text-gray-900">{(item.price * item.quantity).toFixed(2)}</div>
                         </div>
                      </motion.div>
                   ))}
                </AnimatePresence>
             </div>
          )}
        </div>

        {/* Totals & Checkout */}
        <div className="p-4 bg-gray-50 border-t space-y-3">
          <div className="space-y-1 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>{t.subtotal}</span>
              <span>{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
               <span className="flex items-center gap-1"><Percent size={14} /> {t.discount}</span>
               <div className="flex items-center gap-2">
                 {/* Quick discount buttons */}
                 <button onClick={() => setDiscount(subtotal * 0.05)} className="text-[10px] bg-gray-200 px-1 rounded hover:bg-gray-300 text-gray-800">5%</button>
                 <button onClick={() => setDiscount(subtotal * 0.10)} className="text-[10px] bg-gray-200 px-1 rounded hover:bg-gray-300 text-gray-800">10%</button>
                 <input 
                    type="number" 
                    className="w-20 text-end border-b bg-transparent focus:outline-none text-red-600 font-bold" 
                    value={discount} 
                    onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                 />
               </div>
            </div>
            <div className="flex justify-between">
              <span>{t.vat}</span>
              <span>{(total - (subtotal - discount)).toFixed(2)}</span>
            </div>
          </div>
          
          <div className="flex justify-between items-end pt-2 border-t border-gray-200">
            <span className="text-gray-500 font-medium">{t.total}</span>
            <span className="text-3xl font-bold text-gray-900">{total.toFixed(2)} <span className="text-sm font-normal text-gray-500">{t.currency}</span></span>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-2">
            <button 
              onClick={() => handlePaymentInitiate('cash')}
              disabled={cart.length === 0}
              className="flex flex-col items-center justify-center p-3 bg-green-600 text-white rounded-xl hover:bg-green-700 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
            >
              <Banknote size={24} className="mb-1" />
              <span className="text-xs font-bold">{t.payCash} (F4)</span>
            </button>
            <button 
              onClick={() => handlePaymentInitiate('card')}
              disabled={cart.length === 0}
              className="flex flex-col items-center justify-center p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
            >
              <CreditCard size={24} className="mb-1" />
              <span className="text-xs font-bold">{t.payCard} (F8)</span>
            </button>
            <button 
              onClick={() => handlePaymentInitiate('credit')}
              disabled={cart.length === 0}
              className="flex flex-col items-center justify-center p-3 bg-orange-600 text-white rounded-xl hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
            >
              <User size={24} className="mb-1" />
              <span className="text-xs font-bold">{t.payCredit} (F6)</span>
            </button>
          </div>
          <button onClick={handleHoldCart} disabled={cart.length === 0} className="w-full py-2 text-xs text-gray-500 hover:text-gray-700">{t.holdCart} (F9)</button>
        </div>
      </div>

      {/* --- MODALS --- */}

      {/* Custom Item Modal */}
      {showCustomItemModal && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
               <h3 className="font-bold text-lg mb-4 text-gray-800">{t.miscItem}</h3>
               <form onSubmit={addCustomItem} className="space-y-4">
                  <input 
                     placeholder={t.productNameEn}
                     className="w-full border p-2 rounded text-gray-900" 
                     value={customItemName} 
                     onChange={e => setCustomItemName(e.target.value)} 
                  />
                  <input 
                     type="number"
                     step="0.25"
                     required
                     autoFocus
                     placeholder={t.price}
                     className="w-full border p-2 rounded text-xl font-bold text-gray-900" 
                     value={customItemPrice || ''} 
                     onChange={e => setCustomItemPrice(parseFloat(e.target.value))} 
                  />
                  <div className="flex gap-2">
                     <button type="button" onClick={() => setShowCustomItemModal(false)} className="flex-1 py-2 bg-gray-100 text-gray-800 rounded">{t.cancel}</button>
                     <button type="submit" className="flex-1 py-2 bg-primary-600 text-white rounded">{t.addToCart}</button>
                  </div>
               </form>
            </div>
         </div>
      )}

      {/* Note Modal */}
      {showNoteModal && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
               <h3 className="font-bold text-lg mb-4 text-gray-800">{t.addNote}</h3>
               <textarea 
                  autoFocus
                  rows={4}
                  className="w-full border p-2 rounded text-gray-900" 
                  value={note} 
                  onChange={e => setNote(e.target.value)} 
                  placeholder="Order special instructions..."
               />
               <div className="flex gap-2 mt-4">
                  <button onClick={() => setShowNoteModal(false)} className="flex-1 py-2 bg-gray-100 text-gray-800 rounded">{t.save}</button>
               </div>
            </div>
         </div>
      )}

      {/* Payment Confirmation Modal */}
      {checkoutModal.show && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
               <div className="bg-gray-900 p-4 text-white flex justify-between items-center">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                     {checkoutModal.method === 'cash' ? <Banknote /> : checkoutModal.method === 'card' ? <CreditCard /> : <User />}
                     Confirm {checkoutModal.method?.toUpperCase()} Payment
                  </h3>
                  <button onClick={() => setCheckoutModal({show: false, method: null})} className="hover:bg-gray-700 p-1 rounded"><X size={20}/></button>
               </div>
               
               <div className="p-6">
                  <div className="text-center mb-6">
                     <p className="text-gray-500 text-sm mb-1">{t.totalWithVat}</p>
                     <div className="text-5xl font-bold text-gray-900">{total.toFixed(2)} <span className="text-lg text-gray-400">{t.currency}</span></div>
                  </div>

                  {checkoutModal.method === 'cash' && (
                     <div className="space-y-4">
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                           <label className="block text-sm font-semibold text-gray-700 mb-2">Amount Tendered</label>
                           <input 
                              type="number" 
                              autoFocus
                              className="w-full text-3xl font-bold bg-white border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-green-500 focus:outline-none text-gray-900"
                              placeholder="0.00"
                              value={amountTendered || ''}
                              onChange={e => setAmountTendered(parseFloat(e.target.value))}
                           />
                        </div>
                        
                        <div className="grid grid-cols-4 gap-2">
                           {[10, 50, 100, 500].map(val => (
                              <button 
                                 key={val} 
                                 onClick={() => setAmountTendered(val)}
                                 className="py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-gray-700 transition-colors"
                              >
                                 {val}
                              </button>
                           ))}
                        </div>

                        {amountTendered > 0 && (
                           <div className={`text-center p-3 rounded-xl font-bold text-lg border ${amountTendered >= total ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                              {amountTendered >= total ? `Change Due: ${(amountTendered - total).toFixed(2)}` : `Remaining: ${(total - amountTendered).toFixed(2)}`}
                           </div>
                        )}
                     </div>
                  )}

                  {checkoutModal.method === 'card' && (
                     <div className="space-y-4">
                        <div className="p-4 rounded-xl border text-center bg-blue-50 border-blue-200">
                           <div className="flex justify-center mb-2">
                              <CreditCard className="text-blue-800" size={32} />
                           </div>
                           <p className="text-sm font-bold text-blue-800">
                              External Card Terminal Approval Required
                           </p>
                           <p className="text-xs mt-1 text-blue-700">
                              Complete payment on the external mada/card terminal, then enter the approval, RRN, or reference number below.
                           </p>
                        </div>
                        <div>
                           <label className="block text-sm font-medium text-gray-700 mb-1">Approval / Reference Number</label>
                           <input
                              autoFocus
                              className="w-full border rounded-xl p-3 font-mono text-gray-900"
                              value={paymentApprovalReference}
                              onChange={e => setPaymentApprovalReference(e.target.value)}
                              placeholder="e.g. 123456 / RRN / auth code"
                           />
                        </div>
                     </div>
                  )}

                  <button
                     onClick={() => processPayment()}
                     className={`w-full mt-6 py-4 rounded-2xl text-white font-bold text-lg flex items-center justify-center gap-2 shadow-xl btn-spring
                        ${checkoutModal.method === 'cash' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30' :
                          checkoutModal.method === 'card' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/30' : 'bg-orange-600 hover:bg-orange-700 shadow-orange-600/30'}`}
                  >
                     <Check size={24} />
                     Confirm & Print
                  </button>
               </div>
            </div>
         </div>
      )}

      {/* Held Carts Modal */}
      {showHeldModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
               <h3 className="font-bold text-lg text-gray-800">{t.holdCart}</h3>
               <button onClick={() => setShowHeldModal(false)}><X size={20}/></button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {heldCarts.length === 0 ? <p className="text-center text-gray-500 py-4">No held carts.</p> : heldCarts.map(h => (
                <div key={h.id} className="border p-3 rounded-lg flex justify-between items-center bg-gray-50 hover:bg-white transition-colors">
                  <div>
                    <div className="font-bold text-gray-800">{h.customerName}</div>
                    <div className="text-xs text-gray-500">{new Date(h.timestamp).toLocaleTimeString()} - {h.items.length} items</div>
                  </div>
                  <button onClick={() => handleRecallCart(h)} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">{t.recallCart}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
               <div className="p-4 border-b flex justify-between items-center">
                  <h3 className="font-bold text-lg text-gray-800">{t.recentTransactions}</h3>
                  <button onClick={() => setShowHistory(false)}><X size={20}/></button>
               </div>
               <div className="overflow-y-auto flex-1">
                  <table className="w-full text-sm text-left">
                     <thead className="bg-gray-50 border-b">
                        <tr>
                           <th className="p-3 text-gray-700">ID</th>
                           <th className="p-3 text-gray-700">Time</th>
                           <th className="p-3 text-end text-gray-700">Total</th>
                           <th className="p-3 text-center text-gray-700">Action</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y">
                        {recentTransactions.map(tx => (
                           <tr key={tx.id} className={tx.isRefund ? 'bg-red-50' : ''}>
                              <td className="p-3 font-mono text-xs text-gray-600">{tx.id.slice(-6)}</td>
                              <td className="p-3 text-gray-800">{new Date(tx.timestamp).toLocaleTimeString()}</td>
                              <td className="p-3 text-end font-bold text-gray-900">{tx.total.toFixed(2)}</td>
                              <td className="p-3 text-center">
                                 {!tx.isRefund && (
                                    <button onClick={() => handleRefund(tx)} className="text-red-500 hover:bg-red-50 p-1 rounded" title="Refund">
                                       <RotateCcw size={16} />
                                    </button>
                                 )}
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
         </div>
      )}
      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        confirmLabel={lang === 'ar' ? 'تأكيد' : 'Confirm'}
        cancelLabel={lang === 'ar' ? 'إلغاء' : 'Cancel'}
        danger={confirmDialog?.danger}
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
};

export default POS;
