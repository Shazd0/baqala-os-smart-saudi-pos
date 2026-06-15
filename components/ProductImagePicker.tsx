import React, { useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { lookupByBarcode, searchByName, OFFCandidate } from '../services/productImageService';
import { Language } from '../types';

interface ProductImagePickerProps {
  imageUrl: string;
  barcode?: string;
  nameEn?: string;
  lang: Language;
  onChange: (imageUrl: string) => void;
  /** Called when barcode lookup fills in product names */
  onBarcodeFound?: (nameEn: string, nameAr: string) => void;
  onFileUpload?: (dataUrl: string) => void;
}

type Status = 'idle' | 'loading' | 'found' | 'not_found' | 'error' | 'searching' | 'search_done';

const ProductImagePicker: React.FC<ProductImagePickerProps> = ({
  imageUrl, barcode, nameEn, lang, onChange, onBarcodeFound, onFileUpload,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [candidates, setCandidates] = useState<OFFCandidate[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const lookupBarcode = async () => {
    if (!barcode?.trim()) { setShowSearch(true); return; }
    setStatus('loading');
    const result = await lookupByBarcode(barcode.trim());
    if (result.found) {
      onChange(result.imageUrl);
      onBarcodeFound?.(result.nameEn, result.nameAr);
      setStatus('found');
    } else {
      setStatus('not_found');
    }
  };

  const runNameSearch = async () => {
    const term = searchTerm.trim() || nameEn?.trim() || '';
    if (!term) return;
    setStatus('searching');
    const results = await searchByName(term);
    setCandidates(results);
    setStatus('search_done');
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      onChange(dataUrl);
      onFileUpload?.(dataUrl);
      setStatus('idle');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-3">
      {/* Image preview + controls */}
      <div className="flex gap-4 items-start">
        {/* Preview box */}
        <div
          onClick={() => fileRef.current?.click()}
          className="w-28 h-28 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50 transition-all overflow-hidden relative flex-shrink-0 bg-gray-50"
        >
          {imageUrl ? (
            <>
              <img src={imageUrl} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 hover:opacity-100 transition-opacity text-white text-xs gap-1">
                <RefreshCw size={16} />
                <span>{lang === 'ar' ? 'تغيير' : 'Change'}</span>
              </div>
            </>
          ) : (
            <>
              <ImageIcon size={28} className="text-gray-300 mb-1" />
              <span className="text-[10px] text-gray-400">{lang === 'ar' ? 'رفع صورة' : 'Upload'}</span>
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>

        {/* Action buttons */}
        <div className="flex-1 space-y-2">
          <p className="text-xs font-semibold text-gray-600 mb-1">
            {lang === 'ar' ? 'البحث التلقائي عن صورة المنتج' : 'Auto-fetch product image'}
          </p>

          {/* Barcode lookup */}
          <button
            type="button"
            onClick={lookupBarcode}
            disabled={status === 'loading'}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold"
          >
            {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {lang === 'ar' ? 'بحث بالباركود (Open Food Facts)' : 'Search by barcode (Open Food Facts)'}
          </button>

          {/* Status messages */}
          {status === 'found' && (
            <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-medium bg-emerald-50 rounded-lg px-2 py-1.5">
              <span>✓</span>
              <span>{lang === 'ar' ? 'تم جلب الصورة تلقائياً من قاعدة بيانات المنتجات' : 'Image auto-fetched from product database'}</span>
            </div>
          )}
          {status === 'not_found' && (
            <div className="text-amber-700 text-xs bg-amber-50 rounded-lg px-2 py-1.5">
              {lang === 'ar' ? 'لم يُعثر على المنتج بالباركود. جرّب البحث بالاسم.' : 'Not found by barcode. Try searching by name.'}
            </div>
          )}
          {status === 'error' && (
            <div className="text-red-600 text-xs bg-red-50 rounded-lg px-2 py-1.5">
              {lang === 'ar' ? 'تعذّر الاتصال. تحقق من الإنترنت.' : 'Connection failed. Check your internet.'}
            </div>
          )}

          {/* Name search toggle */}
          <button
            type="button"
            onClick={() => setShowSearch(s => !s)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-medium"
          >
            <Search size={13} />
            {lang === 'ar' ? 'بحث بالاسم عن صور' : 'Search by name for images'}
          </button>
        </div>
      </div>

      {/* Name search panel */}
      {showSearch && (
        <div className="border rounded-xl p-3 bg-gray-50 space-y-2">
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg p-2 text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder={lang === 'ar' ? 'اسم المنتج...' : 'Product name...'}
              value={searchTerm || nameEn || ''}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runNameSearch()}
            />
            <button
              type="button"
              onClick={runNameSearch}
              disabled={status === 'searching'}
              className="px-3 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold disabled:opacity-50 flex items-center gap-1"
            >
              {status === 'searching' ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              {lang === 'ar' ? 'بحث' : 'Go'}
            </button>
            <button type="button" onClick={() => setShowSearch(false)} className="p-2 hover:bg-gray-100 rounded-lg">
              <X size={14} className="text-gray-500" />
            </button>
          </div>

          {status === 'searching' && (
            <div className="text-center py-4 text-gray-400 text-xs">
              <Loader2 size={20} className="animate-spin mx-auto mb-1" />
              {lang === 'ar' ? 'جارٍ البحث...' : 'Searching...'}
            </div>
          )}

          {status === 'search_done' && candidates.length === 0 && (
            <p className="text-center text-gray-400 text-xs py-3">
              {lang === 'ar' ? 'لم تُوجد نتائج' : 'No results found'}
            </p>
          )}

          {status === 'search_done' && candidates.length > 0 && (
            <>
              <p className="text-xs text-gray-500">{lang === 'ar' ? 'اضغط على الصورة لاختيارها:' : 'Click an image to select it:'}</p>
              <div className="grid grid-cols-3 gap-2">
                {candidates.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { onChange(c.imageUrl); setShowSearch(false); setStatus('found'); }}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${imageUrl === c.imageUrl ? 'border-emerald-500 ring-2 ring-emerald-300' : 'border-transparent hover:border-emerald-300'}`}
                    title={c.nameEn || c.brands}
                  >
                    <img
                      src={c.imageUrl}
                      alt={c.nameEn}
                      className="w-full h-20 object-contain bg-white"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="bg-black/60 text-white text-[9px] text-center px-1 py-0.5 truncate">
                      {c.brands || c.nameEn}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductImagePicker;
