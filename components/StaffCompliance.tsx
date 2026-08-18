import React, { useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, LockKeyhole, Save, ShieldAlert, UserPlus } from 'lucide-react';
import { BranchPermission, BranchStaffAssignment, Language, StaffMember, UserRole } from '../types';
import { StorageService } from '../services/storageService';
import { useToast } from './Toast';

function healthCardStatus(staff: StaffMember) {
  const expiry = staff.healthCertificate?.expiresAt;
  if (!expiry) return 'missing' as const;
  const expiresAt = new Date(expiry).getTime();
  const days = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return 'expired' as const;
  if (days <= 30) return 'expiring_soon' as const;
  return 'valid' as const;
}

interface StaffComplianceProps {
  lang: Language;
}

type CredentialDraft = {
  username: string;
  password: string;
  quickPin: string;
};

const BRANCH_PERMISSIONS: Array<{ key: BranchPermission; en: string; ar: string }> = [
  { key: 'branch_pos', en: 'Can Use POS', ar: 'استخدام نقطة البيع' },
  { key: 'branch_kds', en: 'Can Open Cash Drawer', ar: 'فتح درج النقد' },
  { key: 'branch_inventory', en: 'Can Manage Inventory', ar: 'إدارة المخزون' },
  { key: 'branch_purchases', en: 'Can Manage Purchases', ar: 'إدارة المشتريات' },
  { key: 'branch_staff', en: 'Can Manage Staff', ar: 'إدارة الموظفين' },
  { key: 'branch_reports', en: 'Can View Reports', ar: 'عرض التقارير' },
  { key: 'branch_refunds', en: 'Can Refund Invoices', ar: 'استرجاع الفواتير' },
  { key: 'branch_voids', en: 'Can Void Sales', ar: 'إلغاء المبيعات' },
  { key: 'branch_discounts', en: 'Can Apply Discounts', ar: 'تطبيق الخصومات' },
  { key: 'branch_tabs', en: 'Can Manage Credit Book', ar: 'إدارة دفتر الآجل' },
];

function txt(lang: Language, en: string, ar: string) {
  return lang === 'ar' ? ar : en;
}

function blankStaff(): StaffMember {
  return {
    id: '',
    nameEn: '',
    nameAr: '',
    role: 'cashier',
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
  };
}

