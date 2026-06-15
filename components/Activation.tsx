import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, Phone, ShieldCheck, Star, Zap } from 'lucide-react';
import {
  activateLicense, startTrial,
} from '../services/licenseService';
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

  /* ── Trial confirmation state ── */
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 flex items-center justify-center p-4 relative overflow-hidden">

      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-0 rounded-3xl overflow-hidden shadow-2xl shadow-black/60">

        {/* ── Left panel: branding & features ── */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-10 text-white flex flex-col justify-between">
          <div>
            {/* Logo */}
            <div
              className="w-20 h-20 rounded-2xl overflow-hidden bg-white shadow-xl mb-6 cursor-default"
            >
              <img src={APP_LOGO_DATA_URL} alt="Oasis Dine RMS" className="w-full h-full object-contain p-2" />
            </div>

            <h1 className="text-3xl font-black mb-2 leading-tight">Oasis Dine RMS</h1>
            <p className="text-emerald-100 text-sm mb-8">Restaurant management and POS for Saudi Arabia</p>

            {/* Feature highlights */}
            <div className="space-y-4">
              {[
                { icon: <Zap size={16} />, title: 'ZATCA Invoice Data', desc: 'Invoice hash, QR, and UBL preparation' },
                { icon: <Star size={16} />, title: 'Tables, KDS, and Recipes', desc: 'Run FOH and BOH from one Firebase workspace' },
                { icon: <ShieldCheck size={16} />, title: 'Firestore Cloud Data', desc: 'Restaurant records stay in Firebase only' },
                { icon: <CheckCircle2 size={16} />, title: 'Arabic & English', desc: 'Fully bilingual, RTL-native interface' },
              ].map((f, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="bg-white/20 p-1.5 rounded-lg mt-0.5 flex-shrink-0">{f.icon}</div>
                  <div>
                    <p className="font-semibold text-sm">{f.title}</p>
                    <p className="text-emerald-200 text-xs">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-emerald-200 text-xs mt-8">
            © 2026 Oasis Dine RMS · All rights reserved<br />
            <span className="flex items-center gap-1.5 mt-1">
              <Phone size={12} />
              <span className="text-white font-semibold">{SUPPORT_PHONE}</span>
              <span className="text-emerald-300">(WhatsApp)</span>
            </span>
          </p>
        </div>

        {/* ── Right panel: activation form ── */}
        <div className="bg-white p-10 flex flex-col justify-center">

          {success ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={40} className="text-emerald-600" />
              </div>
              <h2 className="text-2xl font-black text-slate-800 mb-2">Activated!</h2>
              <p className="text-slate-500">Welcome to Oasis Dine RMS. Setting up your restaurant...</p>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-slate-900 p-2.5 rounded-xl">
                    <KeyRound size={22} className="text-emerald-400" />
                  </div>
                  <h2 className="text-2xl font-black text-slate-800">Activate Software</h2>
                </div>
                <p className="text-slate-500 text-sm">
                  Enter the License ID and License Key provided to you after purchase.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    License ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g.  BQL-SA-001"
                    value={licenseId}
                    onChange={e => { setLicenseId(e.target.value.toUpperCase()); setError(''); }}
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none text-slate-900 font-mono tracking-widest text-lg transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    License Key
                  </label>
                  <input
                    type="text"
                    placeholder="XXXX-XXXX-XXXX"
                    value={licenseKey}
                    onChange={e => {
                      // Auto-format with dashes
                      const raw = e.target.value.replace(/-/g, '').toUpperCase().slice(0, 12);
                      const fmt = [raw.slice(0, 4), raw.slice(4, 8), raw.slice(8, 12)].filter(Boolean).join('-');
                      setLicenseKey(fmt);
                      setError('');
                    }}
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:outline-none text-slate-900 font-mono tracking-[0.3em] text-lg transition-colors"
                    maxLength={14}
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleActivate}
                  disabled={loading}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 btn-spring disabled:opacity-70"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
                  {loading ? 'Validating...' : 'Activate Oasis Dine RMS'}
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                  <div className="relative text-center"><span className="bg-white px-3 text-xs text-slate-400">or</span></div>
                </div>

                <button
                  onClick={() => setShowTrialConfirm(true)}
                  className="w-full py-3 border-2 border-slate-200 hover:border-amber-400 text-slate-500 hover:text-amber-700 font-semibold rounded-xl transition-all text-sm btn-spring"
                >
                  Start {TRIAL_DAYS}-Day Free Trial →
                </button>
              </div>

              <div className="flex items-center justify-center gap-2 mt-6 text-slate-400 text-xs">
                <Phone size={13} />
                <span>Need a license? Call / WhatsApp:</span>
                <a href={`https://wa.me/966570030313`} target="_blank" rel="noreferrer"
                  className="font-bold text-emerald-600 hover:underline">{SUPPORT_PHONE}</a>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Trial confirmation modal ── */}
      {showTrialConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-amber-100 p-2.5 rounded-xl">
                <AlertTriangle size={22} className="text-amber-600" />
              </div>
              <h3 className="text-xl font-black text-slate-800">Start Free Trial?</h3>
            </div>
            <p className="text-slate-600 text-sm mb-4 leading-relaxed">
              You are about to start a <strong>{TRIAL_DAYS}-day free trial</strong> of Oasis Dine RMS.
              After the trial expires, you will need to purchase a license to continue using the software.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 space-y-2 text-sm text-amber-800">
              <p className="font-semibold">Trial terms:</p>
              <ul className="space-y-1 list-disc list-inside text-amber-700">
                <li>All features are fully available for {TRIAL_DAYS} days</li>
                <li>Your data will be preserved after purchasing a license</li>
                <li>One trial per installation</li>
                <li>To purchase: call <strong>{SUPPORT_PHONE}</strong></li>
              </ul>
            </div>
            <label className="flex items-start gap-3 cursor-pointer mb-5">
              <input
                type="checkbox"
                checked={trialConfirmChecked}
                onChange={e => setTrialConfirmChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-emerald-600"
              />
              <span className="text-sm text-slate-700">
                I understand this is a <strong>{TRIAL_DAYS}-day trial</strong> and I will need a license key to continue after it expires.
              </span>
            </label>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-5">
                {error}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowTrialConfirm(false); setTrialConfirmChecked(false); }}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleTrial}
                disabled={!trialConfirmChecked}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold btn-spring"
              >
                Start {TRIAL_DAYS}-Day Trial
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Activation;
