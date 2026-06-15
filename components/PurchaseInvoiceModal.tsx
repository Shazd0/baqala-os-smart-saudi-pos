import React, { useState, useCallback } from 'react';
import { useToast } from './Toast';
import { Category, Language, Product, PurchaseInvoice, PurchaseInvoiceLine, Supplier } from '../types';
import { StorageService } from '../services/storageService';
import { PackagePlus, Plus, Printer, Save, Trash2, X } from 'lucide-react';
import ProductImagePicker from './ProductImagePicker';
import { openPrintDocument } from '../services/printTemplates';
import { firstError, positiveNumber, requiredText } from '../services/validationService';
import { APP_LOGO_DATA_URL } from '../services/appLogo';

interface PurchaseInvoiceModalProps {
  products: Product[];
  lang: Language;
  onSaved: () => void;
  onClose: () => void;
  editInvoice?: PurchaseInvoice | null;
}

const NEW_PRODUCT_SENTINEL = '__NEW_PRODUCT__';

interface NewProductDraft {
  lineKey: number;
  nameEn: string;
  nameAr: string;
  barcode: string;
  price: number;
  costPrice: number;
  category: Category;
  image: string;
}

interface DraftLine {
  key: number;
  productId: string;
  quantity: number;
  caseSize: number;
  unitCost: number;
}

const formatSar = (n: number) => `${n.toFixed(2)} ر.س`;

