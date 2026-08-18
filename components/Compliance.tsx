import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Language, Transaction, ZatcaState, StoreConfig } from '../types';
import { StorageService } from '../services/storageService';
import {
  AlertCircle, CheckCircle, Clock, Copy, Download, ExternalLink,
  FileCode, KeyRound, Link2, RefreshCw, Shield, ShieldCheck,
  ChevronRight, Loader2, XCircle,
} from 'lucide-react';
import { useToast } from './Toast';
import { INSECURE_HASH_PREFIX, verifyInvoiceSignature } from '../services/zatcaCrypto';
import { generateZatcaCSR } from '../services/zatcaCSR';
import { generateUBLInvoice, generateTestInvoice } from '../services/zatcaUBL';
import { signInvoiceXAdES, signInvoiceXAdESDev } from '../services/zatcaXAdES';
import {
  submitCSRForCompliance,
  runComplianceCheck,
  getProductionCsid,
  reportInvoice,
  clearInvoice,
  isApiError,
  decodeZatcaCertificate,
  parseCertExpiry,
} from '../services/zatcaAPI';
import { ZATCA_GENESIS_PIH } from '../services/zatcaCrypto';

interface ComplianceProps { lang: Language; }

function copy(lang: Language, en: string, ar: string): string {
  return lang === 'ar' ? ar : en;
}

function truncateHash(value?: string, size = 20): string {
  if (!value) return '—';
  return value.length > size ? `${value.slice(0, size)}…` : value;
}

const ONBOARDING_LABELS: Record<ZatcaState['onboardingStatus'], { en: string; ar: string }> = {
  not_configured: { en: 'Not configured', ar: 'غير مهيأ' },
  csr_generated:  { en: 'CSR generated', ar: 'تم إنشاء طلب الشهادة' },
  sandbox_ready:  { en: 'Sandbox ready', ar: 'جاهز للبيئة التجريبية' },
  production_ready: { en: 'Production ready', ar: 'جاهز للإنتاج' },
};

const TX_STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  pending:          { en: 'Pending', ar: 'قيد الانتظار' },
  sandbox_pending:  { en: 'Sandbox pending', ar: 'قيد الانتظار (تجريبي)' },
  reported:         { en: 'Reported', ar: 'تم الإبلاغ' },
  sandbox_reported: { en: 'Sandbox reported', ar: 'تم الإبلاغ (تجريبي)' },
  failed:           { en: 'Failed', ar: 'فشل' },
};

// ── Small helpers ─────────────────────────────────────────────────────────────

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-[var(--ios-tertiary)]">{label}</span>
    <span dir="ltr" className="min-w-0 break-all text-right font-mono text-[11px] text-[var(--ios-text)]">{value}</span>
  </div>
);

