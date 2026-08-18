import React, { useState } from 'react';
import { StorageService } from '../services/storageService';
import { APP_LOGO_DATA_URL } from '../services/appLogo';
import { AlertCircle, ArrowRight } from 'lucide-react';

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
    <div className="ios-app relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[var(--ios-bg)] p-5">
      <div className="pointer-events-none absolute -left-16 top-0 h-[380px] w-[380px] rounded-full bg-[var(--ios-accent-soft)] blur-3xl" />
      <div className="pointer-events-none absolute -right-10 bottom-0 h-[320px] w-[320px] rounded-full bg-[rgba(196,163,90,0.16)] blur-3xl" />

      <form
        onSubmit={submit}
        className={`relative w-full max-w-md rounded-[28px] border border-white bg-white p-7 shadow-[0_18px_50px_rgba(26,33,28,0.06)] sm:p-10 ${shake ? 'animate-login-shake' : 'animate-shell-in'}`}
      >
        <img src={APP_LOGO_DATA_URL} alt="Baqala OS" className="mb-6 h-14 w-14 rounded-[18px] object-contain" />
        <h1 className="text-4xl font-extrabold tracking-tight text-[var(--ios-text)]">Baqala OS</h1>
        <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--ios-secondary)]">
          {trialMode
            ? 'Open the grocery till with sample products, credit book, and invoices. No password needed.'
            : 'Sign in with your username or cashier PIN to open the shift.'}
        </p>

        {error && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#FFECEA] px-4 py-3 text-sm font-bold text-[#C2412D]">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <label className="mt-7 mb-2 block text-sm font-bold text-[var(--ios-text)]">Username</label>
        <input
          autoFocus
          value={username}
          onChange={event => setUsername(event.target.value)}
          disabled={loading || trialMode}
          placeholder={trialMode ? 'admin' : 'admin, cashier, or leave blank for PIN'}
          className="ios-input"
        />

        {trialMode ? (
          <p className="mt-4 rounded-2xl bg-[var(--ios-accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--ios-accent)]">
            Trial signs in as administrator with grocery mock data. Nothing is written to Firebase.
          </p>
        ) : (
          <>
            <div className="mb-2 mt-5 flex items-center justify-between">
              <label className="text-sm font-bold text-[var(--ios-text)]">Password / PIN</label>
              <button type="button" disabled={loading} onClick={() => setShowPassword(value => !value)} className="ios-button-text min-h-0 px-2 text-xs">
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={event => setPassword(event.target.value)}
              disabled={loading}
              placeholder="Password or 4–6 digit PIN"
              className="ios-input font-mono"
            />

            <div className="mt-5 rounded-2xl bg-[var(--ios-fill)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--ios-secondary)]">Quick PIN</p>
                <button type="button" disabled={loading} onClick={clearPin} className="text-xs font-bold text-[#C2412D]">Clear</button>
              </div>
              <div className="grid grid-cols-3 justify-items-center gap-3">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(digit => (
                  <button
                    key={digit}
                    type="button"
                    disabled={loading}
                    onClick={() => addPinDigit(digit)}
                    className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-xl font-extrabold text-[var(--ios-text)] active:scale-[0.96] disabled:opacity-50"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setPassword(current => current.slice(0, -1))}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFECEA] text-sm font-bold text-[#C2412D] active:scale-[0.96] disabled:opacity-50"
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
          className="ios-button-primary mt-7 h-12 w-full"
        >
          {loading && <span className="ios-spinner" />}
          <span>{loading ? (trialMode ? 'Opening till…' : 'Signing in…') : (trialMode ? 'Enter trial till' : 'Unlock POS')}</span>
          {!loading && <ArrowRight size={17} />}
        </button>
      </form>
    </div>
  );
};

export default Login;