function localDateInput(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateInputToLocalMs(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
}

const PurchaseInvoiceModal: React.FC<PurchaseInvoiceModalProps> = ({
  products,
  lang,
  onSaved,
  onClose,
  editInvoice,
}) => {
  const { toast } = useToast();
  const suppliers: Supplier[] = StorageService.getSuppliers();
  const config = StorageService.getConfig();
  // Index last purchase data per product for auto-fill
  const lastPurchaseByProduct = React.useMemo(() => {
    const map: Record<string, {
      caseSize: number;
      unitCost: number;
      unitCostPerItem?: number;
      isCostInclusive?: boolean;
    }> = {};
    const all = StorageService.getPurchaseInvoices();
    // Oldest first so newest overwrites
    for (const inv of [...all].reverse()) {
      for (const l of inv.lines) {
        map[l.productId] = {
          caseSize: l.caseSize ?? 1,
          unitCost: l.unitCost,
          unitCostPerItem: l.unitCostPerItem,
          isCostInclusive: (l as any).isCostInclusive,
        };
      }
    }
    return map;
  }, []);

  const [supplierId, setSupplierId] = useState(editInvoice?.supplierId ?? '');
  const [invoiceNumber, setInvoiceNumber] = useState(editInvoice?.invoiceNumber ?? '');
  const [invoiceDate, setInvoiceDate] = useState(
    editInvoice ? localDateInput(new Date(editInvoice.date)) : localDateInput()
  );
  const [note, setNote] = useState(editInvoice?.note ?? '');
  const [lines, setLines] = useState<DraftLine[]>(
    editInvoice?.lines.length
      ? editInvoice.lines.map((l, i) => ({ key: i, productId: l.productId, quantity: l.quantity, caseSize: l.caseSize ?? 1, unitCost: l.unitCost }))
      : [{ key: 0, productId: '', quantity: 1, caseSize: 1, unitCost: 0 }]
  );
  const [nextKey, setNextKey] = useState(editInvoice?.lines.length ?? 1);
  const [saved, setSaved] = useState<PurchaseInvoice | null>(editInvoice ?? null);
  // View-only mode when opening an existing invoice — go straight to print tab
  const isViewOnly = !!editInvoice;
  const [tab, setTab] = useState<'entry' | 'print'>(isViewOnly ? 'print' : 'entry');
  const [saving, setSaving] = useState(false);
  const [localProducts, setLocalProducts] = useState<Product[]>(products);
  const [newProductDraft, setNewProductDraft] = useState<NewProductDraft | null>(null);
  /** When true the user enters VAT-inclusive unit prices; we back-calculate ex-VAT */
  const [pricesIncludeVat, setPricesIncludeVat] = useState(false);
  const VAT_RATE = 0.15;

  const selectedSupplier = suppliers.find(s => s.id === supplierId);

  const addLine = () => {
    setLines(prev => [...prev, { key: nextKey, productId: '', quantity: 1, caseSize: 1, unitCost: 0 }]);
    setNextKey(k => k + 1);
  };

  const removeLine = (key: number) => setLines(prev => prev.filter(l => l.key !== key));

  const updateLine = (key: number, field: keyof Omit<DraftLine, 'key'>, value: string | number) => {
    if (field === 'productId' && value === NEW_PRODUCT_SENTINEL) {
      setNewProductDraft({ lineKey: key, nameEn: '', nameAr: '', barcode: '', price: 0, costPrice: 0, category: Category.SNACKS, image: '' });
      return;
    }
    setLines(prev =>
      prev.map(l => {
        if (l.key !== key) return l;
        const updated = { ...l, [field]: value };
        if (field === 'productId' && typeof value === 'string') {
          const hist = lastPurchaseByProduct[value];
          if (hist) {
            updated.caseSize = hist.caseSize ?? 1;
            // New records store unitCost as purchasing price per unit.
            if ((hist as any).isCostInclusive !== undefined) {
              const wasInclusive = (hist as any).isCostInclusive as boolean;
              if (wasInclusive === pricesIncludeVat) {
                updated.unitCost = hist.unitCost;
              } else if (pricesIncludeVat) {
                // hist was exclusive, user now wants inclusive display
                updated.unitCost = hist.unitCost * (1 + VAT_RATE);
              } else {
                // hist was inclusive, user now wants exclusive display
                updated.unitCost = hist.unitCost / (1 + VAT_RATE);
              }
            } else if (hist.unitCostPerItem) {
              updated.unitCost = pricesIncludeVat ? hist.unitCostPerItem : hist.unitCostPerItem / (1 + VAT_RATE);
            } else {
              updated.unitCost = hist.unitCost;
            }
          } else {
            const product = localProducts.find(p => p.id === value);
            if (product?.costPrice) {
              updated.unitCost = pricesIncludeVat ? product.costPrice : product.costPrice / (1 + VAT_RATE);
            }
          }
        }
        return updated;
      })
    );
  };

  const handleSaveNewProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductDraft) return;
    const draft = newProductDraft;
    const error = firstError(
      requiredText(draft.nameEn, 'Product English name'),
      requiredText(draft.nameAr || draft.nameEn, 'Product Arabic name'),
      requiredText(draft.barcode, 'Barcode'),
      positiveNumber(draft.price, 'Selling price'),
      positiveNumber(draft.costPrice, 'Purchasing price')
    );
    if (error) {
      toast(lang === 'ar' ? `تحقق من بيانات المنتج: ${error}` : error, 'error');
      return;
    }
    const newProduct: Product = {
      id: 'P-' + Date.now(),
      nameEn: draft.nameEn.trim(),
      nameAr: draft.nameAr.trim() || draft.nameEn.trim(),
      barcode: draft.barcode.trim(),
      price: draft.price,
      costPrice: draft.costPrice,
      stock: 0,
      category: draft.category,
      image: draft.image || '',
      expiryDate: '',
    };
    StorageService.saveProduct(newProduct);
    const refreshed = StorageService.getProducts();
    setLocalProducts(refreshed);
    setLines(prev =>
      prev.map(l => {
        if (l.key !== draft.lineKey) return l;
        return { ...l, productId: newProduct.id, unitCost: pricesIncludeVat ? draft.costPrice || 0 : (draft.costPrice || 0) / (1 + VAT_RATE) };
      })
    );
    setNewProductDraft(null);
  };

  // rawTotal = sum of entered unit prices × total units (may be inclusive or exclusive)
  const rawTotal = lines.reduce((sum, l) => sum + (l.quantity * (l.caseSize || 1) * l.unitCost), 0);
  // subtotal is always the ex-VAT base for ZATCA; grandTotal is what you actually pay
  const subtotal    = pricesIncludeVat ? rawTotal / (1 + VAT_RATE) : rawTotal;
  const vatAmount   = subtotal * VAT_RATE;
  const grandTotal  = subtotal + vatAmount;   // equals rawTotal when inclusive

  const buildInvoice = useCallback((): PurchaseInvoice | null => {
    if (!supplierId || !selectedSupplier) return null;
    if (!invoiceNumber.trim() || !invoiceDate) return null;
    const validLines = lines.filter(l => l.productId && l.quantity > 0 && l.caseSize > 0 && l.unitCost > 0);
    if (validLines.length !== lines.length || validLines.length === 0) return null;
    return {
      id: editInvoice?.id ?? '',
      supplierId,
      supplierName: selectedSupplier.name,
      supplierVatNumber: selectedSupplier.vatNumber,
      invoiceNumber: invoiceNumber || `PINV-${Date.now()}`,
      date: dateInputToLocalMs(invoiceDate),
      subtotal,
      vat: vatAmount,
      total: grandTotal,
      note: note || undefined,
      lines: validLines.map(l => {
        const product = localProducts.find(p => p.id === l.productId)!;
        const cs = l.caseSize > 0 ? l.caseSize : 1;
        // Store the ENTERED value as unitCost so auto-fill next time returns the same number.
        return {
          productId: l.productId,
          productName: product?.nameEn ?? l.productId,
          quantity: l.quantity,
          caseSize: cs,
          totalUnits: l.quantity * cs,
          unitCost: l.unitCost,
          // unitCostPerItem = inclusive cost per individual unit (used as product's costPrice)
          unitCostPerItem: pricesIncludeVat ? l.unitCost : l.unitCost * (1 + VAT_RATE),
          isCostInclusive: pricesIncludeVat,
          total: l.quantity * cs * l.unitCost,
        };
      }),
    };
  }, [supplierId, selectedSupplier, lines, localProducts, invoiceNumber, invoiceDate, subtotal, vatAmount, grandTotal, note, editInvoice, pricesIncludeVat]);

  const handleSave = () => {
    const invoice = buildInvoice();
    if (!invoice) {
      toast(lang === 'ar' ? 'كل الحقول مطلوبة: المورد، رقم الفاتورة، المنتج، الكمية، حجم الكرتون، والتكلفة يجب أن تكون صحيحة' : 'All fields are required: supplier, invoice number, product, quantity, case size, and cost must be valid.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const result = StorageService.savePurchaseInvoice(invoice);
      // Use the saved invoice (with server-assigned ID) from the result; fall back to local copy
      const persisted: PurchaseInvoice = result?.invoices?.[0] ?? { ...invoice, id: invoice.id || ('PINV-' + Date.now()) };
      setSaved(persisted);
      onSaved();
      setTab('print');
      toast(
        lang === 'ar' ? `✓ تم حفظ الفاتورة ${persisted.invoiceNumber}` : `✓ Invoice ${persisted.invoiceNumber} saved`,
        'success'
      );
    } catch (err) {
      toast(lang === 'ar' ? `خطأ في الحفظ: ${String(err)}` : `Save error: ${String(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    const purchase = document.getElementById('printable-purchase');
    openPrintDocument({
      title: 'فاتورة ضريبية للمشتريات',
      body: purchase?.innerHTML || '',
      dir: 'rtl',
      width: 920,
      height: 760,
      autoPrint: true,
      extraCss: `
        .doc-hero { display: none; }
        .doc-content { padding: 0; }
        .doc-page { max-width: 820px; }
        .purchase-logo { width: 46px !important; height: 46px !important; border-radius: 14px !important; }
        #printable-purchase { padding: 18px !important; max-width: 760px !important; }
        table th, table td { vertical-align: middle; }
      `,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b bg-slate-900 text-white rounded-t-2xl">
          <div>
            <h2 className="text-xl font-bold">
              {lang === 'ar' ? 'فاتورة شراء ضريبية' : 'Purchase Tax Invoice'}
            </h2>
            <p className="text-slate-300 text-xs mt-0.5">
              {isViewOnly
                ? (lang === 'ar' ? 'عرض الفاتورة — للقراءة فقط' : 'Invoice view — read only')
                : (lang === 'ar' ? 'أدخل بيانات الفاتورة ثم احفظها وأطبعها' : 'Enter details, save, then print')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!isViewOnly && (
              <button
                onClick={() => setTab('entry')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'entry' ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >
                {lang === 'ar' ? 'الإدخال' : 'Entry'}
              </button>
            )}
            <button
              disabled={!saved}
              onClick={() => setTab('print')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'print' ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white hover:bg-white/20 disabled:opacity-40'}`}
            >
              {lang === 'ar' ? 'الطباعة' : 'Print'}
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Entry Tab */}
        {tab === 'entry' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">

            {/* VAT-inclusive toggle */}
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
              <input
                id="vatIncl"
                type="checkbox"
                checked={pricesIncludeVat}
                onChange={e => setPricesIncludeVat(e.target.checked)}
                className="w-4 h-4 accent-amber-600"
              />
              <label htmlFor="vatIncl" className="text-amber-800 font-medium cursor-pointer">
                {lang === 'ar'
                  ? 'الأسعار المُدخلة تشمل ضريبة القيمة المضافة (15%) — سيتم الخصم تلقائياً'
                  : 'Prices entered are VAT-inclusive (15%) — system will back-calculate ex-VAT'}
              </label>
            </div>

            {/* Header fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {lang === 'ar' ? 'المورد' : 'Supplier'} *
                </label>
                <select
                  required
                  className="w-full border rounded-xl p-3 text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value)}
                >
                  <option value="">{lang === 'ar' ? '-- اختر المورد --' : '-- Select supplier --'}</option>
                  {suppliers.map((s, si) => (
                    <option key={s.id || `sup-${si}`} value={s.id}>
                      {s.name} {s.vatNumber ? `(${s.vatNumber})` : ''}
                    </option>
                  ))}
                </select>
                {selectedSupplier?.vatNumber && (
                  <p className="text-xs text-emerald-700 mt-1">
                    {lang === 'ar' ? 'الرقم الضريبي للمورد:' : 'Supplier VAT:'} {selectedSupplier.vatNumber}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {lang === 'ar' ? 'رقم الفاتورة' : 'Invoice No.'}
                </label>
                <input
                  className="w-full border rounded-xl p-3 text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="INV-001"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {lang === 'ar' ? 'تاريخ الفاتورة' : 'Invoice Date'}
                </label>
                <input
                  type="date"
                  className="w-full border rounded-xl p-3 text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                />
              </div>
            </div>

            {/* Lines Table */}
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-3 text-start font-semibold text-gray-700 w-[32%]">
                      {lang === 'ar' ? 'المنتج' : 'Product'}
                    </th>
                    <th className="p-3 text-center font-semibold text-gray-700 w-[10%]">
                      {lang === 'ar' ? 'عدد الكراتين' : 'Cases'}
                    </th>
                    <th className="p-3 text-center font-semibold text-gray-700 w-[12%]">
                      <div>{lang === 'ar' ? 'حجم الكرتون' : 'Case Size'}</div>
                      <div className="text-[10px] font-normal text-gray-400">{lang === 'ar' ? '(وحدة/كرتون)' : '(units/case)'}</div>
                    </th>
                    <th className="p-3 text-center font-semibold text-emerald-700 w-[10%]">
                      <div>{lang === 'ar' ? 'إجمالي الوحدات' : 'Total Units'}</div>
                      <div className="text-[10px] font-normal text-gray-400">{lang === 'ar' ? '(للمخزون)' : '(to stock)'}</div>
                    </th>
                    <th className="p-3 text-center font-semibold text-gray-700 w-[18%]">
                      <div>{lang === 'ar' ? 'سعر الشراء/وحدة (ر.س)' : 'Purchasing Price/Unit (SAR)'}</div>
                      {pricesIncludeVat && (
                        <div className="text-[10px] font-normal text-amber-600">{lang === 'ar' ? 'شامل الضريبة' : 'incl. VAT'}</div>
                      )}
                    </th>
                    <th className="p-3 text-end font-semibold text-gray-700 w-[13%]">
                      <div>{lang === 'ar' ? 'الإجمالي' : 'Line Total'}</div>
                      <div className="text-[10px] font-normal text-gray-400">
                        {pricesIncludeVat
                          ? (lang === 'ar' ? 'شامل الضريبة' : 'incl. VAT')
                          : (lang === 'ar' ? 'بدون ضريبة' : 'excl. VAT')}
                      </div>
                    </th>
                    <th className="p-3 w-[5%]" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((line, lineIdx) => {
                    const cs = line.caseSize > 0 ? line.caseSize : 1;
                    const totalUnits = line.quantity * cs;
                    const inclusiveCostPerUnit = pricesIncludeVat
                      ? line.unitCost
                      : line.unitCost * (1 + VAT_RATE);
                    const lineTotal = totalUnits * line.unitCost;
                    return (
                      <tr key={line.key} className="hover:bg-gray-50">
                        {/* Product */}
                        <td className="p-2">
                          <select
                            required
                            className="w-full border rounded-lg p-2 text-gray-900 text-sm focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                            value={line.productId}
                            onChange={e => updateLine(line.key, 'productId', e.target.value)}
                          >
                            <option value="">{lang === 'ar' ? '-- اختر منتجاً --' : '-- Select product --'}</option>
                            <option value={NEW_PRODUCT_SENTINEL}>
                              {lang === 'ar' ? '➕ منتج جديد...' : '➕ Create new product...'}
                            </option>
                            {localProducts.map((p, pi) => (
                              <option key={p.id || `p-${pi}`} value={p.id}>
                                {lang === 'ar' ? p.nameAr : p.nameEn}
                              </option>
                            ))}
                          </select>
                        </td>
                        {/* Cases (qty of packs/cartons) */}
                        <td className="p-2">
                          <input
                            type="number"
                            min="1"
                            className="w-full border rounded-lg p-2 text-center text-gray-900 text-sm focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                            value={line.quantity}
                            onChange={e => updateLine(line.key, 'quantity', parseInt(e.target.value) || 1)}
                          />
                        </td>
                        {/* Case size (units per case) */}
                        <td className="p-2">
                          <input
                            type="number"
                            min="1"
                            className="w-full border rounded-lg p-2 text-center text-gray-900 text-sm focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                            value={line.caseSize}
                            onChange={e => updateLine(line.key, 'caseSize', parseInt(e.target.value) || 1)}
                          />
                        </td>
                        {/* Total units — read-only, highlighted */}
                        <td className="p-2 text-center">
                          <div className="bg-emerald-50 border border-emerald-200 rounded-lg py-2 px-1 text-center">
                            <span className="font-bold text-emerald-800 text-sm">{totalUnits}</span>
                            {cs > 1 && (
                              <div className="text-[10px] text-emerald-600">
                                {line.quantity}×{cs}
                              </div>
                            )}
                          </div>
                        </td>
                        {/* Purchasing price per unit */}
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-full border rounded-lg p-2 text-center text-gray-900 text-sm focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                            value={line.unitCost}
                            onChange={e => updateLine(line.key, 'unitCost', parseFloat(e.target.value) || 0)}
                          />
                          {line.unitCost > 0 && (
                            <div className="text-[10px] text-center mt-0.5 space-y-0.5">
                              {cs > 1 && (
                                <div className="text-emerald-700 font-semibold">
                                  {lang === 'ar' ? 'شامل/وحدة:' : 'Inclusive/unit:'}{' '}
                                  <strong>{inclusiveCostPerUnit.toFixed(4)}</strong>
                                  <span className="text-gray-400 font-normal"> {lang === 'ar' ? '(شامل)' : '(incl.)'}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        {/* Line total = total units × entered unit price */}
                        <td className="p-2 text-end font-semibold text-gray-800">
                          {lineTotal.toFixed(2)}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeLine(line.key)}
                            disabled={lines.length === 1}
                            className="text-red-400 hover:text-red-600 disabled:opacity-30"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="p-3 border-t bg-gray-50">
                <button
                  type="button"
                  onClick={addLine}
                  className="flex items-center gap-2 text-emerald-700 font-medium text-sm hover:text-emerald-900"
                >
                  <Plus size={16} />
                  {lang === 'ar' ? 'إضافة بند' : 'Add line'}
                </button>
              </div>
            </div>

            {/* Totals + Note */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {lang === 'ar' ? 'ملاحظة' : 'Note'}
                </label>
                <textarea
                  rows={3}
                  className="w-full border rounded-xl p-3 text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none text-sm"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </div>
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm border">

                {/* When inclusive: show the "you pay" total first */}
                {pricesIncludeVat && (
                  <div className="flex justify-between font-bold text-gray-900 pb-2 border-b">
                    <span>{lang === 'ar' ? 'الإجمالي المدفوع (شامل الضريبة)' : 'Total you pay (incl. VAT)'}</span>
                    <span>{grandTotal.toFixed(2)} SAR</span>
                  </div>
                )}

                <div className="flex justify-between text-gray-500">
                  <span>{lang === 'ar' ? 'المجموع بدون الضريبة' : 'Subtotal (excl. VAT)'}</span>
                  <span className="font-medium text-gray-800">{subtotal.toFixed(2)} SAR</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>{lang === 'ar' ? 'ضريبة القيمة المضافة 15%' : 'VAT 15%'}</span>
                  <span className="font-semibold text-amber-700">+ {vatAmount.toFixed(2)} SAR</span>
                </div>

                {/* When exclusive: show the grand total last */}
                {!pricesIncludeVat && (
                  <div className="flex justify-between border-t pt-2 text-base font-bold text-gray-900">
                    <span>{lang === 'ar' ? 'الإجمالي شامل الضريبة' : 'Grand Total (incl. VAT)'}</span>
                    <span>{grandTotal.toFixed(2)} SAR</span>
                  </div>
                )}

                <p className="text-[11px] text-emerald-700 pt-1 font-medium">
                  {lang === 'ar'
                    ? '✓ ضريبة المدخلات قابلة للاسترداد في إقرار الضريبة'
                    : '✓ Input VAT reclaimable in your VAT return'}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-6 py-2.5 border rounded-xl text-gray-700 hover:bg-gray-50">
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-2 shadow disabled:opacity-50"
              >
                <Save size={18} />
                {lang === 'ar' ? 'حفظ الفاتورة' : 'Save Invoice'}
              </button>
            </div>
          </div>
        )}

        {/* Print Tab */}
        {tab === 'print' && saved && (
          <div className="flex-1 overflow-y-auto">
            <div className="flex justify-end gap-2 p-4 border-b print:hidden bg-gray-50">
              <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white rounded-xl font-bold">
                <Printer size={18} />
                {lang === 'ar' ? 'طباعة الفاتورة' : 'Print Invoice'}
              </button>
            </div>

            {/* Printable Arabic purchase bill */}
            <div id="printable-purchase" dir="rtl" lang="ar" className="receipt-font p-6 max-w-2xl mx-auto text-gray-900">
              {/* Title */}
              <div className="rounded-2xl bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-700 text-white p-4 mb-5 shadow-lg print:shadow-none">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="purchase-logo h-12 w-12 rounded-2xl bg-white shadow-md flex items-center justify-center overflow-hidden flex-shrink-0">
                      <img src={config.logoDataUrl || APP_LOGO_DATA_URL} alt="Store logo" className="h-full w-full object-contain p-1.5" />
                    </div>
                    <div>
                      <h2 className="font-black text-xl leading-tight">فاتورة ضريبية للمشتريات</h2>
                      <p className="text-xs text-emerald-100" dir="ltr">PURCHASE TAX INVOICE</p>
                    </div>
                  </div>
                  <div className="text-left text-xs text-emerald-100" dir="ltr">
                    <div className="font-bold text-white">{config.nameEn || config.nameAr}</div>
                    <div>{new Date(saved.date).toLocaleDateString('ar-SA')}</div>
                  </div>
                </div>
              </div>

              {/* Parties */}
              <div className="grid grid-cols-2 gap-4 mb-5 text-sm">
                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                  <p className="font-bold text-gray-500 text-xs mb-1 uppercase tracking-wide">المشتري (Buyer)</p>
                  <p className="font-bold text-gray-900">{config.nameAr || config.nameEn}</p>
                  <p className="text-gray-600">الرقم الضريبي: {config.vatNumber}</p>
                  {config.phone && <p className="text-gray-600">الجوال: {config.phone}</p>}
                  {config.address && <p className="text-gray-600">{config.address}</p>}
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="font-bold text-gray-500 text-xs mb-1 uppercase tracking-wide">المورد (Supplier)</p>
                  <p className="font-bold text-gray-900">{saved.supplierName}</p>
                  {saved.supplierVatNumber && (
                    <p className="text-gray-600">الرقم الضريبي: {saved.supplierVatNumber}</p>
                  )}
                </div>
              </div>

              {/* Invoice meta */}
              <div className="grid grid-cols-2 gap-2 mb-5 text-sm border border-slate-200 rounded-xl p-3 bg-slate-50">
                <div>
                  <span className="text-gray-500">رقم الفاتورة: </span>
                  <span className="font-bold" dir="ltr">{saved.invoiceNumber}</span>
                </div>
                <div>
                  <span className="text-gray-500">التاريخ: </span>
                  <span className="font-bold">{new Date(saved.date).toLocaleDateString('ar-SA')}</span>
                </div>
              </div>

              {/* Lines — always show ex-VAT amounts per ZATCA requirement */}
              <table className="w-full text-sm mb-5 border border-slate-200 rounded-xl overflow-hidden">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="py-2 text-start">الصنف</th>
                    <th className="py-2 text-center">الكراتين</th>
                    <th className="py-2 text-center">الوحدات</th>
                    <th className="py-2 text-center">سعر الوحدة (بدون ضريبة)</th>
                    <th className="py-2 text-end">إجمالي (بدون ضريبة)</th>
                  </tr>
                </thead>
                <tbody>
                  {saved.lines.map((line, i) => {
                    const product = localProducts.find(p => p.id === line.productId);
                    const totalUnits = line.totalUnits ?? line.quantity * (line.caseSize ?? 1);
                    const inclusive = (line as any).isCostInclusive as boolean | undefined;
                    // Always display ex-VAT on the invoice regardless of entry mode
                    const exVatPerUnit = inclusive ? line.unitCost / (1 + 0.15) : line.unitCost;
                    const exVatLineTotal = totalUnits * exVatPerUnit;
                    return (
                      <tr key={i} className="border-b border-dashed border-gray-200 odd:bg-white even:bg-slate-50">
                        <td className="py-2">
                          <div className="font-medium">{product?.nameAr || line.productName}</div>
                          {product?.nameEn && product.nameEn !== product?.nameAr && (
                            <div className="text-[10px] text-gray-400" dir="ltr">{product.nameEn}</div>
                          )}
                          <div className="text-[10px] text-emerald-700">
                            سعر الشراء للوحدة (شامل): {formatSar(line.unitCostPerItem ?? exVatPerUnit * 1.15)}
                          </div>
                        </td>
                        <td className="py-2 text-center">{line.quantity}</td>
                        <td className="py-2 text-center font-bold text-emerald-700">{totalUnits}</td>
                        <td className="py-2 text-center">{formatSar(exVatPerUnit)}</td>
                        <td className="py-2 text-end font-semibold">{formatSar(exVatLineTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Totals */}
              <div className="border border-emerald-100 rounded-2xl bg-gradient-to-br from-slate-50 to-emerald-50 p-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>المجموع الخاضع للضريبة</span>
                  <span className="font-semibold">{formatSar(saved.subtotal)}</span>
                </div>
                <div className="flex justify-between text-amber-700 border-b border-dashed border-gray-200 pb-2">
                  <span>ضريبة القيمة المضافة (15%)</span>
                  <span className="font-semibold">{formatSar(saved.vat)}</span>
                </div>
                <div className="flex justify-between text-lg font-black text-gray-900 pt-2 px-3 py-2 bg-white border border-emerald-100 rounded-xl">
                  <span>الإجمالي شامل الضريبة</span>
                  <span>{formatSar(saved.total)}</span>
                </div>
              </div>

              {saved.note && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
                  <span className="font-bold">ملاحظة: </span>{saved.note}
                </div>
              )}

              <p className="text-center text-xs text-gray-400 mt-6">
                هذه الفاتورة صادرة كفاتورة ضريبية وفق متطلبات هيئة الزكاة والضريبة والجمارك (زاتكا)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Inline New Product Modal */}
      {newProductDraft && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-5 bg-slate-800 text-white">
              <div className="flex items-center gap-2">
                <PackagePlus size={20} />
                <h3 className="text-lg font-bold">
                  {lang === 'ar' ? 'إنشاء منتج جديد' : 'Create New Product'}
                </h3>
              </div>
              <button onClick={() => setNewProductDraft(null)} className="hover:bg-white/20 p-1.5 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <p className="px-5 pt-3 pb-1 text-xs text-amber-700 bg-amber-50">
              {lang === 'ar'
                ? 'أضف المنتج بالمعلومات الأساسية. يمكنك تعديل التفاصيل لاحقاً من قسم المخزون.'
                : 'Add the product with basic info. You can edit details later in Inventory.'}
            </p>
            <form onSubmit={handleSaveNewProduct} className="p-5 space-y-3">

              {/* Image picker */}
              <ProductImagePicker
                imageUrl={newProductDraft.image}
                barcode={newProductDraft.barcode}
                nameEn={newProductDraft.nameEn}
                lang={lang}
                onChange={url => setNewProductDraft(d => d ? { ...d, image: url } : d)}
                onBarcodeFound={(nameEn, nameAr) => setNewProductDraft(d => d ? {
                  ...d,
                  nameEn: d.nameEn || nameEn,
                  nameAr: d.nameAr || nameAr,
                } : d)}
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {lang === 'ar' ? 'اسم المنتج (إنجليزي)' : 'Product Name (English)'} *
                  </label>
                  <input
                    required
                    className="w-full border rounded-xl p-3 text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={newProductDraft.nameEn}
                    onChange={e => setNewProductDraft({ ...newProductDraft, nameEn: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {lang === 'ar' ? 'اسم المنتج (عربي)' : 'Product Name (Arabic)'}
                  </label>
                  <input
                    dir="rtl"
                    className="w-full border rounded-xl p-3 text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={newProductDraft.nameAr}
                    onChange={e => setNewProductDraft({ ...newProductDraft, nameAr: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {lang === 'ar' ? 'الباركود' : 'Barcode'}
                  </label>
                  <input
                    className="w-full border rounded-xl p-3 text-sm text-gray-900 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={newProductDraft.barcode}
                    onChange={e => setNewProductDraft({ ...newProductDraft, barcode: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {lang === 'ar' ? 'الفئة' : 'Category'}
                  </label>
                  <select
                    className="w-full border rounded-xl p-3 text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={newProductDraft.category}
                    onChange={e => setNewProductDraft({ ...newProductDraft, category: e.target.value as Category })}
                  >
                    {Object.values(Category).map((c, ci) => (
                      <option key={c || `cat-${ci}`} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {lang === 'ar' ? 'سعر البيع (ر.س)' : 'Selling Price (SAR)'}
                  </label>
                  <input
                    type="number" min="0" step="0.01"
                    className="w-full border rounded-xl p-3 text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={newProductDraft.price}
                    onChange={e => setNewProductDraft({ ...newProductDraft, price: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    {lang === 'ar' ? 'سعر الشراء (ر.س)' : 'Purchasing Price (SAR)'}
                  </label>
                  <input
                    type="number" min="0" step="0.01"
                    className="w-full border rounded-xl p-3 text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={newProductDraft.costPrice}
                    onChange={e => setNewProductDraft({ ...newProductDraft, costPrice: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setNewProductDraft(null)} className="flex-1 py-2.5 border rounded-xl text-gray-700 hover:bg-gray-50 text-sm">
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button type="submit" className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  <PackagePlus size={16} />
                  {lang === 'ar' ? 'إنشاء وإضافة' : 'Create & Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseInvoiceModal;
