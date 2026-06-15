import React, { useEffect, useState } from 'react';
import { Language, Transaction, ZatcaState } from '../types';
import { StorageService } from '../services/storageService';
import { AlertCircle, CheckCircle, Clock, FileCode, ShieldCheck } from 'lucide-react';
import { useToast } from './Toast';

interface ComplianceProps {
  lang: Language;
}

const Compliance: React.FC<ComplianceProps> = ({ lang }) => {
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [audits, setAudits] = useState<any[]>([]);
  const [zatca, setZatca] = useState<ZatcaState>(StorageService.getZatcaState());
  const [chain, setChain] = useState<{ valid: boolean; brokenIndex?: number }>({ valid: true });

  const loadData = () => {
    setTransactions(StorageService.getTransactions());
    setAudits(StorageService.getAuditLogs());
    setZatca(StorageService.getZatcaState());
    setChain(StorageService.validateCryptographicChain());
  };

  useEffect(() => {
    loadData();
  }, []);

  const pending = transactions.filter(tx => tx.zatcaStatus === 'pending' || tx.zatcaStatus === 'sandbox_pending');
  const reported = transactions.filter(tx => tx.zatcaStatus === 'reported' || tx.zatcaStatus === 'sandbox_reported');
  const failed = transactions.filter(tx => tx.zatcaStatus === 'failed');
  const latestSigned = transactions.find(tx => tx.invoiceHash && tx.cryptographicSignature);

  const statusText = {
    not_configured: 'Not configured',
    csr_generated: 'CSR generated',
    sandbox_ready: 'Sandbox ready',
    production_ready: 'Production ready'
  }[zatca.onboardingStatus];

  const retryQueue = () => {
    const result = StorageService.retryZatcaQueue();
    toast(`${result.queued} invoice(s) queued for retry.`, 'info');
    loadData();
  };

  const markReported = (id: string) => {
    StorageService.markZatcaReported(id, zatca.mode === 'production' ? 'reported' : 'sandbox_reported');
    loadData();
  };

  return (
    <div className="p-6 h-full overflow-y-auto bg-gray-50 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Compliance & ZATCA Status</h2>
          <p className="text-sm text-gray-500">Operational status for audit logs, invoice hash integrity, and ZATCA Phase 2 readiness.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={retryQueue} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm">Retry Queue</button>
          <button onClick={loadData} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">Refresh</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-gray-700"><ShieldCheck /><span className="font-bold">ZATCA</span></div>
          <p className={`text-xl font-bold ${zatca.onboardingStatus === 'production_ready' ? 'text-green-600' : 'text-amber-600'}`}>{statusText}</p>
          <p className="text-xs text-gray-500 mt-1">{zatca.mode.toUpperCase()} mode</p>
        </div>
        <div className="bg-white p-5 rounded-xl border shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-gray-700"><Clock /><span className="font-bold">Queued</span></div>
          <p className="text-xl font-bold text-amber-600">{pending.length}</p>
          <p className="text-xs text-gray-500 mt-1">Awaiting sandbox/production reporting</p>
        </div>
        <div className="bg-white p-5 rounded-xl border shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-gray-700"><CheckCircle /><span className="font-bold">Reported</span></div>
          <p className="text-xl font-bold text-green-600">{reported.length}</p>
          <p className="text-xs text-gray-500 mt-1">Marked as reported by current mode</p>
        </div>
        <div className="bg-white p-5 rounded-xl border shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-gray-700"><AlertCircle /><span className="font-bold">Failed</span></div>
          <p className="text-xl font-bold text-red-600">{failed.length}</p>
          <p className="text-xs text-gray-500 mt-1">Need retry or review</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><ShieldCheck /> Invoice Hash Chain</h3>
          <div className={`p-3 rounded-lg border ${chain.valid ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {chain.valid ? 'Invoice hash chain is internally consistent.' : `Invoice hash chain break detected at index ${chain.brokenIndex}.`}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><FileCode /> Latest Signed Invoice</h3>
          {latestSigned ? (
            <div className="space-y-2 text-xs font-mono">
              <p><strong>Invoice:</strong> {latestSigned.id}</p>
              <p className="truncate"><strong>UUID:</strong> {latestSigned.uuid}</p>
              <p className="truncate"><strong>Hash:</strong> {latestSigned.invoiceHash}</p>
              <p><strong>ICV:</strong> {latestSigned.invoiceSeqNum}</p>
              <p><strong>Status:</strong> {latestSigned.zatcaStatus}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No signed invoices yet.</p>
          )}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
        ZATCA Phase 2 here generates local ECDSA signatures, invoice hashes, ICV/PIH values, and UBL XML for the offline queue. It is not production-certified until official ZATCA onboarding, API reporting/clearance, and compliance test cases are completed.
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="font-bold text-gray-800">Offline ZATCA Queue</h3>
          <span className="text-xs text-gray-500">{pending.length + failed.length} pending/failed</span>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y">
          {[...pending, ...failed].length === 0 && <p className="p-6 text-center text-gray-500">No pending ZATCA invoices.</p>}
          {[...pending, ...failed].map(tx => (
            <div key={tx.id} className="p-4 flex items-center justify-between gap-3 text-sm">
              <div>
                <div className="font-bold text-gray-900">{tx.id}</div>
                <div className="text-xs text-gray-500">{new Date(tx.timestamp).toLocaleString()} | {tx.total.toFixed(2)} SAR | {tx.zatcaStatus}</div>
                {tx.zatcaError && <div className="text-xs text-red-600 mt-1">{tx.zatcaError}</div>}
              </div>
              <button onClick={() => markReported(tx.id)} className="px-3 py-1.5 bg-green-600 text-white rounded text-xs">
                Mark Reported
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="font-bold text-gray-800">Audit Log</h3>
        </div>
        <div className="max-h-96 overflow-y-auto divide-y">
          {audits.length === 0 && <p className="p-6 text-center text-gray-500">No audit events yet.</p>}
          {audits.map(log => (
            <div key={log.id} className="p-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="font-bold text-gray-900">{log.event}</span>
                <span className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleString()}</span>
              </div>
              <p className="text-gray-600 mt-1">{log.description}</p>
              <p className="text-xs text-gray-400 mt-1">User: {log.user}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Compliance;
