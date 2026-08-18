import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, Phone } from 'lucide-react';
import { activateLicense, startTrial } from '../services/licenseService';
import { APP_LOGO_DATA_URL } from '../services/appLogo';

interface ActivationProps {
  onActivated: () => void;
}

const TRIAL_DAYS = 14;
const SUPPORT_PHONE = '+966 570 030 313';

const Activation: React.FC<ActivationProps> = ({ onActivated }) => {
  const [licenseId, setLicenseId] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showTrialConfirm, setShowTrialConfirm] = useState(false);
  const [trialConfirmChecked, setTrialConfirmChecked] = useState(false);

  const handleActivate = async () => {
    setError('');
    if (!licenseId.trim() || !licenseKey.trim()) {
      setError('Please enter both License ID and License Key.');
      return;
    }
    setLoading(true);
    try {
      await activateLicense(licenseId.trim(), licenseKey.trim());
      setSuccess(true);
      window.setTimeout(onActivated, 1400);
    } catch (activationError: any) {
      setError(activationError?.message || 'Activation failed. Please check the license and internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleTrial = async () => {
    if (!trialConfirmChecked) return;
    setLoading(true);
    setError('');
    try {
      await startTrial();
      setShowTrialConfirm(false);
      onActivated();
    } catch (trialError: any) {
      setError(trialError?.message || 'Trial activation failed. Please connect to the internet and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ios-app relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--ios-bg)] p-4">
      <div className="pointer-events-none absolute -left-20 top-0 h-80 w-80 rounded-full bg-[var(--ios-accent-soft)] blur-3xl" />
      <div className="pointer-events-none absolute -right-10 bottom-0 h-72 w-72 rounded-full bg-[rgba(196,163,90,0.18)] blur-3xl" />

      <div className="relative w-full max-w-lg rounded-[28px] border border-white bg-white p-8 shadow-[0_18px_50px_rgba(26,33,28,0.06)] sm:p-10">
        {success ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--ios-accent-soft)]">
              <CheckCircle2 size={36} className="text-[var(--ios-accent)]" />
            </div>
            <h2 className="text-2xl font-extrabold text-[var(--ios-text)]">Activated</h2>
            <p className="mt-2 text-sm text-[var(--ios-secondary)]">Opening your baqala workspace…</p>
          </div>
        ) : (
          <>
            <img src={APP_LOGO_DATA_URL} alt="Baqala OS" className="mb-5 h-14 w-14 rounded-[18px] object-contain" />
            <h1 className="text-4xl font-extrabold tracking-tight text-[var(--ios-text)]">Baqala OS</h1>
            <p className="mt-2 text-sm font-medium text-[var(--ios-secondary)]">
              Smart Saudi grocery POS — barcode till, stock, credit book, and ZATCA invoices.
            </p>

            <div className="mt-8 space-y-4">
              <div>
                <label className="ios-label">License ID</label>
                <input
                  type="text"
                  placeholder="BQL-SA-001"
                  value={licenseId}
                  onChange={e => { setLicenseId(e.target.value.toUpperCase()); setError(''); }}
                  className="ios-input mt-1.5 font-mono tracking-widest"
                />
              </div>
              <div>
                <label className="ios-label">License Key</label>
                <input
                  type="text"
                  placeholder="XXXX-XXXX-XXXX"
                  value={licenseKey}
                  onChange={e => {
                    const raw = e.target.value.replace(/-/g, '').toUpperCase().slice(0, 12);
                    const fmt = [raw.slice(0, 4), raw.slice(4, 8), raw.slice(8, 12)].filter(Boolean).join('-');
                    setLicenseKey(fmt);
                    setError('');
                  }}
                  className="ios-input mt-1.5 font-mono tracking-[0.2em]"
                  maxLength={14}
                />
              </div>

              {error && (
                <div className="rounded-xl bg-[#FFECEA] px-4 py-3 text-sm font-semibold text-[#C2412D]">{error}</div>
              )}

              <button
                onClick={handleActivate}
                disabled={loading}
                className="ios-button-primary w-full"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <KeyRound size={20} />}
                {loading ? 'Validating…' : 'Activate Baqala OS'}
              </button>

              <button
                onClick={() => setShowTrialConfirm(true)}
                className="ios-button-secondary w-full"
              >
                Start {TRIAL_DAYS}-day free trial
              </button>
            </div>

            <p className="mt-6 flex items-center justify-center gap-2 text-xs text-[var(--ios-secondary)]">
              <Phone size={13} />
              WhatsApp
              <a href="https://wa.me/966570030313" target="_blank" rel="noreferrer" className="font-bold text-[var(--ios-accent)]">
                {SUPPORT_PHONE}
              </a>
            </p>
          </>
        )}
      </div>

      {showTrialConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(26,33,28,0.28)] p-4">
          <div className="w-full max-w-md rounded-[24px] bg-white p-7 shadow-[0_18px_50px_rgba(26,33,28,0.12)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-xl bg-[#FFF4E0] p-2.5">
                <AlertTriangle size={22} className="text-[#C4A35A]" />
              </div>
              <h3 className="text-xl font-extrabold text-[var(--ios-text)]">Start free trial?</h3>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-[var(--ios-secondary)]">
              You are about to start a <strong>{TRIAL_DAYS}-day trial</strong> of Baqala OS. After it expires you will need a license to keep using the till.
            </p>
            <label className="mb-5 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={trialConfirmChecked}
                onChange={e => setTrialConfirmChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--ios-accent)]"
              />
              <span className="text-sm text-[var(--ios-text)]">
                I understand this is a {TRIAL_DAYS}-day trial and a license is required afterwards.
              </span>
            </label>
            {error && (
              <div className="mb-4 rounded-xl bg-[#FFECEA] px-4 py-3 text-sm font-semibold text-[#C2412D]">{error}</div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowTrialConfirm(false); setTrialConfirmChecked(false); }}
                className="ios-button-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleTrial}
                disabled={!trialConfirmChecked || loading}
                className="ios-button-primary flex-1"
              >
                Start trial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Activation;
