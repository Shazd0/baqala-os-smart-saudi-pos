
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Shift, Language, User } from '../types';
import { TRANSLATIONS } from '../constants';
import { StorageService } from '../services/storageService';
import { Lock, Unlock } from 'lucide-react';
import { nonNegativeNumber } from '../services/validationService';
import { useToast } from './Toast';

interface ShiftManagerProps {
  currentShift: Shift | null;
  currentUser: User;
  onShiftChange: () => void;
  lang: Language;
}

const ShiftManager: React.FC<ShiftManagerProps> = ({ currentShift, currentUser, onShiftChange, lang }) => {
  const t = TRANSLATIONS[lang];
  const { toast } = useToast();
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [isCloseModal, setIsCloseModal] = useState(false);
  const [amount, setAmount] = useState<number>(0);

  // Auto calculate expected cash for closing
  const [expectedCash, setExpectedCash] = useState(0);

  const modalBackdropClass = "fixed inset-0 flex min-h-screen items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md";
  const modalCardClass = "relative w-full max-w-md overflow-hidden rounded-[1.75rem] border border-white/20 bg-white shadow-2xl shadow-slate-950/40";
  const modalHeroClass = "bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-900 px-6 py-5 text-white";
  const inputClass = "w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-2xl font-black text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";
  const canUsePortal = typeof document !== 'undefined';

  useEffect(() => {
     if (currentShift && isCloseModal) {
        const allTx = StorageService.getTransactions();
        const shiftTx = allTx.filter(tx => tx.timestamp >= currentShift.startTime && tx.paymentMethod === 'cash' && !tx.isRefund);
        const totalSales = shiftTx.reduce((sum, tx) => sum + tx.total, 0);
        setExpectedCash(currentShift.startCash + totalSales);
     }
  }, [currentShift, isCloseModal]);

  useEffect(() => {
    if (!canUsePortal || (!isOpenModal && !isCloseModal)) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [canUsePortal, isOpenModal, isCloseModal]);

  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    const error = nonNegativeNumber(amount, 'Starting cash');
    if (error) { toast(error, 'error'); return; }
    StorageService.openShift(amount, currentUser.name);
    setIsOpenModal(false);
    onShiftChange();
  };

  const handleCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentShift) {
       const error = nonNegativeNumber(amount, 'End cash');
       if (error) { toast(error, 'error'); return; }
       const allTx = StorageService.getTransactions();
       const shiftTx = allTx.filter(tx => tx.timestamp >= currentShift.startTime && tx.paymentMethod === 'cash' && !tx.isRefund);
       const totalSales = shiftTx.reduce((sum, tx) => sum + tx.total, 0);
       const expected = currentShift.startCash + totalSales;
       
       StorageService.closeShift(currentShift.id, amount, totalSales, expected);
       setIsCloseModal(false);
       onShiftChange();
    }
  };

  const openShiftModal = isOpenModal && canUsePortal ? createPortal(
    <div
      className={modalBackdropClass}
      style={{ zIndex: 2147483647 }}
      role="dialog"
      aria-modal="true"
      onMouseDown={event => {
        if (event.target === event.currentTarget) setIsOpenModal(false);
      }}
    >
      <div className={modalCardClass}>
        <div className={modalHeroClass}>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/20 text-emerald-200">
              <Unlock size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black">{t.openShift}</h3>
              <p className="text-xs text-emerald-100">Enter the cash float before selling.</p>
            </div>
          </div>
        </div>
        <form onSubmit={handleOpenShift}>
          <div className="p-6">
            <label className="mb-2 block text-sm font-black uppercase tracking-wide text-slate-500">{t.startCash}</label>
            <input
              type="number"
              autoFocus
              className={inputClass}
              value={amount || ''}
              onChange={e => setAmount(parseFloat(e.target.value))}
              placeholder="0.00"
            />
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setIsOpenModal(false)} className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-600 transition hover:bg-slate-50">{t.cancel}</button>
              <button type="submit" className="flex-1 rounded-2xl bg-emerald-600 py-3 text-sm font-black text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700">{t.openShift}</button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  ) : null;

  const closeShiftModal = isCloseModal && currentShift && canUsePortal ? createPortal(
    <div
      className={modalBackdropClass}
      style={{ zIndex: 2147483647 }}
      role="dialog"
      aria-modal="true"
      onMouseDown={event => {
        if (event.target === event.currentTarget) setIsCloseModal(false);
      }}
    >
      <div className={modalCardClass}>
        <div className={modalHeroClass}>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-400/20 text-red-100">
              <Lock size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black">{t.closeShift}</h3>
              <p className="text-xs text-slate-300">Count the drawer cash and confirm variance.</p>
            </div>
          </div>
        </div>
        <form onSubmit={handleCloseShift}>
          <div className="p-6">
            <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
              <div className="mb-2 flex justify-between">
                <span>{t.startCash}:</span>
                <span className="font-black">{currentShift.startCash.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-black">
                <span>{t.expectedCash} (Cash Sales):</span>
                <span>{expectedCash.toFixed(2)}</span>
              </div>
            </div>

            <label className="mb-2 block text-sm font-black uppercase tracking-wide text-slate-500">{t.endCash} (Drawer Count)</label>
            <input
              type="number"
              autoFocus
              className={inputClass}
              value={amount || ''}
              onChange={e => setAmount(parseFloat(e.target.value))}
              placeholder="0.00"
            />

            {amount > 0 && (
              <div className={`mt-3 rounded-2xl px-4 py-3 text-sm font-black ${amount - expectedCash < 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {t.difference}: {(amount - expectedCash).toFixed(2)}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setIsCloseModal(false)} className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-600 transition hover:bg-slate-50">{t.cancel}</button>
              <button type="submit" className="flex-1 rounded-2xl bg-red-600 py-3 text-sm font-black text-white shadow-lg shadow-red-600/25 transition hover:bg-red-700">{t.closeShift}</button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  ) : null;

  if (!currentShift) {
     return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex justify-between items-center mb-4">
           <div className="flex items-center gap-3">
              <Lock className="text-red-500" />
              <div>
                 <h3 className="font-bold text-red-800">Shift Closed</h3>
                 <p className="text-xs text-red-600">POS is disabled</p>
              </div>
           </div>
           <button 
              onClick={() => { setAmount(0); setIsOpenModal(true); }}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold shadow hover:bg-red-700"
           >
              {t.openShift}
           </button>

           {openShiftModal}
        </div>
     );
  }

  return (
     <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
           <Unlock className="text-green-600" />
           <div>
              <h3 className="font-bold text-green-800">Shift Open</h3>
              <p className="text-xs text-green-600">Started: {new Date(currentShift.startTime).toLocaleTimeString()}</p>
           </div>
        </div>
        <button 
           onClick={() => { setAmount(0); setIsCloseModal(true); }}
           className="px-4 py-2 bg-white border border-green-200 text-green-700 rounded-lg text-sm font-bold shadow-sm hover:bg-green-100"
        >
           {t.closeShift}
        </button>

        {closeShiftModal}
     </div>
  );
};

export default ShiftManager;
