
import React, { useState, useRef } from 'react';
import { Product, Category, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { Search, Edit2, AlertCircle, Upload, X, Image as ImageIcon, Printer, Filter, FileSpreadsheet, History, MessageCircle, Tag, Trash2 } from 'lucide-react';
import ProductImagePicker from './ProductImagePicker';
import { StorageService } from '../services/storageService';
import { useToast } from './Toast';
import { downloadProductTemplate, parseProductImport } from '../services/importService';
import PurchaseInvoiceModal from './PurchaseInvoiceModal';
import { openPrintDocument } from '../services/printTemplates';
import { firstError, nonNegativeNumber, positiveNumber, requiredText } from '../services/validationService';
import { APP_LOGO_DATA_URL } from '../services/appLogo';
import ConfirmDialog from './ConfirmDialog';

interface InventoryProps {
  products: Product[];
  onAddProduct: (product: Product) => void;
  onInventoryChange: () => void;
  lang: Language;
}

const Inventory: React.FC<InventoryProps> = ({ products, onAddProduct, onInventoryChange, lang }) => {
  const { toast } = useToast();
  const t = TRANSLATIONS[lang];
  const [isAdding, setIsAdding] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState<Product | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState<'count' | 'damage' | 'expiry' | 'return' | 'manual'>('manual');
  const [showLabelModal, setShowLabelModal] = useState<Product | null>(null);
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const canDelete = StorageService.hasPermission('manage_settings');
  
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    category: Category.SNACKS,
    stock: 0,
    price: 0,
    costPrice: 0,
    expiryDate: '',
    image: ''
  });

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.nameEn.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.nameAr.includes(searchTerm) ||
      p.barcode.includes(searchTerm);
    const matchesLowStock = filterLowStock ? p.stock < 10 : true;
    return matchesSearch && matchesLowStock;
  });

  const importProducts = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = await parseProductImport(file);
      StorageService.importProducts(imported);
      onInventoryChange();
      toast(lang === 'ar' ? `✓ تم استيراد ${imported.length} منتج` : `✓ ${imported.length} products imported`, 'success');
    } catch (err: any) {
      toast(err.message || 'Product import failed.', 'error');
    } finally {
      event.target.value = '';
    }
  };

  const saveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAdjustModal || !adjustQty) return;
    StorageService.adjustStock({
      productId: showAdjustModal.id,
      quantityDelta: adjustQty,
      reason: adjustReason,
      note: ''
    });
    setShowAdjustModal(null);
    setAdjustQty(0);
    onInventoryChange();
    toast(lang === 'ar' ? '✓ تم تعديل المخزون' : '✓ Stock adjusted', 'success');
  };

  const handleDeleteProduct = () => {
    if (!deleteProduct) return;
    if (!canDelete) {
      toast(lang === 'ar' ? 'الحذف مسموح للمدير فقط' : 'Only administrator can delete.', 'error');
      return;
    }
    const updated = StorageService.deleteProduct(deleteProduct.id);
    setDeleteProduct(null);
    onInventoryChange();
    toast(lang === 'ar' ? 'تم حذف المنتج' : 'Product deleted', 'warning');
    return updated;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewProduct({ ...newProduct, image: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const error = firstError(
      requiredText(newProduct.nameEn, 'Product English name'),
      requiredText(newProduct.nameAr || newProduct.nameEn, 'Product Arabic name'),
      requiredText(newProduct.barcode, 'Barcode'),
      positiveNumber(newProduct.price, 'Selling price'),
      nonNegativeNumber(newProduct.costPrice ?? 0, 'Purchasing price'),
      nonNegativeNumber(newProduct.stock ?? 0, 'Stock')
    );
    if (error) {
      toast(lang === 'ar' ? `تحقق من البيانات: ${error}` : error, 'error');
      return;
    }
    if (products.some(product => product.barcode === newProduct.barcode)) {
      toast(lang === 'ar' ? 'الباركود مستخدم مسبقاً' : 'Barcode already exists', 'error');
      return;
    }
    try {
      onAddProduct({
        ...newProduct,
        id: Date.now().toString(),
        nameAr: newProduct.nameAr || newProduct.nameEn,
        barcode: newProduct.barcode!,
        image: newProduct.image || '',
        selectiveTax: newProduct.selectiveTax || 'none'
      } as Product);
      setIsAdding(false);
      setNewProduct({ category: Category.SNACKS, stock: 0, price: 0, costPrice: 0, image: '', selectiveTax: 'none' });
      toast(lang === 'ar' ? `✓ تمت إضافة ${newProduct.nameEn}` : `✓ ${newProduct.nameEn} added`, 'success');
    } catch (err: any) {
      toast(err.message || 'Unable to save product', 'error');
    }
  };

  /* ── WhatsApp Reorder ── */
  const sendWhatsAppReorder = (supplierPhone: string, supplierName: string, items: Product[]) => {
    const lines = items.map(p => `• ${p.nameAr || p.nameEn} (${lang === 'ar' ? 'متبقي' : 'stock'}: ${p.stock})`).join('\n');
    const msg = lang === 'ar'
      ? `السلام عليكم ${supplierName}،\nنرجو توفير المنتجات التالية:\n\n${lines}\n\nشكراً،`
      : `Hello ${supplierName},\nPlease supply the following items:\n\n${lines}\n\nThank you,`;
    const phone = supplierPhone.replace(/\D/g, '');
    window.open(`https://wa.me/${phone.startsWith('966') ? phone : '966' + phone.replace(/^0/, '')}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  /* ── Price Label Print ── */
  const printLabel = (product: Product) => {
    const config = StorageService.getConfig();
    const logo = `<img src="${config.logoDataUrl || APP_LOGO_DATA_URL}" class="logo" />`;
    const body = `<div class="label">
      <div class="top">${logo}<div class="store">${config.nameAr || config.nameEn}</div></div>
      <div class="name-ar">${product.nameAr || product.nameEn}</div>
      <div class="name-en">${product.nameEn}</div>
      <div class="price-row">
        <div>
          <div class="barcode">${product.barcode}</div>
        </div>
        <div style="display:flex;align-items:flex-end;gap:3px;">
          <div class="price">${product.price.toFixed(2)}</div>
          <div class="currency">ر.س</div>
        </div>
      </div>
    </div>`;
    openPrintDocument({
      title: lang === 'ar' ? 'بطاقة سعر' : 'Price Label',
      body,
      dir: 'rtl',
      width: 300,
      height: 260,
      compact: true,
      extraCss: `
        body{background:white;}
        .print-action{display:none;}
        .doc-page{margin:0;box-shadow:none;border:0;border-radius:0;max-width:none;}
        .doc-content{padding:0;}
        .label{width:62mm;height:40mm;border:1px solid #d1d5db;border-radius:3mm;padding:3mm;display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box;page-break-after:always;background:linear-gradient(180deg,#fff,#f8fafc);}
        .top{display:flex;align-items:center;justify-content:center;gap:2mm;}
        .logo{width:9mm;height:9mm;object-fit:contain;border:1px solid #eee;border-radius:2mm;padding:1mm;background:white;}
        .store{font-size:7pt;color:#666;text-align:center;font-weight:bold;}
        .name-ar{font-size:13pt;font-weight:bold;text-align:right;direction:rtl;line-height:1.2;}
        .name-en{font-size:8pt;color:#555;text-align:left;}
        .price-row{display:flex;justify-content:space-between;align-items:flex-end;}
        .price{font-size:22pt;font-weight:900;color:#10B981;}
        .currency{font-size:9pt;font-weight:bold;color:#10B981;margin-bottom:3px;}
        .barcode{font-size:8pt;letter-spacing:2px;color:#333;font-family:monospace;}
      `,
    });
  };

  const isExpiringSoon = (dateStr?: string) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const today = new Date();
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays < 30 && diffDays > 0;
  };
  
  const isExpired = (dateStr?: string) => {
      if (!dateStr) return false;
      return new Date(dateStr) < new Date();
  }

  return (
    <div className="p-6 h-full flex flex-col bg-gray-50">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">{t.inventory}</h2>
        <div className="flex flex-wrap gap-2 justify-end">
          <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importProducts} />
          <button onClick={downloadProductTemplate} className="bg-white border text-gray-700 px-3 py-2 rounded-lg flex items-center gap-2 text-sm"><FileSpreadsheet size={18} /> Template</button>
          <button onClick={() => importInputRef.current?.click()} className="bg-white border text-gray-700 px-3 py-2 rounded-lg flex items-center gap-2 text-sm"><Upload size={18} /> Import</button>
          <button onClick={() => setShowPurchaseModal(true)} className="bg-white border text-gray-700 px-3 py-2 rounded-lg flex items-center gap-2 text-sm">+ {lang === 'ar' ? 'فاتورة شراء' : 'Purchase'}</button>
          <button onClick={() => setShowHistory(true)} className="bg-white border text-gray-700 px-3 py-2 rounded-lg flex items-center gap-2 text-sm"><History size={18} /> History</button>
          <button
            onClick={() => setIsAdding(true)}
            className="bg-[#1E6B48] hover:bg-[#18583b] text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-bold shadow-md shadow-emerald-700/20 btn-spring"
          >
            <Edit2 size={16} /> {lang === 'ar' ? '+ منتج جديد' : '+ Add Product'}
          </button>
          <button
            onClick={() => setShowReorderModal(true)}
            className="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-xl flex items-center gap-2 text-sm btn-spring shadow-md shadow-green-500/25"
            title={lang === 'ar' ? 'إرسال طلب للمورد عبر واتساب' : 'Send WhatsApp reorder to supplier'}
          >
            <MessageCircle size={16} /> {lang === 'ar' ? 'طلب واتساب' : 'WA Reorder'}
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
         <div className="relative flex-1">
            <input 
               type="text" 
               placeholder={t.search} 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all bg-white text-gray-900 shadow-sm"
            />
            <Search className={`absolute ${lang === 'ar' ? 'right-3' : 'left-3'} top-3.5 text-gray-400`} size={20} />
         </div>
         <button 
            onClick={() => setFilterLowStock(!filterLowStock)}
            className={`px-4 rounded-xl border flex items-center gap-2 font-medium transition-colors ${filterLowStock ? 'bg-orange-100 border-orange-200 text-orange-700' : 'bg-white border-gray-200 text-gray-600'}`}
         >
            <Filter size={18} />
            {t.lowStock}
         </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 overflow-hidden flex flex-col">
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="p-4 font-semibold text-gray-600 w-16">Image</th>
                <th className="p-4 font-semibold text-gray-600">{t.productNameEn} / {t.productNameAr}</th>
                <th className="p-4 font-semibold text-gray-600">{t.category}</th>
                <th className="p-4 font-semibold text-gray-600">{t.price}</th>
                <th className="p-4 font-semibold text-gray-600">{t.cost}</th>
                <th className="p-4 font-semibold text-gray-600">{t.stock}</th>
                <th className="p-4 font-semibold text-gray-600">{t.expiryDate}</th>
                <th className="p-4 font-semibold text-gray-600 text-end">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="text-gray-400 text-sm font-semibold">
                      {searchTerm || filterLowStock
                        ? (lang === 'ar' ? 'لا توجد منتجات تطابق البحث' : 'No products match your search')
                        : (lang === 'ar' ? 'لا توجد منتجات بعد — أضف أول منتج' : 'No products yet — add your first product')}
                    </div>
                    {!searchTerm && !filterLowStock && (
                      <button
                        onClick={() => setIsAdding(true)}
                        className="mt-4 bg-[#1E6B48] text-white px-5 py-2 rounded-xl text-sm font-bold"
                      >
                        {lang === 'ar' ? '+ أضف منتجاً' : '+ Add Product'}
                      </button>
                    )}
                  </td>
                </tr>
              )}
              {filteredProducts.map(p => {
                  const expiring = isExpiringSoon(p.expiryDate);
                  const expired = isExpired(p.expiryDate);
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <div className="w-10 h-10 rounded bg-gray-100 overflow-hidden flex items-center justify-center">
                          {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={16} className="text-gray-400" />}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-medium text-gray-900">{p.nameEn}</div>
                        <div className="text-sm text-gray-500">{p.nameAr}</div>
                        <div className="text-xs text-gray-400 font-mono">{p.barcode}</div>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium text-gray-600">
                          {p.category}
                        </span>
                      </td>
                      <td className="p-4 font-semibold text-emerald-700">{p.price.toFixed(2)}</td>
                      <td className="p-4 font-semibold text-blue-700">{(p.costPrice || 0).toFixed(2)}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${p.stock < 10 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                          {p.stock}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-700">
                          {p.expiryDate ? (
                              <div className="flex items-center gap-1">
                                  <span>{p.expiryDate}</span>
                                  {expired && <span className="text-xs bg-red-500 text-white px-1 rounded">{t.expired}</span>}
                                  {expiring && !expired && <AlertCircle size={14} className="text-orange-500" />}
                              </div>
                          ) : '-'}
                      </td>
                      <td className="p-4 text-end flex justify-end gap-2">
                        <button
                          onClick={() => printLabel(p)}
                          className="text-gray-400 hover:text-emerald-600 transition-colors btn-spring"
                          title={lang === 'ar' ? 'طباعة بطاقة السعر' : 'Print Price Label'}
                        >
                          <Tag size={18} />
                        </button>
                        <button onClick={() => setShowAdjustModal(p)} className="text-gray-400 hover:text-primary-600 transition-colors btn-spring" title="Adjust Stock">
                          <Edit2 size={18} />
                        </button>
                        {canDelete && (
                          <button onClick={() => setDeleteProduct(p)} className="text-gray-400 hover:text-red-600 transition-colors btn-spring" title={t.deleteProduct}>
                            <Trash2 size={18} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4 text-gray-800">{t.addNewProduct}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Image Picker (auto-fetch + upload) */}
              <ProductImagePicker
                imageUrl={newProduct.image || ''}
                barcode={newProduct.barcode}
                nameEn={newProduct.nameEn}
                lang={lang}
                onChange={url => setNewProduct(p => ({ ...p, image: url }))}
                onBarcodeFound={(nameEn, nameAr) => setNewProduct(p => ({
                  ...p,
                  nameEn: p.nameEn || nameEn,
                  nameAr: p.nameAr || nameAr,
                }))}
                onFileUpload={url => setNewProduct(p => ({ ...p, image: url }))}
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t.productNameEn}</label>
                  <input required className="w-full border rounded-lg p-2 bg-white text-gray-900" value={newProduct.nameEn || ''} onChange={e => setNewProduct({...newProduct, nameEn: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t.productNameAr}</label>
                  <input className="w-full border rounded-lg p-2 text-right bg-white text-gray-900" value={newProduct.nameAr || ''} onChange={e => setNewProduct({...newProduct, nameAr: e.target.value})} />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t.price}</label>
                  <input required type="number" step="0.25" className="w-full border rounded-lg p-2 bg-white text-gray-900" value={newProduct.price || ''} onChange={e => setNewProduct({...newProduct, price: parseFloat(e.target.value)})} />
                </div>
                 <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t.cost}</label>
                  <input type="number" step="0.25" className="w-full border rounded-lg p-2 bg-white text-gray-900" value={newProduct.costPrice || ''} onChange={e => setNewProduct({...newProduct, costPrice: parseFloat(e.target.value)})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t.stock}</label>
                  <input required type="number" className="w-full border rounded-lg p-2 bg-white text-gray-900" value={newProduct.stock || ''} onChange={e => setNewProduct({...newProduct, stock: parseInt(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t.category}</label>
                  <select 
                      className="w-full border rounded-lg p-2 bg-white text-gray-900"
                      value={newProduct.category}
                      onChange={e => setNewProduct({...newProduct, category: e.target.value as Category})}
                  >
                      {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t.barcode}</label>
                    <input required className="w-full border rounded-lg p-2 font-mono bg-white text-gray-900" value={newProduct.barcode || ''} onChange={e => setNewProduct({...newProduct, barcode: e.target.value.trim()})} />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t.expiryDate}</label>
                    <input type="date" className="w-full border rounded-lg p-2 bg-white text-gray-900" value={newProduct.expiryDate || ''} onChange={e => setNewProduct({...newProduct, expiryDate: e.target.value})} />
                 </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tax Classification</label>
                <select
                  className="w-full border rounded-lg p-2 bg-white text-gray-900"
                  value={newProduct.selectiveTax || 'none'}
                  onChange={e => setNewProduct({...newProduct, selectiveTax: e.target.value as Product['selectiveTax']})}
                >
                  <option value="none">VAT only</option>
                  <option value="energy">Energy drink selective tax</option>
                  <option value="tobacco">Tobacco selective tax</option>
                </select>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setIsAdding(false)} className="flex-1 py-2 border rounded-lg hover:bg-gray-50 text-gray-700">{t.cancel}</button>
                <button type="submit" className="flex-1 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 shadow-md shadow-emerald-600/25 btn-spring">{t.save}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPurchaseModal && (
        <PurchaseInvoiceModal
          products={products}
          lang={lang}
          onSaved={() => { onInventoryChange(); setShowPurchaseModal(false); }}
          onClose={() => setShowPurchaseModal(false)}
        />
      )}

      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-xl font-bold mb-2 text-gray-800">Adjust Stock</h3>
            <p className="text-sm text-gray-500 mb-4">{showAdjustModal.nameEn}</p>
            <form onSubmit={saveAdjustment} className="space-y-3">
              <input required type="number" className="w-full border rounded p-2" placeholder="+10 or -2" value={adjustQty || ''} onChange={e => setAdjustQty(parseInt(e.target.value) || 0)} />
              <select className="w-full border rounded p-2" value={adjustReason} onChange={e => setAdjustReason(e.target.value as any)}>
                <option value="manual">Manual</option>
                <option value="count">Stock Count</option>
                <option value="damage">Damage</option>
                <option value="expiry">Expiry</option>
                <option value="return">Return</option>
              </select>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAdjustModal(null)} className="flex-1 py-2 border rounded">Cancel</button>
                <button className="flex-1 py-2 bg-emerald-600 text-white rounded-xl font-bold shadow-md shadow-emerald-600/25 btn-spring">Apply</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── WhatsApp Reorder Modal ── */}
      {showReorderModal && (() => {
        const threshold = StorageService.getConfig()?.lowStockThreshold ?? 10;
        const lowStock = products.filter(p => p.stock < threshold);
        const suppliers = StorageService.getSuppliers();

        // Group low-stock items by supplierId
        const grouped: Record<string, Product[]> = { unassigned: [] };
        lowStock.forEach(p => {
          if (p.supplierId) {
            grouped[p.supplierId] = grouped[p.supplierId] || [];
            grouped[p.supplierId].push(p);
          } else {
            grouped.unassigned.push(p);
          }
        });

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
              <div className="p-5 bg-gradient-to-r from-green-600 to-emerald-600 text-white flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 font-black text-lg"><MessageCircle size={20} /> {lang === 'ar' ? 'طلب مخزون عبر واتساب' : 'WhatsApp Reorder'}</div>
                  <p className="text-green-100 text-xs mt-0.5">{lowStock.length} {lang === 'ar' ? 'منتج منخفض المخزون' : 'low-stock items'}</p>
                </div>
                <button onClick={() => setShowReorderModal(false)} className="hover:bg-white/20 p-1.5 rounded-lg"><X size={20} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {lowStock.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <p className="text-lg font-semibold">✅ {lang === 'ar' ? 'جميع المنتجات متوفرة' : 'All products well-stocked!'}</p>
                    <p className="text-sm mt-1">{lang === 'ar' ? `لا يوجد منتجات أقل من ${threshold} وحدة` : `No products below ${threshold} units`}</p>
                  </div>
                ) : (
                  Object.entries(grouped).map(([suppId, items]) => {
                    if (items.length === 0) return null;
                    const supplier = suppliers.find(s => s.id === suppId);
                    return (
                      <div key={suppId} className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between">
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{supplier?.name || (lang === 'ar' ? 'بدون مورد' : 'No supplier assigned')}</p>
                            {supplier?.phone && <p className="text-xs text-slate-400">{supplier.phone}</p>}
                          </div>
                          {supplier?.phone ? (
                            <button
                              onClick={() => sendWhatsAppReorder(supplier.phone!, supplier.name, items)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-bold btn-spring"
                            >
                              <MessageCircle size={13} /> Send
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">{lang === 'ar' ? 'أضف رقم هاتف المورد' : 'Add supplier phone'}</span>
                          )}
                        </div>
                        <div className="divide-y divide-slate-100">
                          {items.map(p => (
                            <div key={p.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                              <span className="text-slate-700">{lang === 'ar' ? p.nameAr : p.nameEn}</span>
                              <span className={`font-bold px-2 py-0.5 rounded-full text-xs ${p.stock === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                {p.stock === 0 ? (lang === 'ar' ? 'نفد' : 'OUT') : `${p.stock} ${lang === 'ar' ? 'متبقي' : 'left'}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-4 border-t bg-slate-50">
                <p className="text-xs text-slate-400 text-center">
                  {lang === 'ar' ? '* اضغط "Send" لفتح واتساب مع رسالة الطلب تلقائياً' : '* Press Send to open WhatsApp with a pre-filled order message'}
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {showHistory && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800">Stock Adjustment History</h3>
              <button onClick={() => setShowHistory(false)}><X size={20} /></button>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="p-2 text-left">Date</th><th className="p-2 text-left">Product</th><th className="p-2">Qty</th><th className="p-2">Reason</th><th className="p-2 text-left">User</th></tr></thead>
              <tbody>
                {StorageService.getStockAdjustments().map(adj => (
                  <tr key={adj.id} className="border-b">
                    <td className="p-2">{new Date(adj.timestamp).toLocaleString()}</td>
                    <td className="p-2">{adj.productName}</td>
                    <td className={`p-2 text-center font-bold ${adj.quantityDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>{adj.quantityDelta}</td>
                    <td className="p-2 text-center">{adj.reason}</td>
                    <td className="p-2">{adj.user}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!deleteProduct}
        title={lang === 'ar' ? 'حذف المنتج؟' : 'Delete product?'}
        message={deleteProduct
          ? (lang === 'ar' ? `سيتم حذف ${deleteProduct.nameAr || deleteProduct.nameEn} من المخزون. هل تريد المتابعة؟` : `${deleteProduct.nameEn} will be removed from inventory. Continue?`)
          : ''}
        confirmLabel={lang === 'ar' ? 'حذف' : 'Delete'}
        cancelLabel={lang === 'ar' ? 'إلغاء' : 'Cancel'}
        danger
        onConfirm={handleDeleteProduct}
        onCancel={() => setDeleteProduct(null)}
      />
    </div>
  );
};

export default Inventory;
