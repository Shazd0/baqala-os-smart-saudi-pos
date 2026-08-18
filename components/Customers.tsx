
import React, { useEffect, useState } from 'react';
import { Customer, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { StorageService } from '../services/storageService';
import { User, Phone, Plus, DollarSign, Search } from 'lucide-react';
import { firstError, optionalSaudiPhone, positiveNumber, requiredText } from '../services/validationService';
import { useToast } from './Toast';

interface CustomersProps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  lang: Language;
}

const Customers: React.FC<CustomersProps> = ({ customers, setCustomers, lang }) => {
  const t = TRANSLATIONS[lang];
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newCustomer, setNewCustomer] = useState<Partial<Customer>>({});
  const [payModal, setPayModal] = useState<{id: string, name: string} | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);

  useEffect(() => {
    setCustomers(StorageService.getCustomers());
  }, [setCustomers]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const error = firstError(
      requiredText(newCustomer.name, 'Customer name'),
      requiredText(newCustomer.phone, 'Phone'),
      optionalSaudiPhone(newCustomer.phone)
    );
    if (error) {
      toast(error, 'error');
      return;
    }
      const c: Customer = {
        id: Date.now().toString(),
        name: newCustomer.name!.trim(),
        phone: newCustomer.phone!.trim(),
        balance: 0,
        points: 0,
        lastVisit: Date.now()
      };
      StorageService.saveCustomer(c);
      setCustomers(StorageService.getCustomers());
      setIsAdding(false);
      setNewCustomer({});
      toast(lang === 'ar' ? `✓ تمت إضافة ${c.name}` : `✓ ${c.name} added`, 'success');
  };

  const handlePayDebt = (e: React.FormEvent) => {
    e.preventDefault();
    const error = positiveNumber(payAmount, 'Payment amount');
    if (error) {
      toast(error, 'error');
      return;
    }
    if (payModal) {
      StorageService.updateCustomerBalance(payModal.id, -payAmount);
      setCustomers(StorageService.getCustomers());
      toast(lang === 'ar' ? `✓ تم تسجيل الدفع` : `✓ Payment recorded`, 'success');
      setPayModal(null);
      setPayAmount(0);
    }
  };

  const filtered = customers.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm));

  return (
    <div className="flex h-full flex-col bg-[var(--ios-bg)] p-4 sm:p-6">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 sm:mb-6">
        <h2 className="text-2xl font-bold text-[var(--ios-text)]">{t.customers}</h2>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 rounded-xl bg-[#1E6B48] px-4 text-sm font-bold text-white shadow-md shadow-emerald-700/20 transition-colors hover:bg-[#18583b]"
        >
          <Plus size={18} />
          <span>{t.newCustomer}</span>
        </button>
      </div>

      <div className="relative mb-4 shrink-0 sm:mb-6">
         <input 
             className={`w-full rounded-xl border border-[var(--ios-divider)] bg-white py-3 text-[var(--ios-text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1E6B48]/40 ${lang === 'ar' ? 'pr-10 pl-4' : 'pl-10 pr-4'}`}
             placeholder={t.search}
             value={searchTerm}
             onChange={e => setSearchTerm(e.target.value)}
         />
         <Search className={`absolute top-3.5 text-[var(--ios-tertiary)] ${lang === 'ar' ? 'right-3' : 'left-3'}`} size={20} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pb-20 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.length === 0 && (
          <div className="col-span-full py-16 text-center text-gray-400">
            <User size={36} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold text-sm">
              {searchTerm
                ? (lang === 'ar' ? 'لا يوجد عميل بهذا الاسم أو الجوال' : 'No customer matches your search')
                : (lang === 'ar' ? 'لا يوجد عملاء بعد' : 'No customers yet')}
            </p>
          </div>
        )}
        {filtered.map(c => (
          <div key={c.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold">
                  {c.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{c.name}</h3>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Phone size={12} /> {c.phone}
                  </div>
                </div>
              </div>
              {c.balance > 0 && (
                <span className="px-2 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-full">
                  {lang === 'ar' ? 'مديون' : 'Credit'}
                </span>
              )}
            </div>
            
            <div className="mt-2 flex gap-2">
               <div className="flex-1 bg-gray-50 rounded p-2 flex items-center gap-2">
                  <div className="bg-green-100 p-1.5 rounded-full text-green-600"><DollarSign size={14} /></div>
                  <div>
                     <p className="text-[10px] text-gray-500 uppercase">{t.balance}</p>
                     <p className={`font-bold ${c.balance > 0 ? 'text-red-600' : 'text-gray-900'}`}>{c.balance.toFixed(2)} SAR</p>
                  </div>
               </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-500">{lang === 'ar' ? 'آخر زيارة' : 'Last Visit'}</p>
                <p className="text-xs font-medium text-gray-900">{new Date(c.lastVisit).toLocaleDateString()}</p>
              </div>
              {c.balance > 0 && (
                <button 
                  onClick={() => setPayModal({id: c.id, name: c.name})}
                  className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
                >
                  {t.payDebt}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
             <h3 className="font-bold text-lg mb-4 text-gray-800">{t.newCustomer}</h3>
             <form onSubmit={handleAdd} className="space-y-4">
                <input required placeholder={t.customer} className="w-full border p-2 rounded bg-white text-gray-900" value={newCustomer.name || ''} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} />
                <input required placeholder={t.phone} className="w-full border p-2 rounded bg-white text-gray-900" value={newCustomer.phone || ''} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} />
                <div className="flex gap-2">
                   <button type="button" onClick={() => setIsAdding(false)} className="flex-1 py-2 bg-gray-100 text-gray-800 rounded">{t.cancel}</button>
                   <button type="submit" className="flex-1 py-2 bg-primary-600 text-white rounded">{t.save}</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {payModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl p-6 w-full max-w-sm">
              <h3 className="font-bold text-lg mb-2 text-gray-800">{t.payDebt} - {payModal.name}</h3>
              <form onSubmit={handlePayDebt} className="space-y-4">
                 <div className="relative">
                    <input 
                      type="number" 
                      step="0.01" 
                      autoFocus
                      required
                      className="w-full border p-2 rounded pl-8 text-lg font-bold bg-white text-gray-900" 
                      value={payAmount || ''} 
                      onChange={e => setPayAmount(parseFloat(e.target.value))} 
                    />
                    <DollarSign size={16} className="absolute left-2 top-3.5 text-gray-400" />
                 </div>
                 <div className="flex gap-2">
                    <button type="button" onClick={() => {setPayModal(null); setPayAmount(0);}} className="flex-1 py-2 bg-gray-100 text-gray-800 rounded">{t.cancel}</button>
                    <button type="submit" className="flex-1 py-2 bg-primary-600 text-white rounded">{t.save}</button>
                 </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
