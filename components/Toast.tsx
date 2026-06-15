import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  exiting: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export const useToast = () => useContext(ToastContext);

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={18} />,
  error:   <XCircle size={18} />,
  warning: <AlertCircle size={18} />,
  info:    <Info size={18} />,
  loading: <Loader2 size={18} className="animate-spin" />,
};

const COLORS: Record<ToastType, string> = {
  success: 'text-[#34C759]',
  error:   'text-[#FF3B30]',
  warning: 'text-[#FF3B30]',
  info:    'text-[var(--ios-accent)]',
  loading: 'text-[var(--ios-accent)]',
};

const DURATIONS: Record<ToastType, number> = {
  success: 3000,
  error:   5000,
  warning: 4000,
  info:    3500,
  loading: 3000,
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 380);
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'success', duration?: number) => {
    const id = ++counter.current;
    setItems(prev => [...prev, { id, message, type, exiting: false }]);
    const ms = duration ?? DURATIONS[type];
    setTimeout(() => dismiss(id), ms);
  }, [dismiss]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; type?: ToastType; duration?: number }>).detail;
      if (detail?.message) toast(detail.message, detail.type, detail.duration);
    };
    window.addEventListener('baqala:toast', handler);
    return () => window.removeEventListener('baqala:toast', handler);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-5 z-[2147483647] flex flex-col items-center gap-2.5 px-4">
        {items.map(t => (
          <div
            key={t.id}
            className={`
              pointer-events-auto flex max-w-[min(92vw,420px)] cursor-default select-none items-center gap-3
              rounded-2xl border border-white/80 bg-white/95 px-4 py-3 text-[#1C1C1E]
              shadow-[0px_8px_32px_rgba(0,0,0,0.06),0px_1px_2px_rgba(0,0,0,0.04)]
              backdrop-blur-xl
              ${t.exiting ? 'animate-toast-out' : 'animate-toast-in'}
            `}
          >
            <span className={`flex-shrink-0 ${COLORS[t.type]}`}>{ICONS[t.type]}</span>
            <p className="flex-1 text-sm font-semibold leading-snug text-[#1C1C1E]">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#F2F2F7] text-[#8E8E93] transition-opacity hover:opacity-80"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
