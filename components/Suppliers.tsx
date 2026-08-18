import React, { useState } from 'react';
import { Language, Supplier } from '../types';
import { StorageService } from '../services/storageService';
import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import { useToast } from './Toast';
import { firstError, optionalSaudiPhone, optionalVatNumber, requiredText } from '../services/validationService';
import ConfirmDialog from './ConfirmDialog';

interface SuppliersProps {
  lang: Language;
}

const emptySupplier = (): Partial<Supplier> => ({
  name: '', vatNumber: '', phone: '', address: '', contactName: ''
});

const Suppliers: React.FC<SuppliersProps> = ({ lang }) => {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>(StorageService.getSuppliers());
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<Supplier>>(emptySupplier());
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const canDelete = StorageService.hasPermission('manage_settings');

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.vatNumber ?? '').includes(search) ||
    (s.phone ?? '').includes(search)
  );

  const openNew = () => { setEditing(emptySupplier()); setError(''); setShowModal(true); };
  const openEdit = (s: Supplier) => { setEditing({ ...s }); setError(''); setShowModal(true); };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = firstError(
      requiredText(editing.name, 'Supplier name'),
      optionalVatNumber(editing.vatNumber, 'Supplier VAT number'),
      optionalSaudiPhone(editing.phone, 'Supplier phone')
    );
    if (validationError) { setError(lang === 'ar' ? `تحقق من البيانات: ${validationError}` : validationError); return; }
    const saved = StorageService.saveSupplier({
      id: editing.id || '',
      name: editing.name!,
      vatNumber: editing.vatNumber || '',
      phone: editing.phone || '',
      address: editing.address || '',
      contactName: editing.contactName || '',
      createdAt: editing.createdAt || Date.now(),
    });
    setSuppliers(saved);
    setShowModal(false);
    toast(
      editing.id
        ? (lang === 'ar' ? `✓ تم تعديل ${editing.name}` : `✓ ${editing.name} updated`)
        : (lang === 'ar' ? `✓ تمت إضافة ${editing.name}` : `✓ ${editing.name} added`),
      'success'
    );
  };

  const handleDelete = (id: string) => {
    if (!canDelete) {
      toast(lang === 'ar' ? 'الحذف مسموح للمدير فقط' : 'Only administrator can delete.', 'error');
      return;
    }
    toast(lang === 'ar' ? `🗑 تم حذف المورد` : `Supplier deleted`, 'warning');
    StorageService.deleteSupplier(id);
    setSuppliers(StorageService.getSuppliers());
    setDeleteId(null);
  };

  return (
    <div className="p-6 h-full flex flex-col bg-gray-50 overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {lang === 'ar' ? 'إدارة الموردين' : 'Supplier Management'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {lang === 'ar' ? 'أضف أرقامهم الضريبية لاسترداد ضريبة المدخلات' : 'Add VAT numbers to enable input VAT reclaim'}
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow text-sm"
        >
          <Plus size={18} />
          {lang === 'ar' ? 'إضافة مورد' : 'Add Supplier'}
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <input
          className="w-full pl-10 pr-4 py-3 rounded-xl border bg-white shadow-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none text-gray-900"
          placeholder={lang === 'ar' ? 'بحث بالاسم أو الرقم الضريبي أو الجوال' : 'Search by name, VAT number or phone'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <Search size={18} className="absolute left-3 top-3.5 text-gray-400" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border shadow-sm flex-1 overflow-hidden">
        <div className="overflow-y-auto h-full">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0 z-10">
              <tr>
                <th className="p-4 text-start font-semibold text-gray-700">{lang === 'ar' ? 'الاسم' : 'Name'}</th>
                <th className="p-4 text-start font-semibold text-gray-700">{lang === 'ar' ? 'الرقم الضريبي' : 'VAT Number'}</th>
                <th className="p-4 text-start font-semibold text-gray-700">{lang === 'ar' ? 'الجوال' : 'Phone'}</th>
                <th className="p-4 text-start font-semibold text-gray-700">{lang === 'ar' ? 'جهة الاتصال' : 'Contact'}</th>
                <th className="p-4 text-start font-semibold text-gray-700">{lang === 'ar' ? 'العنوان' : 'Address'}</th>
                <th className="p-4 text-end font-semibold text-gray-700">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-gray-400">
                    {lang === 'ar' ? 'لا يوجد موردون' : 'No suppliers yet'}
                  </td>
                </tr>
              )}
              {filtered.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-semibold text-gray-900">{s.name}</td>
                  <td className="p-4 font-mono text-gray-700">
                    {s.vatNumber ? (
                      <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-xs font-bold">{s.vatNumber}</span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="p-4 text-gray-700">{s.phone || '—'}</td>
                  <td className="p-4 text-gray-700">{s.contactName || '—'}</td>
                  <td className="p-4 text-gray-500 text-xs max-w-[200px] truncate">{s.address || '—'}</td>
                  <td className="p-4 text-end">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(s)} className="p-1.5 text-gray-400 hover:text-slate-800 hover:bg-gray-100 rounded-lg" title="Edit">
                        <Edit2 size={16} />
                      </button>
                      {canDelete && (
                        <button onClick={() => setDeleteId(s.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between p-5 bg-slate-900 text-white">
              <h3 className="text-lg font-bold">
                {editing.id ? (lang === 'ar' ? 'تعديل المورد' : 'Edit Supplier') : (lang === 'ar' ? 'إضافة مورد جديد' : 'New Supplier')}
              </h3>
              <button onClick={() => setShowModal(false)} className="hover:bg-white/20 p-1.5 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{lang === 'ar' ? 'اسم المورد' : 'Supplier Name'} *</label>
                  <input required className="w-full border rounded-xl p-3 text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none" value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{lang === 'ar' ? 'الرقم الضريبي' : 'VAT Number'}</label>
                  <input className="w-full border rounded-xl p-3 text-gray-900 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="3xxxxxxxxxxxxxxx" value={editing.vatNumber || ''} onChange={e => setEditing({ ...editing, vatNumber: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{lang === 'ar' ? 'الجوال' : 'Phone'}</label>
                  <input className="w-full border rounded-xl p-3 text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none" value={editing.phone || ''} onChange={e => setEditing({ ...editing, phone: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{lang === 'ar' ? 'جهة الاتصال' : 'Contact Person'}</label>
                  <input className="w-full border rounded-xl p-3 text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none" value={editing.contactName || ''} onChange={e => setEditing({ ...editing, contactName: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{lang === 'ar' ? 'العنوان' : 'Address'}</label>
                  <input className="w-full border rounded-xl p-3 text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none" value={editing.address || ''} onChange={e => setEditing({ ...editing, address: e.target.value })} />
                </div>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border rounded-xl text-gray-700 hover:bg-gray-50">
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button type="submit" className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold">
                  {lang === 'ar' ? 'حفظ' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!deleteId}
        title={lang === 'ar' ? 'حذف المورد؟' : 'Delete supplier?'}
        message={lang === 'ar' ? 'سيتم حذف المورد من القائمة. هل تريد المتابعة؟' : 'This supplier will be removed from the list. Continue?'}
        confirmLabel={lang === 'ar' ? 'حذف' : 'Delete'}
        cancelLabel={lang === 'ar' ? 'إلغاء' : 'Cancel'}
        danger
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
};

export default Suppliers;
