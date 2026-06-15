/**
 * Cash Till Counter — Count physical cash denominations at end of shift.
 * Every cashier does this daily. Shows expected cash vs actual vs variance.
 */
import React, { useState, useMemo } from 'react';
import { Banknote, CheckCircle2, X } from 'lucide-react';
import { Language } from '../types';
import { StorageService } from '../services/storageService';
import { openPrintDocument } from '../services/printTemplates';

interface Props {
  expectedCash: number; // from shift report
  lang: Language;
  onClose: () => void;
}

const DENOMS = [
  { value: 500, label: '500 ر.س', en: '500 SAR', color: 'bg-purple-100 text-purple-800' },
  { value: 100, label: '100 ر.س', en: '100 SAR', color: 'bg-blue-100 text-blue-800' },
  { value: 50,  label: '50 ر.س',  en: '50 SAR',  color: 'bg-cyan-100 text-cyan-800' },
  { value: 20,  label: '20 ر.س',  en: '20 SAR',  color: 'bg-green-100 text-green-800' },
  { value: 10,  label: '10 ر.س',  en: '10 SAR',  color: 'bg-teal-100 text-teal-800' },
  { value: 5,   label: '5 ر.س',   en: '5 SAR',   color: 'bg-emerald-100 text-emerald-800' },
  { value: 2,   label: '2 ر.س',   en: '2 SAR',   color: 'bg-lime-100 text-lime-800' },
  { value: 1,   label: '1 ر.س',   en: '1 SAR',   color: 'bg-yellow-100 text-yellow-800' },
  { value: 0.5, label: '50 هللة', en: '50 Hal',  color: 'bg-orange-100 text-orange-800' },
  { value: 0.25,label: '25 هللة', en: '25 Hal',  color: 'bg-red-100 text-red-800' },
];

const CashCounter: React.FC<Props> = ({ expectedCash, lang, onClose }) => {
  const ar = lang === 'ar';
  const [counts, setCounts] = useState<Record<number, number>>(
    Object.fromEntries(DENOMS.map(d => [d.value, 0]))
  );

  const actualTotal = useMemo(() =>
    DENOMS.reduce((sum, d) => sum + (counts[d.value] || 0) * d.value, 0),
    [counts]
  );

  const variance = actualTotal - expectedCash;
  const isShort = variance < -0.01;
  const isOver  = variance > 0.01;

  const handlePrint = () => {
    const config = StorageService.getConfig();
    const rows = DENOMS.filter(d => counts[d.value] > 0).map(d =>
      `<tr><td>${ar ? d.label : d.en}</td><td style="text-align:center">${counts[d.value]}</td><td style="text-align:right">${(d.value * counts[d.value]).toFixed(2)} ر.س</td></tr>`
    ).join('');
    const body = `
      <p class="muted" style="margin-top:0">${new Date().toLocaleString(ar ? 'ar-SA' : 'en-US')}</p>
      <table><thead><tr><th>${ar?'الفئة':'Denomination'}</th><th>${ar?'العدد':'Count'}</th><th>${ar?'المجموع':'Total'}</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <br>
      <table><tbody>
        <tr class="total"><td>${ar?'إجمالي المعدود':'Actual Count'}</td><td colspan="2" style="text-align:right">${actualTotal.toFixed(2)} ر.س</td></tr>
        <tr><td>${ar?'المتوقع من النظام':'System Expected'}</td><td colspan="2" style="text-align:right">${expectedCash.toFixed(2)} ر.س</td></tr>
        <tr class="var"><td>${ar?'الفرق':'Variance'}</td><td colspan="2" style="text-align:right">${variance >= 0 ? '+' : ''}${variance.toFixed(2)} ر.س</td></tr>
      </tbody></table>
    `;
    openPrintDocument({
      title: ar ? 'تقرير عد الكاشير' : 'Cash Count Report',
      config,
      body,
      dir: ar ? 'rtl' : 'ltr',
      autoPrint: true,
      extraCss: `.var{color:${isShort?'#dc2626':isOver?'#d97706':'#059669'};font-weight:900;}`,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden" dir={ar ? 'rtl' : 'ltr'}>

        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-800 to-slate-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/20 p-2 rounded-xl"><Banknote size={22} className="text-emerald-400" /></div>
            <div>
              <h2 className="font-black text-lg">{ar ? 'عد الكاشير' : 'Cash Till Count'}</h2>
              <p className="text-slate-300 text-xs">{ar ? 'أدخل عدد كل فئة' : 'Enter quantity of each denomination'}</p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-1.5 rounded-lg"><X size={20} /></button>
        </div>

        {/* Denominations */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {DENOMS.map(d => (
              <div key={d.value} className="flex items-center gap-3">
                <div className={`w-24 text-center py-1.5 px-2 rounded-xl text-sm font-bold flex-shrink-0 ${d.color}`}>
                  {ar ? d.label : d.en}
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <button
                    onClick={() => setCounts(c => ({ ...c, [d.value]: Math.max(0, (c[d.value] || 0) - 1) }))}
                    className="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-lg flex items-center justify-center btn-spring"
                  >−</button>
                  <input
                    type="number"
                    min="0"
                    value={counts[d.value] || ''}
                    onChange={e => setCounts(c => ({ ...c, [d.value]: Math.max(0, parseInt(e.target.value) || 0) }))}
                    className="flex-1 text-center border-2 border-slate-200 rounded-xl py-1.5 font-bold text-slate-800 focus:border-emerald-500 focus:outline-none"
                    placeholder="0"
                  />
                  <button
                    onClick={() => setCounts(c => ({ ...c, [d.value]: (c[d.value] || 0) + 1 }))}
                    className="w-8 h-8 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg font-bold text-lg flex items-center justify-center btn-spring"
                  >+</button>
                </div>
                <div className="w-20 text-end text-sm font-semibold text-slate-600 flex-shrink-0">
                  {((counts[d.value] || 0) * d.value).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="border-t p-4 bg-slate-50 space-y-2">
          <div className="flex justify-between text-sm text-slate-600">
            <span>{ar ? 'المتوقع من النظام' : 'System Expected (Cash)'}</span>
            <span className="font-bold">{expectedCash.toFixed(2)} ر.س</span>
          </div>
          <div className="flex justify-between text-base font-bold text-slate-800">
            <span>{ar ? 'إجمالي المعدود' : 'Actual Count'}</span>
            <span className="text-emerald-700">{actualTotal.toFixed(2)} ر.س</span>
          </div>
          <div className={`flex justify-between text-base font-black rounded-xl px-3 py-2 ${isShort ? 'bg-red-50 text-red-700' : isOver ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
            <span>{ar ? 'الفرق' : 'Variance'}</span>
            <span>{variance >= 0 ? '+' : ''}{variance.toFixed(2)} ر.س {isShort ? (ar ? '⚠ عجز' : '⚠ Short') : isOver ? (ar ? '↑ زيادة' : '↑ Over') : (ar ? '✓ مطابق' : '✓ Exact')}</span>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-100">
              {ar ? 'إغلاق' : 'Close'}
            </button>
            <button onClick={handlePrint} className="flex-1 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 btn-spring">
              <CheckCircle2 size={16} /> {ar ? 'طباعة التقرير' : 'Print Report'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CashCounter;