const StepDot: React.FC<{ step: number; current: number; done: boolean }> = ({ step, current, done }) => {
  const active = step === current;
  return (
    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black transition-colors ${
      done    ? 'bg-[var(--ios-accent)] text-white'
      : active ? 'bg-[var(--ios-accent)] text-white ring-2 ring-[var(--ios-accent)] ring-offset-2'
               : 'bg-[var(--ios-fill)] text-[var(--ios-tertiary)]'
    }`}>
      {done ? <CheckCircle size={16} /> : step}
    </div>
  );
};

function downloadText(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// ── Main component ────────────────────────────────────────────────────────────

const Compliance: React.FC<ComplianceProps> = ({ lang }) => {
  const { toast } = useToast();

  const [transactions, setTransactions]  = useState<Transaction[]>([]);
  const [audits, setAudits]              = useState<any[]>([]);
  const [zatca, setZatca]               = useState<ZatcaState>(StorageService.getZatcaState());
  const [config, setConfig]             = useState<StoreConfig>(StorageService.getConfig());
  const [chain, setChain]               = useState<{ valid: boolean; brokenIndex?: number }>({ valid: true });
  const [chainStats, setChainStats]     = useState(() => StorageService.getZatcaChainStats());
  const [signatureCheck, setSignatureCheck] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');

  // Wizard state
  const [wizardStep, setWizardStep]     = useState(1);
  const [working, setWorking]           = useState(false);

  // Step 1 form
  const [formBizName, setFormBizName]   = useState('');
  const [formVat, setFormVat]           = useState('');
  const [formAddress, setFormAddress]   = useState('');
  const [formEnv, setFormEnv]           = useState<'sandbox' | 'production'>('sandbox');
  const [formInvoiceType, setFormInvoiceType] = useState<'simplified' | 'standard' | 'both'>('simplified');
  const [generatedCsr, setGeneratedCsr] = useState('');

  // Step 2 form
  const [otpValue, setOtpValue]         = useState('');
  const [csidResult, setCsidResult]     = useState<{ csid: string; secret: string; requestId: string } | null>(null);

  // Step 3 compliance tests
  type TestResult = { name: string; status: 'pass' | 'fail' | 'running' | 'pending'; message: string };
  const [testResults, setTestResults]   = useState<TestResult[]>([]);
  const [allTestsPassed, setAllTestsPassed] = useState(false);

  const loadData = useCallback(() => {
    setTransactions(StorageService.getTransactions());
    setAudits(StorageService.getAuditLogs());
    const z = StorageService.getZatcaState();
    setZatca(z);
    setConfig(StorageService.getConfig());
    setChain(StorageService.validateCryptographicChain());
    setChainStats(StorageService.getZatcaChainStats());
    setSignatureCheck('idle');
    // Pre-fill form from config
    setFormBizName(prev => prev || StorageService.getConfig().nameEn);
    setFormVat(prev => prev || StorageService.getConfig().vatNumber);
    setFormAddress(prev => prev || StorageService.getConfig().address || '');
    setFormEnv(z.mode ?? 'sandbox');
    // Restore wizard step from state
    if (z.onboardingStatus === 'csr_generated' && z.csrPayload) {
      setGeneratedCsr(atob(z.csrPayload));
      setWizardStep(2);
    }
    if (z.complianceCsid && z.complianceSecretKey) {
      setCsidResult({ csid: z.complianceCsid, secret: z.complianceSecretKey, requestId: z.complianceRequestId ?? '' });
      if (z.onboardingStatus === 'csr_generated') setWizardStep(3);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const pending  = useMemo(() => transactions.filter(tx => tx.zatcaStatus === 'pending' || tx.zatcaStatus === 'sandbox_pending'), [transactions]);
  const reported = useMemo(() => transactions.filter(tx => tx.zatcaStatus === 'reported' || tx.zatcaStatus === 'sandbox_reported'), [transactions]);
  const failed   = useMemo(() => transactions.filter(tx => tx.zatcaStatus === 'failed'), [transactions]);
  const latestSigned = useMemo(() => transactions.find(tx => tx.invoiceHash && tx.cryptographicSignature), [transactions]);
  const insecureHashes = useMemo(() => transactions.filter(tx => tx.invoiceHash?.startsWith(INSECURE_HASH_PREFIX)).length, [transactions]);

  const statusText  = copy(lang, ONBOARDING_LABELS[zatca.onboardingStatus].en, ONBOARDING_LABELS[zatca.onboardingStatus].ar);
  const statusLabel = (status?: string) => {
    const lbl = status ? TX_STATUS_LABELS[status] : undefined;
    return lbl ? copy(lang, lbl.en, lbl.ar) : (status ?? '—');
  };

  const showWizard = zatca.onboardingStatus === 'not_configured' || zatca.onboardingStatus === 'csr_generated';

  // ── Wizard actions ──────────────────────────────────────────────────────────

  const handleGenerateCSR = async () => {
    if (!formBizName.trim() || !formVat.trim()) {
      toast(copy(lang, 'Business name and VAT number are required.', 'اسم الشركة ورقم الضريبة مطلوبان.'), 'error');
      return;
    }
    setWorking(true);
    try {
      const result = await generateZatcaCSR({
        vatNumber:              formVat.trim(),
        organizationName:       formBizName.trim(),
        organizationIdentifier: '',
        commonName:             formBizName.trim(),
        address:                formAddress.trim() || 'Riyadh, Saudi Arabia',
        invoiceType:            formInvoiceType,
        solutionName:           'Baqala OS',
        environment:            formEnv,
      });

      setGeneratedCsr(result.csrPem);
      StorageService.saveZatcaState({
        onboardingStatus: 'csr_generated',
        mode:             formEnv,
        csrPayload:       btoa(result.csrPem),
        privateKeyPem:    result.privateKeyPem,
        publicKeyPem:     result.publicKeyPem,
        deviceSerial:     result.deviceSerial,
        csrAddress:       formAddress.trim(),
        invoiceType:      formInvoiceType,
      });
      loadData();
      setWizardStep(2);
      toast(copy(lang, 'CSR generated successfully!', 'تم إنشاء طلب الشهادة بنجاح!'), 'success');
    } catch (err) {
      toast(copy(lang, `CSR generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`, `فشل إنشاء الطلب: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`), 'error');
    } finally {
      setWorking(false);
    }
  };

  const handleSubmitOTP = async () => {
    if (!otpValue.trim() || otpValue.trim().length !== 6) {
      toast(copy(lang, 'Please enter the 6-digit OTP from the ZATCA portal.', 'أدخل رمز التحقق المكوّن من 6 أرقام من بوابة هيئة الزكاة.'), 'error');
      return;
    }
    if (!generatedCsr) {
      toast(copy(lang, 'No CSR found. Please go back to Step 1.', 'لم يتم العثور على الطلب. الرجاء العودة للخطوة 1.'), 'error');
      return;
    }
    setWorking(true);
    try {
      const result = await submitCSRForCompliance(generatedCsr, otpValue.trim(), formEnv);
      if (isApiError(result)) {
        toast(`${copy(lang, 'ZATCA error:', 'خطأ من الزكاة:')} ${result.message}`, 'error');
        return;
      }
      const certPem    = decodeZatcaCertificate(result.binarySecurityToken);
      const expiry     = parseCertExpiry(certPem);
      const requestId  = result.complianceRequestId ?? result.requestID ?? '';

      StorageService.saveZatcaState({
        complianceCsid:      result.binarySecurityToken,
        complianceSecretKey: result.secret,
        complianceRequestId: requestId,
        certificatePem:      certPem,
        certExpiryTimestamp: expiry?.getTime(),
      });
      setCsidResult({ csid: result.binarySecurityToken, secret: result.secret, requestId });
      loadData();
      setWizardStep(3);
      toast(copy(lang, 'Compliance CSID received from ZATCA!', 'تم استلام شهادة الامتثال من هيئة الزكاة!'), 'success');
    } catch (err) {
      toast(copy(lang, `API error: ${err instanceof Error ? err.message : 'Unknown'}`, `خطأ: ${err instanceof Error ? err.message : 'غير معروف'}`), 'error');
    } finally {
      setWorking(false);
    }
  };

  const handleRunComplianceTests = async () => {
    if (!csidResult) {
      toast(copy(lang, 'Please complete Step 2 first.', 'أكمل الخطوة الثانية أولاً.'), 'error');
      return;
    }
    setWorking(true);
    setAllTestsPassed(false);

    const testCases = [
      { name: copy(lang, 'Simplified invoice #1',    'فاتورة مبسّطة #1'),          isRefund: false, icv: 1, isB2B: false },
      { name: copy(lang, 'Simplified invoice #2',    'فاتورة مبسّطة #2'),          isRefund: false, icv: 2, isB2B: false },
      { name: copy(lang, 'Simplified credit note #1','إشعار دائن مبسّط #1'),       isRefund: true,  icv: 3, isB2B: false },
      { name: copy(lang, 'Standard (B2B) invoice #1','فاتورة معيارية (B2B) #1'),   isRefund: false, icv: 4, isB2B: true  },
      { name: copy(lang, 'Standard (B2B) invoice #2','فاتورة معيارية (B2B) #2'),   isRefund: false, icv: 5, isB2B: true  },
      { name: copy(lang, 'Standard (B2B) credit note','إشعار دائن معياري (B2B)'),  isRefund: true,  icv: 6, isB2B: true  },
    ];

    const results: TestResult[] = testCases.map(tc => ({ name: tc.name, status: 'pending' as const, message: '' }));
    setTestResults([...results]);

    let pih = ZATCA_GENESIS_PIH;
    let allPassed = true;

    for (let i = 0; i < testCases.length; i++) {
      results[i] = { ...results[i], status: 'running' };
      setTestResults([...results]);

      try {
        const tc  = testCases[i];
        const ubl = await generateTestInvoice(config, config.vatNumber, tc.icv, pih, tc.isRefund, { isB2B: tc.isB2B });

        let signedXml = ubl.xml;
        const zatcaState = StorageService.getZatcaState();
        if (zatcaState.privateKeyPem && zatcaState.certificatePem) {
          try {
            const xades = await signInvoiceXAdES({
              invoiceXml:     ubl.xml,
              privateKeyPem:  zatcaState.privateKeyPem,
              certificatePem: zatcaState.certificatePem,
              invoiceHash:    ubl.xmlHash,
            });
            signedXml = xades.signedXml;
          } catch {
            const xades = await signInvoiceXAdESDev({ invoiceXml: ubl.xml, privateKeyPem: zatcaState.privateKeyPem ?? '', invoiceHash: ubl.xmlHash });
            signedXml = xades.signedXml;
          }
        }

        const fakeTxUuid = crypto.randomUUID();

        // B2B (standard) invoices use the clearance API; simplified use the reporting/compliance API
        const apiResult = tc.isB2B
          ? await clearInvoice(
              signedXml, ubl.xmlHash, fakeTxUuid,
              csidResult.csid, csidResult.secret, formEnv,
            )
          : await runComplianceCheck(
              signedXml, ubl.xmlHash, fakeTxUuid,
              csidResult.csid, csidResult.secret, formEnv,
            );

        if (isApiError(apiResult)) {
          results[i] = { ...results[i], status: 'fail', message: apiResult.message };
          allPassed  = false;
        } else {
          const status = apiResult.validationResults?.status ?? 'PASS';
          const errs   = apiResult.validationResults?.errorMessages ?? [];
          if (status === 'PASS' || status === 'WARNING' || errs.length === 0) {
            results[i] = { ...results[i], status: 'pass', message: status };
            pih = ubl.xmlHash;
          } else {
            results[i] = { ...results[i], status: 'fail', message: errs.map(e => e.message).join('; ') };
            allPassed  = false;
          }
        }
      } catch (err) {
        results[i] = { ...results[i], status: 'fail', message: err instanceof Error ? err.message : 'Error' };
        allPassed  = false;
      }

      setTestResults([...results]);
    }

    setAllTestsPassed(allPassed);
    setWorking(false);
    toast(
      allPassed
        ? copy(lang, 'All compliance tests passed!', 'اجتازت جميع اختبارات الالتزام!')
        : copy(lang, 'Some tests failed. Check results below.', 'فشلت بعض الاختبارات. راجع النتائج أدناه.'),
      allPassed ? 'success' : 'error',
    );
  };

  const handleGetProductionCsid = async () => {
    if (!csidResult) return;
    setWorking(true);
    try {
      const result = await getProductionCsid(
        csidResult.csid,
        csidResult.secret,
        csidResult.requestId,
        formEnv,
      );

      if (isApiError(result)) {
        toast(`${copy(lang, 'ZATCA error:', 'خطأ من الزكاة:')} ${result.message}`, 'error');
        return;
      }

      const certPem  = decodeZatcaCertificate(result.binarySecurityToken);
      const expiry   = parseCertExpiry(certPem);
      StorageService.saveZatcaState({
        onboardingStatus:    'production_ready',
        productionCsid:      result.binarySecurityToken,
        productionSecretKey: result.secret,
        certificatePem:      certPem,
        certExpiryTimestamp: expiry?.getTime(),
      });
      loadData();
      toast(copy(lang, 'Production CSID activated! ZATCA Phase 2 is live.', 'تم تفعيل شهادة الإنتاج! المرحلة الثانية من الفاتورة الإلكترونية مفعّلة.'), 'success');
    } catch (err) {
      toast(copy(lang, `Error: ${err instanceof Error ? err.message : 'Unknown'}`, `خطأ: ${err instanceof Error ? err.message : 'غير معروف'}`), 'error');
    } finally {
      setWorking(false);
    }
  };

  // ── Dashboard actions ──────────────────────────────────────────────────────

  const retryQueue = () => {
    const result = StorageService.retryZatcaQueue();
    toast(copy(lang, `${result.queued} invoice(s) in the local queue. Unsigned invoices were re-signed where possible.`, `${result.queued} فاتورة في قائمة الانتظار. تم إعادة توقيع ما أمكن.`), 'info');
    loadData();
  };

  const markReported = (id: string) => {
    StorageService.markZatcaReported(id, zatca.mode === 'production' ? 'reported' : 'sandbox_reported');
    loadData();
  };

  const handleReportNow = async () => {
    if (!pending.length) return;
    if (!zatca.productionCsid || !zatca.productionSecretKey) {
      toast(copy(lang, 'Production certificate required to report invoices.', 'يلزم وجود شهادة إنتاج لإبلاغ الفواتير.'), 'error');
      return;
    }
    setWorking(true);
    let successCount = 0;
    for (const tx of pending.slice(0, 10)) {
      try {
        if (!tx.xmlUbl) continue;
        const result = await reportInvoice(
          tx.xmlUbl,
          tx.invoiceHash ?? '',
          tx.uuid ?? '',
          zatca.productionCsid,
          zatca.productionSecretKey,
          zatca.mode,
        );
        if (!isApiError(result)) {
          StorageService.markZatcaReported(tx.id, 'reported');
          successCount++;
        }
      } catch { /* skip on error */ }
    }
    loadData();
    setWorking(false);
    toast(copy(lang, `${successCount} invoice(s) reported to ZATCA.`, `تم إبلاغ ${successCount} فاتورة لهيئة الزكاة.`), 'success');
  };

  const runSignatureCheck = async () => {
    if (!latestSigned?.invoiceHash || !latestSigned.cryptographicSignature) return;
    setSignatureCheck('checking');
    const valid = await verifyInvoiceSignature(latestSigned.invoiceHash, latestSigned.cryptographicSignature);
    setSignatureCheck(valid ? 'valid' : 'invalid');
    toast(
      valid
        ? copy(lang, 'Signature verified against the device public key.', 'تم التحقق من التوقيع بالمفتاح العام للجهاز.')
        : copy(lang, 'Signature verification failed.', 'فشل التحقق من التوقيع.'),
      valid ? 'success' : 'error',
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const queue = [...pending, ...failed];

  const certExpiryLabel = zatca.certExpiryTimestamp
    ? new Date(zatca.certExpiryTimestamp).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB')
    : copy(lang, 'Unknown', 'غير معروف');

  if (showWizard) {
    return <OnboardingWizard
      lang={lang}
      zatca={zatca}
      config={config}
      wizardStep={wizardStep}
      working={working}
      generatedCsr={generatedCsr}
      otpValue={otpValue}
      csidResult={csidResult}
      testResults={testResults}
      allTestsPassed={allTestsPassed}
      formBizName={formBizName}
      formVat={formVat}
      formAddress={formAddress}
      formEnv={formEnv}
      formInvoiceType={formInvoiceType}
      setFormBizName={setFormBizName}
      setFormVat={setFormVat}
      setFormAddress={setFormAddress}
      setFormEnv={setFormEnv}
      setFormInvoiceType={setFormInvoiceType}
      setOtpValue={setOtpValue}
      setWizardStep={setWizardStep}
      onGenerateCSR={handleGenerateCSR}
      onSubmitOTP={handleSubmitOTP}
      onRunTests={handleRunComplianceTests}
      onGetProductionCsid={handleGetProductionCsid}
      toast={toast}
    />;
  }

  // ── Live dashboard ─────────────────────────────────────────────────────────
  const daysUntilExpiry = zatca.certExpiryTimestamp
    ? Math.ceil((zatca.certExpiryTimestamp - Date.now()) / 86_400_000)
    : null;
  const certExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 30;
  const certExpired      = daysUntilExpiry !== null && daysUntilExpiry <= 0;

  const handleRenewCsid = () => {
    // Renewal uses the same CSR → new OTP → new CSID flow, but skips
    // compliance tests (already passed once). Reset to wizard step 2.
    StorageService.saveZatcaState({ onboardingStatus: 'csr_generated' });
    setZatca(StorageService.getZatcaState());
    toast(copy(lang,
      'Renewal started — submit a new OTP from the ZATCA portal to get a fresh certificate.',
      'بدأ التجديد — أدخل رمز OTP جديدًا من بوابة الزكاة للحصول على شهادة جديدة.'), 'info');
  };

  return (
    <div className="ios-page space-y-5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Certificate expiry warning */}
      {certExpiringSoon && (
        <div className={`flex items-start gap-3 rounded-2xl p-4 ${certExpired ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
          <AlertCircle size={20} className={certExpired ? 'mt-0.5 shrink-0 text-red-600' : 'mt-0.5 shrink-0 text-amber-600'} />
          <div className="min-w-0 flex-1">
            <p className={`font-bold ${certExpired ? 'text-red-700' : 'text-amber-700'}`}>
              {certExpired
                ? copy(lang, 'ZATCA certificate expired', 'انتهت صلاحية شهادة الزكاة')
                : copy(lang, `ZATCA certificate expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}`, `شهادة الزكاة تنتهي خلال ${daysUntilExpiry} يوم`)}
            </p>
            <p className="mt-1 text-sm text-[var(--ios-secondary)]">
              {copy(lang,
                'Renew your ZATCA certificate before it expires to avoid interruption in e-invoice reporting.',
                'جدّد شهادة الزكاة قبل انتهاء صلاحيتها لتجنّب انقطاع الإبلاغ عن الفواتير الإلكترونية.')}
            </p>
          </div>
          <button
            onClick={handleRenewCsid}
            className="shrink-0 rounded-xl bg-[var(--ios-accent)] px-4 py-2 text-sm font-bold text-white"
          >
            {copy(lang, 'Renew Now', 'تجديد الآن')}
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--ios-accent)] sm:text-xs">
            {copy(lang, 'Compliance', 'الالتزام')}
          </p>
          <h1 className="ios-title mt-1.5 text-2xl sm:text-3xl">
            {copy(lang, 'ZATCA Phase 2 — Active', 'المرحلة الثانية من الفاتورة الإلكترونية — مفعّلة')}
          </h1>
          <p className="ios-subtitle mt-1.5 text-xs sm:text-sm">
            {copy(lang, 'Hash chain integrity, reporting queue, and certificate status.', 'سلامة السلسلة، قائمة الإبلاغ، وحالة الشهادة.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={retryQueue} className="rounded-xl bg-[var(--ios-accent-soft)] px-3 py-2 text-xs font-bold text-[var(--ios-accent)] sm:text-sm">
            {copy(lang, 'Retry local signing', 'إعادة التوقيع المحلي')}
          </button>
          <button onClick={loadData} className="icon-btn icon-btn-neutral h-9 w-9" aria-label={copy(lang, 'Refresh', 'تحديث')}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Certificate panel */}
      <div className="ios-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-[var(--ios-text)]">
          <Shield size={18} className="text-[var(--ios-accent)]" />
          {copy(lang, 'Active Certificate', 'الشهادة النشطة')}
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-[var(--ios-fill)] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ios-tertiary)]">{copy(lang, 'Type', 'النوع')}</p>
            <p className="mt-1 font-extrabold text-[var(--ios-accent)]">{zatca.mode === 'production' ? 'Production' : 'Sandbox'}</p>
          </div>
          <div className="rounded-xl bg-[var(--ios-fill)] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ios-tertiary)]">{copy(lang, 'Status', 'الحالة')}</p>
            <p className="mt-1 font-extrabold text-[var(--ios-accent)]">{statusText}</p>
          </div>
          <div className="rounded-xl bg-[var(--ios-fill)] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ios-tertiary)]">{copy(lang, 'Expires', 'تنتهي')}</p>
            <p className="mt-1 text-sm font-extrabold text-[var(--ios-text)]">{certExpiryLabel}</p>
          </div>
          <div className="rounded-xl bg-[var(--ios-fill)] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ios-tertiary)]">{copy(lang, 'Device Serial', 'رقم الجهاز')}</p>
            <p className="mt-1 break-all font-mono text-[11px] text-[var(--ios-text)]">{zatca.deviceSerial ? truncateHash(zatca.deviceSerial, 20) : '—'}</p>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {[
          { icon: <Clock size={20}/>, label: copy(lang, 'Queued', 'قيد الانتظار'), value: String(pending.length), hint: copy(lang, 'Not yet reported', 'لم يُبلَّغ عنها'), tone: 'text-[#B26B00]' },
          { icon: <CheckCircle size={20}/>, label: copy(lang, 'Reported', 'مُبلَّغ عنها'), value: String(reported.length), hint: copy(lang, 'Confirmed by ZATCA', 'مؤكّدة من هيئة الزكاة'), tone: 'text-[var(--ios-accent)]' },
          { icon: <AlertCircle size={20}/>, label: copy(lang, 'Failed', 'فاشلة'), value: String(failed.length), hint: copy(lang, 'Need retry', 'تحتاج إعادة'), tone: 'text-[#C2412D]' },
          { icon: <ShieldCheck size={20}/>, label: copy(lang, 'ZATCA status', 'حالة الزكاة'), value: statusText, hint: copy(lang, `Mode: ${zatca.mode}`, `الوضع: ${zatca.mode === 'production' ? 'إنتاجي' : 'تجريبي'}`), tone: zatca.onboardingStatus === 'production_ready' ? 'text-[var(--ios-accent)]' : 'text-[#B26B00]' },
        ].map(s => (
          <div key={s.label} className="ios-card p-4">
            <div className="mb-2 flex items-center gap-2 text-[var(--ios-secondary)]">{s.icon}<span className="truncate text-xs font-bold sm:text-sm">{s.label}</span></div>
            <p className={`text-2xl font-extrabold ${s.tone}`}>{s.value}</p>
            <p className="mt-1 text-[11px] leading-snug text-[var(--ios-tertiary)]">{s.hint}</p>
          </div>
        ))}
      </div>

      {/* Pending invoices + report button */}
      {pending.length > 0 && (
        <div className="ios-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-bold text-[var(--ios-text)]">
              <Clock size={18} className="text-[#B26B00]" />
              {copy(lang, `${pending.length} invoice(s) pending ZATCA reporting`, `${pending.length} فاتورة بانتظار الإبلاغ لهيئة الزكاة`)}
            </h3>
            <button
              onClick={handleReportNow}
              disabled={working || !zatca.productionCsid}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--ios-accent)] px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {working ? <Loader2 size={14} className="animate-spin"/> : null}
              {copy(lang, 'Report Now', 'إبلاغ الآن')}
            </button>
          </div>
        </div>
      )}

      {/* Chain integrity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="ios-card p-5 lg:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-[var(--ios-text)]">
            <Link2 size={18} className="text-[var(--ios-accent)]" />
            {copy(lang, 'Live chain integrity', 'سلامة السلسلة الحالية')}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: copy(lang, 'Chained invoices', 'فواتير مسلسلة'), value: chainStats.chained },
              { label: copy(lang, 'Current ICV', 'العداد ICV'), value: chainStats.currentIcv },
              { label: copy(lang, 'Signed', 'موقعة'), value: chainStats.signed },
              { label: copy(lang, 'Awaiting hash', 'بانتظار التجزئة'), value: chainStats.awaiting },
            ].map(s => (
              <div key={s.label} className="rounded-xl bg-[var(--ios-fill)] p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ios-tertiary)]">{s.label}</p>
                <p className="mt-1 text-xl font-extrabold text-[var(--ios-text)]">{s.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-[var(--ios-fill)] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ios-tertiary)]">
              {copy(lang, 'Latest invoice hash (SHA-256, base64)', 'أحدث تجزئة فاتورة (SHA-256، base64)')}
            </p>
            <p dir="ltr" className="mt-1 break-all font-mono text-xs text-[var(--ios-text)]">
              {truncateHash(chainStats.latestHash, 28)}
            </p>
          </div>
          <div className={`mt-3 rounded-xl border p-3 text-xs font-semibold ${chain.valid ? 'border-[rgba(30,107,72,0.22)] bg-[var(--ios-accent-soft)] text-[var(--ios-accent)]' : 'border-[#F0C4BC] bg-[#FDECEA] text-[#C2412D]'}`}>
            {chain.valid
              ? copy(lang, 'Hash chain is consistent — every PIH matches and ICV increments by one.', 'السلسلة متسقة — كل PIH يطابق التجزئة السابقة والعداد ICV يتزايد.')
              : copy(lang, `Chain break at position ${chain.brokenIndex}.`, `انقطاع في السلسلة عند الموضع ${chain.brokenIndex}.`)}
          </div>
          {insecureHashes > 0 && (
            <div className="mt-3 rounded-xl border border-[#F0C4BC] bg-[#FDECEA] p-3 text-xs font-semibold text-[#C2412D]">
              {copy(lang, `${insecureHashes} invoice(s) hashed without Web Crypto. Serve over HTTPS then retry signing.`, `${insecureHashes} فاتورة مجزأة بدون Web Crypto. شغّل عبر HTTPS ثم أعد التوقيع.`)}
            </div>
          )}
        </div>

        {/* Latest signed invoice */}
        <div className="ios-card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-[var(--ios-text)]">
            <FileCode size={18} className="text-[var(--ios-accent)]" />
            {copy(lang, 'Latest signed invoice', 'أحدث فاتورة موقعة')}
          </h3>
          {latestSigned ? (
            <div className="space-y-2 text-xs">
              <Field label={copy(lang, 'Invoice', 'الفاتورة')} value={latestSigned.id} />
              <Field label={copy(lang, 'UUID', 'المعرّف')} value={truncateHash(latestSigned.uuid, 24)} />
              <Field label={copy(lang, 'Hash', 'التجزئة')} value={truncateHash(latestSigned.invoiceHash, 24)} />
              <Field label={copy(lang, 'Signature', 'التوقيع')} value={truncateHash(latestSigned.cryptographicSignature, 24)} />
              <Field label={copy(lang, 'ICV', 'العداد ICV')} value={String(latestSigned.invoiceSeqNum ?? '—')} />
              <Field label={copy(lang, 'Status', 'الحالة')} value={statusLabel(latestSigned.zatcaStatus)} />
              <button
                onClick={runSignatureCheck}
                disabled={signatureCheck === 'checking'}
                className="mt-3 w-full rounded-xl bg-[var(--ios-accent)] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {signatureCheck === 'checking' ? copy(lang, 'Verifying…', 'جارٍ التحقق…') : copy(lang, 'Verify ECDSA signature', 'تحقق من توقيع ECDSA')}
              </button>
              {signatureCheck === 'valid' && <p className="text-[11px] font-bold text-[var(--ios-accent)]">{copy(lang, 'Valid — crypto.subtle.verify passed.', 'صحيح — اجتاز crypto.subtle.verify.')}</p>}
              {signatureCheck === 'invalid' && <p className="text-[11px] font-bold text-[#C2412D]">{copy(lang, 'Invalid — signature does not match.', 'غير صحيح — التوقيع لا يتطابق.')}</p>}
            </div>
          ) : (
            <p className="text-sm text-[var(--ios-secondary)]">
              {copy(lang, 'No signed invoices yet.', 'لا توجد فواتير موقعة بعد.')}
            </p>
          )}
          {zatca.publicKeyPem && (
            <div className="mt-4 border-t border-[var(--ios-divider)] pt-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--ios-tertiary)]">
                <KeyRound size={13} />
                {copy(lang, 'Device signing key (ECDSA P-256)', 'مفتاح التوقيع (ECDSA P-256)')}
              </p>
              <p dir="ltr" className="mt-1 break-all font-mono text-[10px] leading-relaxed text-[var(--ios-secondary)]">
                {truncateHash(zatca.publicKeyPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 44)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Offline ZATCA queue */}
      <div className="ios-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ios-divider)] p-4">
          <h3 className="text-sm font-bold text-[var(--ios-text)]">{copy(lang, 'Offline ZATCA queue', 'قائمة الانتظار دون اتصال')}</h3>
          <span className="text-[11px] font-semibold text-[var(--ios-tertiary)]">{copy(lang, `${queue.length} pending / failed`, `${queue.length} قيد الانتظار / فاشلة`)}</span>
        </div>
        <div className="max-h-72 divide-y divide-[var(--ios-divider)] overflow-y-auto">
          {queue.length === 0 && (
            <p className="p-6 text-center text-sm text-[var(--ios-secondary)]">{copy(lang, 'No pending invoices.', 'لا توجد فواتير قيد الانتظار.')}</p>
          )}
          {queue.map(tx => (
            <div key={tx.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <div className="min-w-0">
                <div className="font-bold text-[var(--ios-text)]">{tx.id}</div>
                <div className="text-[11px] text-[var(--ios-secondary)]">
                  {new Date(tx.timestamp).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB')} · {copy(lang, `${tx.total.toFixed(2)} SAR`, `${tx.total.toFixed(2)} ر.س`)} · {statusLabel(tx.zatcaStatus)}
                  {typeof tx.invoiceSeqNum === 'number' ? ` · ICV ${tx.invoiceSeqNum}` : ''}
                </div>
                {tx.zatcaError && <div className="mt-1 text-[11px] font-semibold text-[#C2412D]">{tx.zatcaError}</div>}
              </div>
              <button onClick={() => markReported(tx.id)} className="rounded-xl bg-[var(--ios-accent-soft)] px-3 py-1.5 text-[11px] font-bold text-[var(--ios-accent)]">
                {copy(lang, 'Mark reported (manual)', 'تعليم كمُبلغ عنها (يدويًا)')}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Audit log */}
      <div className="ios-card overflow-hidden">
        <div className="border-b border-[var(--ios-divider)] p-4">
          <h3 className="text-sm font-bold text-[var(--ios-text)]">{copy(lang, 'Audit log', 'سجل التدقيق')}</h3>
        </div>
        <div className="max-h-96 divide-y divide-[var(--ios-divider)] overflow-y-auto">
          {audits.length === 0 && (
            <p className="p-6 text-center text-sm text-[var(--ios-secondary)]">{copy(lang, 'No audit events yet.', 'لا توجد أحداث تدقيق بعد.')}</p>
          )}
          {audits.map(log => (
            <div key={log.id} className="p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-bold text-[var(--ios-text)]">{log.event}</span>
                <span className="text-[11px] text-[var(--ios-tertiary)]">{new Date(log.timestamp).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB')}</span>
              </div>
              <p className="mt-1 text-[var(--ios-secondary)]">{log.description}</p>
              <p className="mt-1 text-[11px] text-[var(--ios-tertiary)]">{copy(lang, 'User', 'المستخدم')}: {log.user}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Onboarding Wizard ────────────────────────────────────────────────────────

interface WizardProps {
  lang: Language;
  zatca: ZatcaState;
  config: StoreConfig;
  wizardStep: number;
  working: boolean;
  generatedCsr: string;
  otpValue: string;
  csidResult: { csid: string; secret: string; requestId: string } | null;
  testResults: { name: string; status: string; message: string }[];
  allTestsPassed: boolean;
  formBizName: string;
  formVat: string;
  formAddress: string;
  formEnv: 'sandbox' | 'production';
  formInvoiceType: 'simplified' | 'standard' | 'both';
  setFormBizName: (v: string) => void;
  setFormVat: (v: string) => void;
  setFormAddress: (v: string) => void;
  setFormEnv: (v: 'sandbox' | 'production') => void;
  setFormInvoiceType: (v: 'simplified' | 'standard' | 'both') => void;
  setOtpValue: (v: string) => void;
  setWizardStep: (v: number) => void;
  onGenerateCSR: () => void;
  onSubmitOTP: () => void;
  onRunTests: () => void;
  onGetProductionCsid: () => void;
  toast: (msg: string, type?: string) => void;
}

const OnboardingWizard: React.FC<WizardProps> = (p) => {
  const { lang } = p;

  const stepLabels = [
    copy(lang, 'Generate CSR', 'إنشاء الطلب'),
    copy(lang, 'Submit to ZATCA', 'إرسال للزكاة'),
    copy(lang, 'Compliance Test', 'اختبار الامتثال'),
    copy(lang, 'Activate', 'التفعيل'),
  ];

  return (
    <div className="ios-page space-y-6" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--ios-accent)]">
          {copy(lang, 'ZATCA Phase 2', 'المرحلة الثانية للفوترة الإلكترونية')}
        </p>
        <h1 className="ios-title mt-1.5 text-2xl sm:text-3xl">
          {copy(lang, 'E-Invoicing Onboarding', 'تهيئة الفاتورة الإلكترونية')}
        </h1>
        <p className="ios-subtitle mt-1.5 text-xs sm:text-sm">
          {copy(lang, 'Complete 4 steps to activate ZATCA Phase 2 e-invoicing.', 'أكمل 4 خطوات لتفعيل المرحلة الثانية من الفاتورة الإلكترونية.')}
        </p>
      </div>

      {/* Step progress */}
      <div className="ios-card p-4">
        <div className="flex items-center justify-between gap-2">
          {stepLabels.map((label, i) => (
            <React.Fragment key={label}>
              <div className="flex flex-col items-center gap-1 text-center">
                <StepDot step={i + 1} current={p.wizardStep} done={p.wizardStep > i + 1} />
                <span className="max-w-[60px] text-[10px] font-semibold leading-tight text-[var(--ios-secondary)]">{label}</span>
              </div>
              {i < stepLabels.length - 1 && (
                <div className={`h-0.5 flex-1 rounded ${p.wizardStep > i + 1 ? 'bg-[var(--ios-accent)]' : 'bg-[var(--ios-divider)]'}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Step content */}
      {p.wizardStep === 1 && <WizardStep1 {...p} />}
      {p.wizardStep === 2 && <WizardStep2 {...p} />}
      {p.wizardStep === 3 && <WizardStep3 {...p} />}
      {p.wizardStep === 4 && <WizardStep4 {...p} />}
    </div>
  );
};

const WizardStep1: React.FC<WizardProps> = (p) => {
  const { lang } = p;
  const handleCopy = async () => {
    await copyToClipboard(p.generatedCsr);
    p.toast(copy(lang, 'CSR copied to clipboard.', 'تم نسخ الطلب.'), 'success');
  };
  return (
    <div className="space-y-4">
      <div className="ios-card p-5">
        <h2 className="mb-4 text-base font-bold text-[var(--ios-text)]">
          {copy(lang, 'Step 1 — Generate Cryptographic Key & CSR', 'الخطوة 1 — إنشاء المفتاح وطلب الشهادة')}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-[var(--ios-secondary)]">
              {copy(lang, 'Business Name (English)', 'اسم الشركة (إنجليزي)')}
            </label>
            <input
              className="ios-input w-full"
              value={p.formBizName}
              onChange={e => p.setFormBizName(e.target.value)}
              placeholder="My Store LLC"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[var(--ios-secondary)]">
              {copy(lang, 'VAT Registration Number', 'رقم التسجيل الضريبي')}
            </label>
            <input
              className="ios-input w-full"
              value={p.formVat}
              onChange={e => p.setFormVat(e.target.value)}
              placeholder="3000000000"
              dir="ltr"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[var(--ios-secondary)]">
              {copy(lang, 'Physical Address', 'العنوان الفعلي')}
            </label>
            <input
              className="ios-input w-full"
              value={p.formAddress}
              onChange={e => p.setFormAddress(e.target.value)}
              placeholder="123 King Fahad Road, Riyadh"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--ios-secondary)]">
                {copy(lang, 'Environment', 'البيئة')}
              </label>
              <select
                className="ios-input w-full"
                value={p.formEnv}
                onChange={e => p.setFormEnv(e.target.value as 'sandbox' | 'production')}
              >
                <option value="sandbox">{copy(lang, 'Sandbox (Testing)', 'تجريبي (اختبار)')}</option>
                <option value="production">{copy(lang, 'Production (Live)', 'إنتاجي (مباشر)')}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--ios-secondary)]">
                {copy(lang, 'Invoice Type', 'نوع الفاتورة')}
              </label>
              <select
                className="ios-input w-full"
                value={p.formInvoiceType}
                onChange={e => p.setFormInvoiceType(e.target.value as 'simplified' | 'standard' | 'both')}
              >
                <option value="simplified">{copy(lang, 'Simplified (B2C)', 'مبسّطة (B2C)')}</option>
                <option value="standard">{copy(lang, 'Standard (B2B)', 'معيارية (B2B)')}</option>
                <option value="both">{copy(lang, 'Both', 'كلاهما')}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[#F0C4BC] bg-[#FDECEA] p-3 text-xs text-[#7E2A1C]">
          <strong>{copy(lang, 'Security notice:', 'ملاحظة أمنية:')}</strong>{' '}
          {copy(lang, 'Your private key is generated on this device and saved locally only. Never share it. ZATCA never receives your private key.', 'يُنشأ مفتاحك الخاص على هذا الجهاز ويُحفظ محليًا فقط. لا تشاركه أبدًا. هيئة الزكاة لا تستلم مفتاحك الخاص.')}
        </div>

        <button
          onClick={p.onGenerateCSR}
          disabled={p.working}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--ios-accent)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {p.working ? <Loader2 size={16} className="animate-spin"/> : <KeyRound size={16}/>}
          {p.working ? copy(lang, 'Generating…', 'جارٍ الإنشاء…') : copy(lang, 'Generate CSR & Private Key', 'إنشاء الطلب والمفتاح الخاص')}
        </button>
      </div>

      {p.generatedCsr && (
        <div className="ios-card p-5">
          <h3 className="mb-3 text-sm font-bold text-[var(--ios-accent)]">
            {copy(lang, 'CSR Generated Successfully', 'تم إنشاء الطلب بنجاح')}
          </h3>
          <pre dir="ltr" className="max-h-40 overflow-y-auto rounded-xl bg-[var(--ios-fill)] p-3 font-mono text-[10px] leading-relaxed text-[var(--ios-text)] whitespace-pre-wrap break-all">
            {p.generatedCsr}
          </pre>
          <div className="mt-3 flex gap-2">
            <button onClick={handleCopy} className="flex items-center gap-1.5 rounded-xl bg-[var(--ios-accent-soft)] px-3 py-2 text-xs font-bold text-[var(--ios-accent)]">
              <Copy size={14}/>{copy(lang, 'Copy', 'نسخ')}
            </button>
            <button onClick={() => downloadText(p.generatedCsr, 'baqala-zatca-csr.pem')} className="flex items-center gap-1.5 rounded-xl bg-[var(--ios-accent-soft)] px-3 py-2 text-xs font-bold text-[var(--ios-accent)]">
              <Download size={14}/>{copy(lang, 'Download .pem', 'تنزيل .pem')}
            </button>
            <button onClick={() => p.setWizardStep(2)} className="ms-auto flex items-center gap-1 rounded-xl bg-[var(--ios-accent)] px-4 py-2 text-xs font-bold text-white">
              {copy(lang, 'Next: Submit to ZATCA', 'التالي: إرسال للزكاة')}<ChevronRight size={14}/>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const WizardStep2: React.FC<WizardProps> = (p) => {
  const { lang } = p;
  const portalUrl = p.formEnv === 'production'
    ? 'https://fatoora.zatca.gov.sa'
    : 'https://fatoora.zatca.gov.sa/sandbox';

  return (
    <div className="space-y-4">
      <div className="ios-card p-5">
        <h2 className="mb-4 text-base font-bold text-[var(--ios-text)]">
          {copy(lang, 'Step 2 — Submit CSR to ZATCA Fatoora Portal', 'الخطوة 2 — إرسال الطلب لبوابة الزكاة فاتورة')}
        </h2>
        <ol className="space-y-2 text-sm text-[var(--ios-text)]">
          {[
            { en: `Go to the ZATCA Fatoora portal`, ar: 'انتقل إلى بوابة هيئة الزكاة فاتورة', link: portalUrl },
            { en: 'Log in with your VAT account credentials', ar: 'سجّل الدخول باستخدام حساب ضريبة القيمة المضافة' },
            { en: 'Navigate to Onboarding → Add Solution Unit', ar: 'انتقل إلى التهيئة ← إضافة وحدة حل' },
            { en: 'Paste the CSR from Step 1 and submit', ar: 'الصق الطلب من الخطوة 1 وأرسله' },
            { en: 'Note the 6-digit OTP shown on screen', ar: 'احتفظ برمز التحقق المكوّن من 6 أرقام الظاهر على الشاشة' },
          ].map((item, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--ios-accent)] text-[10px] font-black text-white">{idx + 1}</span>
              <span>
                {copy(lang, item.en, item.ar)}
                {item.link && (
                  <a href={item.link} target="_blank" rel="noopener noreferrer" className="ms-1 inline-flex items-center gap-1 text-[var(--ios-accent)] underline">
                    {item.link}<ExternalLink size={11}/>
                  </a>
                )}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-5 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-[var(--ios-secondary)]">
              {copy(lang, '6-Digit OTP from ZATCA Portal', 'رمز التحقق المكوّن من 6 أرقام')}
            </label>
            <input
              className="ios-input w-full text-center text-2xl tracking-[0.4em]"
              value={p.otpValue}
              onChange={e => p.setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              dir="ltr"
              maxLength={6}
              inputMode="numeric"
            />
          </div>
          <button
            onClick={p.onSubmitOTP}
            disabled={p.working || p.otpValue.length !== 6}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--ios-accent)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {p.working ? <Loader2 size={16} className="animate-spin"/> : <Shield size={16}/>}
            {p.working ? copy(lang, 'Submitting to ZATCA…', 'جارٍ الإرسال للزكاة…') : copy(lang, 'Submit OTP to ZATCA', 'إرسال رمز التحقق للزكاة')}
          </button>
        </div>
      </div>
      <button onClick={() => p.setWizardStep(1)} className="text-xs font-semibold text-[var(--ios-secondary)]">
        ← {copy(lang, 'Back to Step 1', 'العودة للخطوة 1')}
      </button>
    </div>
  );
};

const WizardStep3: React.FC<WizardProps> = (p) => {
  const { lang } = p;
  const statusIcon = (s: string) => {
    if (s === 'pass') return <CheckCircle size={16} className="text-[var(--ios-accent)]"/>;
    if (s === 'fail') return <XCircle size={16} className="text-[#C2412D]"/>;
    if (s === 'running') return <Loader2 size={16} className="animate-spin text-[#B26B00]"/>;
    return <Clock size={16} className="text-[var(--ios-tertiary)]"/>;
  };
  return (
    <div className="space-y-4">
      <div className="ios-card p-5">
        <h2 className="mb-2 text-base font-bold text-[var(--ios-text)]">
          {copy(lang, 'Step 3 — Run ZATCA Compliance Tests', 'الخطوة 3 — تشغيل اختبارات الامتثال')}
        </h2>
        <p className="mb-4 text-sm text-[var(--ios-secondary)]">
          {copy(lang, 'ZATCA requires submitting test invoices to validate your integration before going live.', 'تشترط هيئة الزكاة إرسال فواتير تجريبية للتحقق من تكاملك قبل الانطلاق.')}
        </p>

        {p.csidResult && (
          <div className="mb-4 rounded-xl bg-[var(--ios-accent-soft)] p-3 text-xs">
            <p className="font-bold text-[var(--ios-accent)]">{copy(lang, 'Compliance CSID received ✓', 'تم استلام شهادة الامتثال ✓')}</p>
            <p dir="ltr" className="mt-1 break-all font-mono text-[var(--ios-secondary)]">{truncateHash(p.csidResult.csid, 40)}</p>
          </div>
        )}

        {p.testResults.length > 0 && (
          <div className="mb-4 space-y-2">
            {p.testResults.map((r, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-[var(--ios-fill)] p-3">
                {statusIcon(r.status)}
                <div className="flex-1">
                  <p className="text-xs font-semibold text-[var(--ios-text)]">{r.name}</p>
                  {r.message && <p className="mt-0.5 text-[11px] text-[var(--ios-secondary)]">{r.message}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={p.onRunTests}
          disabled={p.working}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--ios-accent)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {p.working ? <Loader2 size={16} className="animate-spin"/> : <Shield size={16}/>}
          {p.working ? copy(lang, 'Running tests…', 'جارٍ الاختبار…') : copy(lang, 'Run Compliance Tests', 'تشغيل اختبارات الامتثال')}
        </button>

        {p.allTestsPassed && (
          <button
            onClick={() => p.setWizardStep(4)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--ios-accent)] px-4 py-3 text-sm font-bold text-white"
          >
            <CheckCircle size={16}/>
            {copy(lang, 'All tests passed — Get Production Certificate', 'اجتازت جميع الاختبارات — احصل على شهادة الإنتاج')}
            <ChevronRight size={14}/>
          </button>
        )}
      </div>
      <button onClick={() => p.setWizardStep(2)} className="text-xs font-semibold text-[var(--ios-secondary)]">
        ← {copy(lang, 'Back to Step 2', 'العودة للخطوة 2')}
      </button>
    </div>
  );
};

const WizardStep4: React.FC<WizardProps> = (p) => {
  const { lang } = p;
  return (
    <div className="space-y-4">
      <div className="ios-card p-5 text-center">
        <h2 className="mb-4 text-base font-bold text-[var(--ios-text)]">
          {copy(lang, 'Step 4 — Activate Production Certificate', 'الخطوة 4 — تفعيل شهادة الإنتاج')}
        </h2>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ios-accent-soft)]">
          <ShieldCheck size={32} className="text-[var(--ios-accent)]"/>
        </div>
        <p className="mb-6 text-sm text-[var(--ios-secondary)]">
          {copy(lang, 'All compliance tests have passed. Click below to exchange your compliance CSID for a production certificate and go live with ZATCA Phase 2 e-invoicing.', 'اجتازت جميع اختبارات الامتثال. انقر أدناه لاستبدال شهادة الامتثال بشهادة إنتاجية وتفعيل المرحلة الثانية.')}
        </p>
        <button
          onClick={p.onGetProductionCsid}
          disabled={p.working}
          className="mx-auto flex items-center justify-center gap-2 rounded-xl bg-[var(--ios-accent)] px-8 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {p.working ? <Loader2 size={16} className="animate-spin"/> : <ShieldCheck size={16}/>}
          {p.working ? copy(lang, 'Activating…', 'جارٍ التفعيل…') : copy(lang, 'Activate Production CSID', 'تفعيل شهادة الإنتاج')}
        </button>
        <p className="mt-4 text-[11px] text-[var(--ios-tertiary)]">
          {copy(lang, 'This cannot be undone. Make sure all compliance tests have passed before activating.', 'لا يمكن التراجع عن هذا. تأكد من اجتياز جميع الاختبارات قبل التفعيل.')}
        </p>
      </div>
      <button onClick={() => p.setWizardStep(3)} className="text-xs font-semibold text-[var(--ios-secondary)]">
        ← {copy(lang, 'Back to Step 3', 'العودة للخطوة 3')}
      </button>
    </div>
  );
};

export default Compliance;
