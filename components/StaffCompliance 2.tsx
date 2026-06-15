import React, { useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, Save, ShieldAlert, UserPlus } from 'lucide-react';
import { BranchPermission, BranchStaffAssignment, Language, StaffMember } from '../types';
import { StorageService } from '../services/storageService';
import { healthCardStatus } from '../services/restaurantService';

interface StaffComplianceProps {
  lang: Language;
}

function txt(lang: Language, en: string, ar: string) {
  return lang === 'ar' ? ar : en;
}

const BRANCH_PERMISSIONS: BranchPermission[] = [
  'branch_pos',
  'branch_kds',
  'branch_inventory',
  'branch_purchases',
  'branch_staff',
  'branch_reports',
  'branch_refunds',
  'branch_voids',
  'branch_discounts',
  'branch_tabs',
];

const StaffCompliance: React.FC<StaffComplianceProps> = ({ lang }) => {
  const [staff, setStaff] = useState<StaffMember[]>(() => StorageService.getStaffMembers());
  const [branches] = useState(() => StorageService.getBranches());
  const [assignments, setAssignments] = useState<BranchStaffAssignment[]>(() => StorageService.getBranchStaffAssignments());
  const [assignmentDraft, setAssignmentDraft] = useState<BranchStaffAssignment>({
    id: '',
    branchId: StorageService.getActiveBranchId(),
    staffMemberId: '',
    role: 'chef',
    permissions: ['branch_pos', 'branch_kds'],
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const [draft, setDraft] = useState<StaffMember>({
    id: '',
    nameEn: '',
    nameAr: '',
    role: 'chef',
    active: true,
    gosiRegistered: false,
    qiwaOccupation: '',
    healthCertificate: {
      id: '',
      staffMemberId: '',
      cardNumber: '',
      expiresAt: '',
      status: 'valid',
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const summary = useMemo(() => ({
    valid: staff.filter(member => healthCardStatus(member) === 'valid').length,
    expiring: staff.filter(member => healthCardStatus(member) === 'expiring_soon').length,
    expired: staff.filter(member => healthCardStatus(member) === 'expired' || healthCardStatus(member) === 'missing').length,
  }), [staff]);

  const save = () => {
    if (!draft.nameEn || !draft.nameAr) return;
    const staffId = draft.id || `STF-${Date.now()}`;
    const certificate = draft.healthCertificate ? {
      ...draft.healthCertificate,
      id: draft.healthCertificate.id || `HLC-${Date.now()}`,
      staffMemberId: staffId,
      status: healthCardStatus({ ...draft, id: staffId } as StaffMember) === 'expired' ? 'expired' as const : healthCardStatus({ ...draft, id: staffId } as StaffMember) === 'expiring_soon' ? 'expiring_soon' as const : 'valid' as const,
    } : undefined;
    StorageService.saveStaffMember({ ...draft, id: staffId, branchIds: Array.from(new Set([...(draft.branchIds || []), assignmentDraft.branchId].filter(Boolean))), healthCertificate: certificate, updatedAt: Date.now() });
    if (certificate) StorageService.saveHealthCertificate(certificate);
    StorageService.saveBranchStaffAssignment({
      ...assignmentDraft,
      id: assignmentDraft.id || `BSA-${Date.now()}`,
      staffMemberId: staffId,
      role: draft.role,
      active: true,
      createdAt: assignmentDraft.createdAt || Date.now(),
      updatedAt: Date.now(),
    });
    setStaff(StorageService.getStaffMembers());
    setAssignments(StorageService.getBranchStaffAssignments());
    setDraft({
      id: '',
      nameEn: '',
      nameAr: '',
      role: 'chef',
      active: true,
      gosiRegistered: false,
      qiwaOccupation: '',
      healthCertificate: { id: '', staffMemberId: '', cardNumber: '', expiresAt: '', status: 'valid' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setAssignmentDraft({
      id: '',
      branchId: StorageService.getActiveBranchId(),
      staffMemberId: '',
      role: 'chef',
      permissions: ['branch_pos', 'branch_kds'],
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  };

  const statusBadge = (member: StaffMember) => {
    const status = healthCardStatus(member);
    if (status === 'valid') return <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{txt(lang, 'Valid', 'سارية')}</span>;
    if (status === 'expiring_soon') return <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">{txt(lang, 'Expires within 30 days', 'تنتهي خلال 30 يوم')}</span>;
    return <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">{txt(lang, 'POS Lockout', 'إيقاف الدخول')}</span>;
  };

  return (
    <div className="ios-responsive-split">
      <section className="h-full overflow-y-auto p-6">
        <div className="mb-6">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-600">Balady, Qiwa, GOSI</p>
          <h1 className="text-3xl font-black text-slate-900">{txt(lang, 'Staff Compliance', 'امتثال الموظفين')}</h1>
          <p className="mt-1 text-sm text-slate-500">{txt(lang, 'Track health cards, 30-day expiry warnings, Qiwa occupation data, and GOSI registration.', 'تتبع الشهادات الصحية والتنبيه قبل 30 يوم وبيانات قوى والتأمينات.')}</p>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-[2rem] bg-emerald-50 p-5 text-emerald-800">
            <BadgeCheck size={28} />
            <p className="mt-3 text-3xl font-black">{summary.valid}</p>
            <p className="text-xs font-black uppercase opacity-70">{txt(lang, 'Valid cards', 'بطاقات سارية')}</p>
          </div>
          <div className="rounded-[2rem] bg-amber-50 p-5 text-amber-800">
            <AlertTriangle size={28} />
            <p className="mt-3 text-3xl font-black">{summary.expiring}</p>
            <p className="text-xs font-black uppercase opacity-70">{txt(lang, '30-day warnings', 'تنبيهات 30 يوم')}</p>
          </div>
          <div className="rounded-[2rem] bg-red-50 p-5 text-red-800">
            <ShieldAlert size={28} />
            <p className="mt-3 text-3xl font-black">{summary.expired}</p>
            <p className="text-xs font-black uppercase opacity-70">{txt(lang, 'Locked out', 'موقوفون')}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {staff.map(member => {
            const locked = healthCardStatus(member) === 'expired' || healthCardStatus(member) === 'missing';
            return (
              <button key={member.id} onClick={() => {
                setDraft(member);
                setAssignmentDraft(assignments.find(item => item.staffMemberId === member.id) || {
                  id: '',
                  branchId: member.branchIds?.[0] || StorageService.getActiveBranchId(),
                  staffMemberId: member.id,
                  role: member.role,
                  permissions: ['branch_pos', 'branch_kds'],
                  active: true,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                });
              }} className={`rounded-[2rem] border bg-white p-5 text-left shadow-sm ${locked ? 'border-red-200' : 'border-white'}`}>
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">{txt(lang, member.nameEn, member.nameAr)}</h2>
                    <p className="text-xs font-bold uppercase text-slate-400">{member.role} / {member.qiwaOccupation || 'Qiwa pending'}</p>
                  </div>
                  {statusBadge(member)}
                </div>
                <div className="grid gap-2 text-sm font-semibold text-slate-600">
                  <p>{txt(lang, 'Health card', 'الشهادة الصحية')}: {member.healthCertificate?.cardNumber || txt(lang, 'Missing', 'غير موجودة')}</p>
                  <p>{txt(lang, 'Expires', 'تنتهي')}: {member.healthCertificate?.expiresAt || '-'}</p>
                  <p>{txt(lang, 'GOSI registered', 'مسجل في التأمينات')}: {member.gosiRegistered ? txt(lang, 'Yes', 'نعم') : txt(lang, 'No', 'لا')}</p>
                  <p>{txt(lang, 'Branches', 'الفروع')}: {(member.branchIds || []).map(id => branches.find(branch => branch.id === id)?.nameEn || id).join(', ') || txt(lang, 'Unassigned', 'غير معين')}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="h-full overflow-y-auto border-l border-slate-200 bg-white p-5 text-[var(--ios-text)] shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600"><UserPlus size={24} /></div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">{txt(lang, 'Staff record', 'سجل موظف')}</p>
            <h2 className="text-2xl font-black text-slate-900">{draft.id ? txt(lang, 'Edit Staff', 'تعديل موظف') : txt(lang, 'New Staff', 'موظف جديد')}</h2>
          </div>
        </div>

        <div className="space-y-3">
          <input value={draft.nameEn} onChange={event => setDraft({ ...draft, nameEn: event.target.value })} placeholder="Name English" className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
          <input value={draft.nameAr} onChange={event => setDraft({ ...draft, nameAr: event.target.value })} placeholder="Name Arabic" className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
          <select value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value as StaffMember['role'] })} className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold">
            {['cashier', 'waiter', 'chef', 'manager', 'driver'].map(role => <option key={role} value={role}>{role}</option>)}
          </select>
          <input value={draft.qiwaOccupation || ''} onChange={event => setDraft({ ...draft, qiwaOccupation: event.target.value })} placeholder="Qiwa occupation" className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
          <div className="rounded-[1.5rem] border border-amber-100 bg-amber-50/60 p-3">
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-amber-700">{txt(lang, 'Branch assignment', 'تعيين الفرع')}</p>
            <select
              value={assignmentDraft.branchId}
              onChange={event => setAssignmentDraft({ ...assignmentDraft, branchId: event.target.value })}
              className="mb-3 w-full rounded-2xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold"
            >
              {branches.map(branch => <option key={branch.id} value={branch.id}>{txt(lang, branch.nameEn, branch.nameAr)}</option>)}
            </select>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {BRANCH_PERMISSIONS.map(permission => {
                const checked = assignmentDraft.permissions.includes(permission);
                return (
                  <label key={permission} className={`rounded-2xl px-3 py-2 text-xs font-black ${checked ? 'bg-amber-600 text-white' : 'bg-white text-stone-500'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={event => setAssignmentDraft({
                        ...assignmentDraft,
                        permissions: event.target.checked
                          ? Array.from(new Set([...assignmentDraft.permissions, permission]))
                          : assignmentDraft.permissions.filter(item => item !== permission),
                      })}
                      className="mr-2"
                    />
                    {permission.replace('branch_', '')}
                  </label>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={!!draft.gosiRegistered} onChange={event => setDraft({ ...draft, gosiRegistered: event.target.checked })} />
            {txt(lang, 'GOSI registered', 'مسجل في التأمينات')}
          </label>
          <input value={draft.healthCertificate?.cardNumber || ''} onChange={event => setDraft({ ...draft, healthCertificate: { ...(draft.healthCertificate || { id: '', staffMemberId: '', expiresAt: '', status: 'valid' }), cardNumber: event.target.value } })} placeholder="Balady health card number" className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
          <input type="date" value={draft.healthCertificate?.expiresAt || ''} onChange={event => setDraft({ ...draft, healthCertificate: { ...(draft.healthCertificate || { id: '', staffMemberId: '', cardNumber: '', status: 'valid' }), expiresAt: event.target.value } })} className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold" />

          <button onClick={save} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-sm font-black text-white shadow-lg shadow-emerald-600/25">
            <Save size={18} /> {txt(lang, 'Save Compliance Record', 'حفظ سجل الامتثال')}
          </button>
        </div>
      </aside>
    </div>
  );
};

export default StaffCompliance;
