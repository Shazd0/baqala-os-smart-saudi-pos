import React, { useState } from 'react';
import { StorageService } from '../services/storageService';
import { AlertCircle, ArrowRight, LockKeyhole, ShieldCheck, Sparkles, Store } from 'lucide-react';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const trialMode = StorageService.isTrialMode();

  const triggerError = (message: string) => {
    setError(message);
    setShake(false);
    window.requestAnimationFrame(() => setShake(true));
    window.dispatchEvent(new CustomEvent('baqala:toast', {
      detail: { message, type: 'error', duration: 4500 },
    }));
    window.setTimeout(() => setShake(false), 520);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const normalizedUsername = username.trim();
      const secret = password.trim();
      if (trialMode) {
        StorageService.login(normalizedUsername || 'admin', '');
      } else if (!normalizedUsername || /^\d{4,6}$/.test(secret)) {
        StorageService.loginWithQuickPin(secret);
      } else {
        StorageService.login(normalizedUsername, secret);
      }
      onLogin();
    } catch (err: any) {
      triggerError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const addPinDigit = (digit: string) => {
    if (!loading) setPassword(current => `${current}${digit}`.slice(0, 6));
  };

  const clearPin = () => {
    if (!loading) setPassword('');
  };

  return (
    <div className="ios-app relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[#F2F2F7] p-5">
      <div className="pointer-events-none absolute left-[-10%] top-[-18%] h-[420px] w-[420px] rounded-full bg-[rgba(0,122,255,0.10)] blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-18%] right-[-8%] h-[460px] w-[460px] rounded-full bg-[rgba(88,86,214,0.10)] blur-3xl" />

      <div className={`relative grid w-full max-w-5xl overflow-hidden rounded-[24px] border border-white/80 bg-white shadow-[0px_12px_48px_rgba(0,0,0,0.04),0px_2px_4px_rgba(0,0,0,0.01)] lg:grid-cols-[0.95fr_1.05fr] ${shake ? 'animate-login-shake' : 'animate-shell-in'}`}>
        <div className="hidden min-h-[620px] flex-col justify-between border-r border-[#E5E5EA] bg-white p-10 lg:flex">
          <div>
            <div className="mb-8 inline-flex h-16 w-16 items-center justify-center rounded-[22px] bg-[rgba(0,122,255,0.10)] text-[#007AFF] shadow-[0_10px_30px_rgba(0,122,255,0.10)]">
              <Store size={34} />
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-5xl font-black tracking-tight text-[#1C1C1E]">Oasis Dine</h1>
              <span className="rounded-full bg-[#E9E9EB] px-3 py-1 text-[11px] font-black uppercase tracking-widest text-[#1C1C1E]">RMS</span>
            </div>
            <p className="mt-4 max-w-sm text-base font-semibold leading-relaxed text-[#8E8E93]">
              {trialMode
                ? 'Trial mode runs completely offline with realistic restaurant, POS, inventory, and delivery data.'
                : 'Premium Saudi restaurant operations for POS, KDS, QR ordering, ZATCA, inventory, and staff compliance.'}
            </p>
            <div className="mt-8 grid gap-3">
              {(trialMode ? ['Offline trial data', 'Touch terminal optimized', 'Password-free demo'] : ['Firestore-only data', 'Touch terminal optimized', 'Secure shift access']).map(item => (
                <div key={item} className="flex items-center gap-3 rounded-2xl bg-[#F5F5F7] px-4 py-3 text-sm font-bold text-[#1C1C1E]">
                  <Sparkles size={16} className="text-[#007AFF]" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-[#F5F5F7] p-4 text-sm font-bold text-[#8E8E93]">
            <ShieldCheck size={18} className="text-[#34C759]" /> {trialMode ? 'No Firebase or password is required for trial mode.' : 'Login required every time the app opens.'}
          </div>
        </div>

        <form onSubmit={submit} className="relative p-7 sm:p-10 md:p-12">
          <div className="mb-7">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#007AFF] text-white shadow-[0_12px_32px_rgba(0,122,255,0.20)]">
              <LockKeyhole />
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-4xl font-black tracking-tight text-[#1C1C1E]">Welcome Back</h2>
              <span className="rounded-full bg-[#E9E9EB] px-2.5 py-1 text-[10px] font-black text-[#1C1C1E]">RMS</span>
            </div>
            <p className="mt-2 max-w-md text-sm font-semibold leading-relaxed text-[#8E8E93]">
              {trialMode ? 'Open the full offline trial workspace. No password or Firebase connection is required.' : 'Please enter your credentials or quick access PIN to open the shift.'}
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-3 rounded-2xl bg-[#FFECEA] px-4 py-3 text-sm font-black text-[#FF3B30]">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <label className="mb-2 block text-sm font-black tracking-tight text-[#1C1C1E]">Username</label>
          <input
            autoFocus
            value={username}
            onChange={event => setUsername(event.target.value)}
            disabled={loading || trialMode}
            placeholder={trialMode ? 'admin trial user' : 'admin, cashier username, or leave blank for PIN'}
            className="mb-5 min-h-[48px] w-full rounded-[14px] border-[1.5px] border-transparent bg-[#E9E9EB] px-4 text-base font-bold text-[#1C1C1E] outline-none transition-all duration-200 ease-out placeholder:text-[#A9A9A9] focus:border-[#007AFF] focus:bg-white focus:shadow-[0_0_0_4px_rgba(0,122,255,0.08)] active:scale-[0.99] disabled:opacity-60"
          />

          {trialMode ? (
            <div className="rounded-[24px] bg-[rgba(0,122,255,0.08)] p-4 text-sm font-bold leading-relaxed text-[#007AFF]">
              Trial mode will sign in as the administrator and load complete mock data for every tab, including product/menu images, tables, KDS, inventory, purchases, staff, customers, reports, and delivery orders.
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-black tracking-tight text-[#1C1C1E]">Password / PIN</label>
                <button type="button" disabled={loading} onClick={() => setShowPassword(value => !value)} className="rounded-full bg-[rgba(0,122,255,0.10)] px-4 py-2 text-xs font-black text-[#007AFF] transition-all duration-200 ease-out active:scale-95 disabled:opacity-50">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={event => setPassword(event.target.value)}
                disabled={loading}
                placeholder="Enter password or quick PIN"
                className="min-h-[48px] w-full rounded-[14px] border-[1.5px] border-transparent bg-[#E9E9EB] px-4 font-mono text-base font-bold text-[#1C1C1E] outline-none transition-all duration-200 ease-out placeholder:text-[#A9A9A9] focus:border-[#007AFF] focus:bg-white focus:shadow-[0_0_0_4px_rgba(0,122,255,0.08)] active:scale-[0.99] disabled:opacity-60"
              />

              <div className="mt-6 rounded-[24px] bg-[#F5F5F7] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-widest text-[#8E8E93]">Quick Access PIN</p>
                  <button type="button" disabled={loading} onClick={clearPin} className="rounded-full px-3 py-1 text-xs font-black text-[#FF3B30] transition-all duration-200 ease-out active:scale-95 disabled:opacity-50">Clear</button>
                </div>
                <div className="grid grid-cols-3 justify-items-center gap-3">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(digit => (
                    <button
                      key={digit}
                      type="button"
                      disabled={loading}
                      onClick={() => addPinDigit(digit)}
                      className="flex h-14 w-14 items-center justify-center rounded-full bg-[#E9E9EB] text-xl font-black text-[#1C1C1E] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition-all duration-200 ease-out hover:brightness-95 active:scale-[0.96] disabled:opacity-50 sm:h-16 sm:w-16"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setPassword(current => current.slice(0, -1))}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FFECEA] text-sm font-black text-[#FF3B30] transition-all duration-200 ease-out hover:brightness-95 active:scale-[0.96] disabled:opacity-50 sm:h-16 sm:w-16"
                  >
                    DEL
                  </button>
                </div>
              </div>
            </>
          )}

          <button
            disabled={loading}
            aria-busy={loading}
            className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#007AFF] px-6 text-sm font-black tracking-tight text-white shadow-[0_14px_34px_rgba(0,122,255,0.24)] transition-all duration-200 ease-out hover:brightness-95 active:scale-[0.96] disabled:opacity-70"
          >
            {loading && <span className="ios-spinner" />}
            <span>{loading ? (trialMode ? 'Loading trial...' : 'Connecting...') : (trialMode ? 'Enter Trial Demo' : 'Unlock POS')}</span>
            {!loading && <ArrowRight size={17} />}
          </button>
          <p className="mt-5 text-center text-xs font-semibold text-[#8E8E93]">
            {trialMode ? 'Offline mock workspace. No Firebase reads or writes are used.' : 'Firebase-backed access for cashier terminals and restaurant administrators.'}
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;
