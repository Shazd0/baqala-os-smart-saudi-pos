import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  loadingLabel,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(28,28,30,0.24)] p-4 backdrop-blur-xl">
      <div className="w-full max-w-sm animate-shell-in overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0px_8px_32px_rgba(0,0,0,0.08)]">
        <div className="relative px-6 pb-4 pt-6 text-center">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-[#F2F2F7] text-[var(--ios-secondary)]"
            aria-label="Close confirmation"
          >
            <X size={16} />
          </button>
          <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${danger ? 'bg-[#FFECEA] text-[#FF3B30]' : 'bg-[var(--ios-accent-soft)] text-[var(--ios-accent)]'}`}>
            <AlertTriangle size={22} />
          </div>
          <h3 className="text-xl font-black tracking-tight text-[#1C1C1E]">{title}</h3>
          <p className="mt-2 whitespace-pre-line text-sm font-medium leading-relaxed text-[#8E8E93]">{message}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 px-5 pb-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl bg-[#F2F2F7] px-4 py-3 text-sm font-bold text-[#8E8E93]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            aria-busy={loading}
            data-loading={loading}
            className={`rounded-xl px-4 py-3 text-sm font-black text-white btn-spring ${danger ? 'bg-[#FF3B30]' : 'bg-[var(--ios-accent)]'}`}
          >
            {loading ? (loadingLabel || confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