function blankAssignment(branchId: string): BranchStaffAssignment {
  return {
    id: '',
    branchId,
    staffMemberId: '',
    role: 'cashier',
    permissions: ['branch_pos'],
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'ST';
}

function roleTone(role: StaffMember['role']) {
  switch (role) {
    case 'cashier':
      return 'bg-blue-50 text-blue-700';
    case 'supervisor':
      return 'bg-violet-50 text-violet-700';
    case 'manager':
      return 'bg-emerald-50 text-emerald-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function userRoleForStaff(role: StaffMember['role']): UserRole {
  return role === 'manager' ? 'administrator' : 'cashier';
}

function roleBadge(role: string) {
  if (role === 'manager') return 'bg-emerald-50 text-emerald-700';
  if (role === 'supervisor') return 'bg-violet-50 text-violet-700';
  return 'bg-slate-100 text-slate-700';
}

function sanitizePin(value: string) {
  return value.replace(/\D/g, '').slice(0, 6);
}

const inputClass = 'h-12 w-full rounded-xl border-[1.5px] border-transparent bg-[#E9E9EB] px-4 text-sm font-bold text-[#1C1C1E] outline-none transition-all duration-200 ease-out placeholder:text-[#8E8E93] focus:border-[#1E6B48] focus:bg-white';

const StaffCompliance: React.FC<StaffComplianceProps> = ({ lang }) => {
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>(() => StorageService.getStaffMembers());
  const [branches] = useState(() => StorageService.getBranches());
  const [assignments, setAssignments] = useState<BranchStaffAssignment[]>(() => StorageService.getBranchStaffAssignments());
  const [draft, setDraft] = useState<StaffMember>(() => blankStaff());
  const [assignmentDraft, setAssignmentDraft] = useState<BranchStaffAssignment>(() => blankAssignment(StorageService.getActiveBranchId()));
  const [credentials, setCredentials] = useState<CredentialDraft>({ username: '', password: '', quickPin: '' });
  const [error, setError] = useState('');
  const [pinError, setPinError] = useState('');

  const summary = useMemo(() => ({
    valid: staff.filter(member => healthCardStatus(member) === 'valid').length,
    expiring: staff.filter(member => healthCardStatus(member) === 'expiring_soon').length,
    expired: staff.filter(member => healthCardStatus(member) === 'expired' || healthCardStatus(member) === 'missing').length,
  }), [staff]);

  const resetForm = () => {
    setDraft(blankStaff());
    setAssignmentDraft(blankAssignment(StorageService.getActiveBranchId()));
    setCredentials({ username: '', password: '', quickPin: '' });
    setError('');
    setPinError('');
  };

  const editStaff = (member: StaffMember) => {
    const assignment = assignments.find(item => item.staffMemberId === member.id) || blankAssignment(member.branchIds?.[0] || StorageService.getActiveBranchId());
    const existingUser = StorageService.getUsers().find(user => user.staffMemberId === member.id);
    setDraft(member);
    setAssignmentDraft({ ...assignment, role: member.role });
    setCredentials({ username: existingUser?.username || '', password: '', quickPin: '' });
    setError('');
    setPinError('');
  };

  const showError = (message: string) => {
    setError(message);
    toast(message, 'error', 5200);
  };

  const updateQuickPin = (value: string) => {
    const sanitized = sanitizePin(value);
    setCredentials(current => ({ ...current, quickPin: sanitized }));
    if (value && /\D/.test(value)) {
      setPinError(txt(lang, 'Quick Access PIN accepts numbers only.', 'رمز الدخول السريع يقبل الأرقام فقط.'));
      return;
    }
    if (sanitized && sanitized.length < 4) {
      setPinError(txt(lang, 'Quick Access PIN must be 4 to 6 digits.', 'رمز الدخول السريع يجب أن يكون من 4 إلى 6 أرقام.'));
      return;
    }
    setPinError('');
  };

  const togglePermission = (permission: BranchPermission, checked: boolean) => {
    setAssignmentDraft(current => ({
      ...current,
      permissions: checked
        ? Array.from(new Set([...current.permissions, permission]))
        : current.permissions.filter(item => item !== permission),
    }));
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const name = draft.nameEn.trim();
    const username = credentials.username.trim().toLowerCase();
    const password = credentials.password.trim();
    const quickPin = sanitizePin(credentials.quickPin);
    const existingUser = StorageService.getUsers().find(user => user.staffMemberId === draft.id);
    const duplicateUsername = StorageService.getUsers().some(user => user.username.toLowerCase() === username && user.id !== existingUser?.id);
    const certificateCard = draft.healthCertificate?.cardNumber.trim() || '';
    const certificateExpiry = draft.healthCertificate?.expiresAt || '';
    const missingFields = [
      !name && txt(lang, 'Full Name', 'الاسم الكامل'),
      !draft.role && txt(lang, 'Role', 'الدور'),
      !username && txt(lang, 'System Username', 'اسم مستخدم النظام'),
      !existingUser && !password && txt(lang, 'Password', 'كلمة المرور'),
      !quickPin && txt(lang, 'Quick Access PIN', 'رمز الدخول السريع'),
      !assignmentDraft.branchId && txt(lang, 'Branch Assignment', 'تعيين الفرع'),
      !certificateCard && txt(lang, 'Health Certificate Card', 'بطاقة الشهادة الصحية'),
      !certificateExpiry && txt(lang, 'Health Certificate Expiry', 'انتهاء الشهادة الصحية'),
    ].filter(Boolean);

    if (missingFields.length) {
      showError(txt(
        lang,
        `Complete staff setup before saving: ${missingFields.join(', ')}.`,
        `أكمل بيانات الموظف قبل الحفظ: ${missingFields.join('، ')}.`
      ));
      return;
    }
    if (duplicateUsername) {
      showError(txt(lang, 'System username is already in use.', 'اسم المستخدم مستخدم مسبقاً.'));
      return;
    }
    if (password && password.length < 6) {
      showError(txt(lang, 'Secure access password must be at least 6 characters.', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.'));
      return;
    }
    if (!/^\d{4,6}$/.test(quickPin)) {
      const message = txt(lang, 'Quick Access PIN must be 4 to 6 digits.', 'رمز الدخول السريع يجب أن يكون من 4 إلى 6 أرقام.');
      setPinError(message);
      showError(message);
      return;
    }

    const staffId = draft.id || `STF-${Date.now()}`;
    const userId = existingUser?.id || `USR-${Date.now()}`;
    const nameAr = draft.nameAr.trim() || name;
    const certificate = draft.healthCertificate ? {
      ...draft.healthCertificate,
      id: draft.healthCertificate.id || `HLC-${Date.now()}`,
      staffMemberId: staffId,
      status: healthCardStatus({ ...draft, id: staffId, nameEn: name, nameAr } as StaffMember) === 'expired'
        ? 'expired' as const
        : healthCardStatus({ ...draft, id: staffId, nameEn: name, nameAr } as StaffMember) === 'expiring_soon'
          ? 'expiring_soon' as const
          : 'valid' as const,
    } : undefined;

    const branchIds = Array.from(new Set([...(draft.branchIds || []), assignmentDraft.branchId].filter(Boolean)));
    const savedStaff = StorageService.saveStaffMember({
      ...draft,
      id: staffId,
      nameEn: name,
      nameAr,
      branchIds,
      healthCertificate: certificate,
      updatedAt: Date.now(),
      createdAt: draft.createdAt || Date.now(),
    });

    if (certificate) StorageService.saveHealthCertificate(certificate);

    const savedAssignments = StorageService.saveBranchStaffAssignment({
      ...assignmentDraft,
      id: assignmentDraft.id || `BSA-${Date.now()}`,
      staffMemberId: staffId,
      userId,
      role: draft.role,
      active: true,
      createdAt: assignmentDraft.createdAt || Date.now(),
      updatedAt: Date.now(),
    });

    StorageService.saveUser({
      id: userId,
      staffMemberId: staffId,
      name,
      username,
      role: userRoleForStaff(draft.role),
      primaryBranchId: assignmentDraft.branchId,
      branchIds,
      active: draft.active,
      createdAt: existingUser?.createdAt || Date.now(),
      ...(password ? { password } : {}),
      quickPin,
    } as any);

    setStaff(savedStaff);
    setAssignments(savedAssignments);
    toast(txt(lang, 'Staff credentials and branch access saved.', 'تم حفظ بيانات الموظف وصلاحيات الفرع.'), 'success');
    resetForm();
  };

  const statusBadge = (member: StaffMember) => {
    const status = healthCardStatus(member);
    if (status === 'valid') return <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{txt(lang, 'Valid', 'سارية')}</span>;
    if (status === 'expiring_soon') return <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">{txt(lang, 'Expires soon', 'تنتهي قريباً')}</span>;
    return <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">{txt(lang, 'Locked', 'موقوف')}</span>;
  };

  return (
    <div className="h-full overflow-y-auto bg-[#F2F2F7] text-[#1C1C1E] xl:overflow-hidden">
      <div className="grid grid-cols-1 gap-5 p-5 xl:h-full xl:grid-cols-[minmax(0,1fr)_430px]">
        <section className="flex min-h-0 flex-col xl:h-full xl:overflow-hidden">
          <div className="mb-5 flex shrink-0 flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#1E6B48]">Staff Directory</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight text-[#1C1C1E]">{txt(lang, 'Staff Management', 'إدارة الموظفين')}</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold text-[#8E8E93]">
                {txt(lang, 'Secure employee onboarding, terminal credentials, branch access, and compliance status.', 'إضافة الموظفين وبيانات الدخول وصلاحيات الفروع وحالة الامتثال.')}
              </p>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="h-11 rounded-xl bg-white px-4 text-sm font-black text-[#1E6B48] shadow-[0_4px_24px_rgba(0,0,0,0.02)] transition-all duration-200 ease-out active:scale-[0.97]"
            >
              {txt(lang, 'New Staff', 'موظف جديد')}
            </button>
          </div>

          <div className="mb-5 grid shrink-0 gap-4 sm:grid-cols-3">
            {[
              { label: txt(lang, 'Valid Cards', 'بطاقات سارية'), value: summary.valid, icon: BadgeCheck, tone: 'text-emerald-600 bg-emerald-50' },
              { label: txt(lang, '30-Day Warnings', 'تنبيهات 30 يوم'), value: summary.expiring, icon: AlertTriangle, tone: 'text-amber-600 bg-amber-50' },
              { label: txt(lang, 'Locked Out', 'موقوفون'), value: summary.expired, icon: ShieldAlert, tone: 'text-red-600 bg-red-50' },
            ].map(card => (
              <div key={card.label} className="rounded-2xl bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
                <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl ${card.tone}`}>
                  <card.icon size={22} />
                </div>
                <p className="text-3xl font-black tracking-tight text-[#1C1C1E]">{card.value}</p>
                <p className="mt-1 text-xs font-black uppercase tracking-wider text-[#8E8E93]">{card.label}</p>
              </div>
            ))}
          </div>

          <div className="grid min-h-0 grid-cols-1 gap-4 pb-4 sm:grid-cols-2 xl:flex-1 xl:overflow-y-auto">
            {staff.length === 0 && (
              <div className="col-span-full rounded-2xl bg-white p-10 text-center shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
                <UserPlus size={34} className="mx-auto mb-3 text-[#1E6B48] opacity-40" />
                <p className="font-black text-[#1C1C1E]">{txt(lang, 'No staff added yet', 'لا يوجد موظفون بعد')}</p>
                <p className="mt-1 text-sm font-semibold text-[#8E8E93]">
                  {txt(lang, 'Use the onboarding form to add your first cashier.', 'استخدم نموذج الإضافة لإضافة أول كاشير.')}
                </p>
              </div>
            )}
            {staff.map(member => {
              const assignedBranches = (member.branchIds || []).map(id => branches.find(branch => branch.id === id)?.nameEn || id);
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => editStaff(member)}
                  className="rounded-2xl bg-white p-5 text-left shadow-[0_4px_24px_rgba(0,0,0,0.02)] transition-all duration-200 ease-out active:scale-[0.97]"
                >
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[rgba(30,107,72,0.10)] text-sm font-black text-[#1E6B48]">
                        {initials(member.nameEn)}
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-black tracking-tight text-[#1C1C1E]">{txt(lang, member.nameEn, member.nameAr)}</h2>
                        <p className="truncate text-xs font-bold uppercase tracking-wide text-[#8E8E93]">{member.qiwaOccupation || 'Qiwa pending'}</p>
                      </div>
                    </div>
                    {statusBadge(member)}
                  </div>
                  <div className="mb-4 flex flex-wrap gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-black capitalize ${roleTone(member.role)}`}>{member.role}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${member.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {member.active ? txt(lang, 'Active', 'نشط') : txt(lang, 'Inactive', 'غير نشط')}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm font-semibold text-[#8E8E93]">
                    <p>{txt(lang, 'Branches', 'الفروع')}: <span className="text-[#1C1C1E]">{assignedBranches.join(', ') || txt(lang, 'Unassigned', 'غير معين')}</span></p>
                    <p>{txt(lang, 'Health Card', 'الشهادة الصحية')}: <span className="text-[#1C1C1E]">{member.healthCertificate?.cardNumber || txt(lang, 'Missing', 'غير موجودة')}</span></p>
                    <p>{txt(lang, 'Expires', 'تنتهي')}: <span className="text-[#1C1C1E]">{member.healthCertificate?.expiresAt || '-'}</span></p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="min-h-0 rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.02)] sm:p-6 xl:h-full xl:overflow-y-auto">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(30,107,72,0.10)] text-[#1E6B48]">
              <UserPlus size={24} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#1E6B48]">{txt(lang, 'Onboarding Console', 'وحدة الإضافة')}</p>
              <h2 className="text-2xl font-black tracking-tight text-[#1C1C1E]">{draft.id ? txt(lang, 'Edit Staff', 'تعديل موظف') : txt(lang, 'New Staff', 'موظف جديد')}</h2>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
          )}

          <form onSubmit={save} className="space-y-5">
            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-wider text-[#8E8E93]">{txt(lang, 'Full Staff Name', 'اسم الموظف الكامل')}</label>
              <input value={draft.nameEn} onChange={event => setDraft({ ...draft, nameEn: event.target.value })} placeholder="Full staff name" className={inputClass} />
              <input value={draft.nameAr} onChange={event => setDraft({ ...draft, nameAr: event.target.value })} placeholder="Arabic display name" className={inputClass} />
            </div>

            <div className="rounded-2xl bg-[#F9FAFB] p-4">
              <div className="mb-3 flex items-center gap-2 text-[#1E6B48]">
                <LockKeyhole size={18} />
                <p className="text-xs font-black uppercase tracking-wider">{txt(lang, 'Security Credentials', 'بيانات الدخول')}</p>
              </div>
              <div className="space-y-3">
                <input value={credentials.username} onChange={event => setCredentials({ ...credentials, username: event.target.value })} placeholder="System username" className={inputClass} />
                <input value={credentials.password} onChange={event => setCredentials({ ...credentials, password: event.target.value })} placeholder={draft.id ? 'New password (leave blank to keep current)' : 'Secure access password'} type="password" className={inputClass} />
                <div>
                  <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-[#8E8E93]">
                    {txt(lang, 'Quick Access PIN', 'رمز الدخول السريع')}
                  </label>
                  <input
                    value={credentials.quickPin}
                    onChange={event => updateQuickPin(event.target.value)}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="4-6 digit PIN"
                    className={`${inputClass} font-mono tracking-[0.24em] ${pinError ? 'border-[#FF3B30] bg-[#FFECEA]' : ''}`}
                  />
                  {pinError && <p className="mt-1.5 text-xs font-bold text-[#FF3B30]">{pinError}</p>}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <select value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value as StaffMember['role'] })} className={inputClass}>
                {['cashier', 'supervisor', 'manager'].map(role => <option key={role} value={role}>{role}</option>)}
              </select>
              <select value={assignmentDraft.branchId} onChange={event => setAssignmentDraft({ ...assignmentDraft, branchId: event.target.value })} className={inputClass}>
                {branches.map(branch => <option key={branch.id} value={branch.id}>{txt(lang, branch.nameEn, branch.nameAr)}</option>)}
              </select>
              <input value={draft.qiwaOccupation || ''} onChange={event => setDraft({ ...draft, qiwaOccupation: event.target.value })} placeholder="Qiwa occupation" className={inputClass} />
              <input value={draft.healthCertificate?.cardNumber || ''} onChange={event => setDraft({ ...draft, healthCertificate: { ...(draft.healthCertificate || { id: '', staffMemberId: '', expiresAt: '', status: 'valid' }), cardNumber: event.target.value } })} placeholder="Balady health card" className={inputClass} />
              <input type="date" value={draft.healthCertificate?.expiresAt || ''} onChange={event => setDraft({ ...draft, healthCertificate: { ...(draft.healthCertificate || { id: '', staffMemberId: '', cardNumber: '', status: 'valid' }), expiresAt: event.target.value } })} className={inputClass} />
              <label className="flex h-12 items-center justify-between rounded-xl bg-[#E9E9EB] px-4 text-sm font-bold text-[#1C1C1E]">
                {txt(lang, 'GOSI registered', 'مسجل في التأمينات')}
                <input type="checkbox" checked={!!draft.gosiRegistered} onChange={event => setDraft({ ...draft, gosiRegistered: event.target.checked })} className="h-5 w-5 accent-[#1E6B48]" />
              </label>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-2">
              {BRANCH_PERMISSIONS.map(permission => {
                const checked = assignmentDraft.permissions.includes(permission.key);
                return (
                  <label key={permission.key} className="flex items-center justify-between border-b border-slate-100 px-2 py-2.5 text-sm font-bold text-[#1C1C1E] last:border-0">
                    <span>{txt(lang, permission.en, permission.ar)}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={event => togglePermission(permission.key, event.target.checked)}
                      className="h-5 w-5 accent-[#1E6B48]"
                    />
                  </label>
                );
              })}
            </div>

            <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#1E6B48] text-sm font-black text-white shadow-[0_12px_28px_rgba(30,107,72,0.20)] transition-all duration-200 ease-out active:scale-[0.97]">
              <Save size={18} /> {txt(lang, 'Save Staff', 'حفظ الموظف')}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
};

export default StaffCompliance;
