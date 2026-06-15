import React, { useMemo, useState } from 'react';
import { AlertCircle, Bug, CheckCircle2, Loader2, Mail, Send, ShieldCheck, X } from 'lucide-react';
import {
  buildDeveloperBugReportPayload,
  submitDeveloperBugReport,
  type DeveloperTelemetryContext,
} from '../services/developerTelemetryService';
import type { DeveloperReportCategory } from '../types/developerTelemetry';
import { useToast } from './Toast';

const CATEGORY_OPTIONS: Array<{ value: DeveloperReportCategory; label: string }> = [
  { value: 'pos_crash', label: 'POS Crash' },
  { value: 'zatca_signing_failure', label: 'ZATCA Signing Failure' },
  { value: 'inventory_mismatch', label: 'Inventory Mismatch' },
  { value: 'hardware_printer_failure', label: 'Hardware / Printer Failure' },
  { value: 'payment_gateway_failure', label: 'Payment Gateway Failure' },
  { value: 'sync_latency', label: 'Sync or Network Latency' },
  { value: 'other', label: 'Other Technical Issue' },
];

interface DeveloperBugReportConsoleProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  context: DeveloperTelemetryContext;
}

const motionStyle = { transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' };

const DeveloperBugReportConsole: React.FC<DeveloperBugReportConsoleProps> = ({
  open,
  onOpen,
  onClose,
  context,
}) => {
  const { toast } = useToast();
  const [category, setCategory] = useState<DeveloperReportCategory>('pos_crash');
  const [screenContext, setScreenContext] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deliveryState, setDeliveryState] = useState<'idle' | 'success' | 'queued'>('idle');

  const selectedTitle = useMemo(
    () => CATEGORY_OPTIONS.find(option => option.value === category)?.label || 'Technical Issue',
    [category]
  );

  const metadataPills = [
    `v${context.currentReactStateDump.appVersion || '1.0.2'}`,
    context.targetBranchId || 'No branch',
    context.networkSourceType,
    context.activeUserSessionName || 'Unknown user',
  ];

  const resetAndClose = () => {
    if (submitting) return;
    setDeliveryState('idle');
    onClose();
  };

  const submitReport = async () => {
    if (!description.trim()) {
      toast('Please describe what happened before sending the report.', 'warning');
      return;
    }

    setSubmitting(true);
    setDeliveryState('idle');

    const payload = buildDeveloperBugReportPayload(
      {
        category,
        title: selectedTitle,
        screenContext: screenContext.trim() || 'Not specified',
        description: description.trim(),
      },
      context
    );

    const result = await submitDeveloperBugReport(payload);
    setSubmitting(false);

    if (result.delivered) {
      setDeliveryState('success');
      toast('Diagnostics landed in the developer queue for shhahhzzadd@gmail.com.', 'success');
      setDescription('');
      setScreenContext('');
      return;
    }

    setDeliveryState('queued');
    toast(result.message, 'warning', 5500);
  };

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="fixed bottom-6 right-5 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-[#007AFF] text-white shadow-[0_16px_36px_rgba(0,122,255,0.28)] ring-4 ring-white/80 active:scale-[0.97] sm:bottom-8 sm:right-8"
        style={motionStyle}
        aria-label="Report a bug directly to the programmer"
        title="Report a bug directly to the programmer"
      >
        <Bug size={24} strokeWidth={2.4} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-xl">
          <div className="w-full max-w-xl rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_12px_48px_rgba(0,0,0,0.06)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#007AFF]">
                  <ShieldCheck size={14} />
                  Direct Programmer Pipe
                </div>
                <h2 className="text-2xl font-black tracking-tight text-slate-950">Report a Software Bug</h2>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
                  Tell us what happened and where the error appeared. This report goes directly to the programmer, and the fix will be handled directly by the programming team.
                </p>
              </div>
              <button
                type="button"
                onClick={resetAndClose}
                disabled={submitting}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"
                aria-label="Close developer report console"
              >
                <X size={18} />
              </button>
            </div>

            <section className="mb-5 rounded-2xl bg-slate-50 p-4">
              <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                Developer System Data Status
              </p>
              <div className="flex flex-wrap gap-2">
                {metadataPills.map(pill => (
                  <span
                    key={pill}
                    className="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-700"
                  >
                    {pill}
                  </span>
                ))}
              </div>
            </section>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-400">What is the issue?</span>
                <select
                  value={category}
                  onChange={event => setCategory(event.target.value as DeveloperReportCategory)}
                  className="h-11 w-full rounded-xl border-0 bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none focus:bg-white focus:ring-[1.5px] focus:ring-[#007AFF]"
                  style={motionStyle}
                >
                  {CATEGORY_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-400">Where did it happen?</span>
                <input
                  value={screenContext}
                  onChange={event => setScreenContext(event.target.value)}
                  placeholder="Example: POS payment screen, Table 4 checkout, ZATCA settings"
                  className="h-11 w-full rounded-xl border-[1.5px] border-transparent bg-[#E9E9EB] px-4 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#007AFF] focus:bg-white"
                  style={motionStyle}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-400">What happened?</span>
                <textarea
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  placeholder="Describe the exact error, what you clicked, and what should have happened instead."
                  rows={6}
                  className="w-full resize-none rounded-xl border-[1.5px] border-transparent bg-[#E9E9EB] px-4 py-3 text-sm font-semibold leading-relaxed text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#007AFF] focus:bg-white"
                  style={motionStyle}
                />
              </label>
            </div>

            {deliveryState !== 'idle' && (
              <div className={`mt-5 flex items-start gap-3 rounded-2xl px-4 py-3 ${
                deliveryState === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                {deliveryState === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <p className="text-sm font-bold leading-relaxed">
                  {deliveryState === 'success'
                    ? '200 OK confirmed. Diagnostics have landed in the developer queue.'
                    : 'Network delivery is unavailable. The report was saved locally for developer review.'}
                </p>
              </div>
            )}

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={submitReport}
                disabled={submitting}
                className="flex h-13 min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#5856D6] px-5 text-sm font-black text-white shadow-[0_14px_30px_rgba(88,86,214,0.24)] active:scale-[0.97] disabled:opacity-60"
                style={motionStyle}
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                {submitting ? 'Shipping diagnostics...' : 'Ship Report Directly to Product Manager'}
              </button>
              <p className="flex items-center justify-center gap-2 text-center text-xs font-bold text-slate-400">
                <Mail size={13} />
                Routed securely to shhahhzzadd@gmail.com through the developer endpoint.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DeveloperBugReportConsole;
