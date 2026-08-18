export interface ActivationRecord {
  licenseId: string;
  activatedAt: number;
  expiresAt?: number;
  plan: 'trial' | 'standard' | 'pro';
  machineId?: string;
  storeName?: string;
}

interface SignedLeaseResponse {
  lease: Record<string, unknown>;
}

const APP_VERSION = '1.0.2';
let inMemoryActivation: ActivationRecord | null = null;

const SEEDED_LICENSES = new Map<string, string>([
  ['BQL-SA-0001', '8K4PR2XM7Q9D'], ['BQL-SA-0002', 'N6T9VK3AP4W8'],
  ['BQL-SA-0003', 'C7M2Q8ZDL5X9'], ['BQL-SA-0004', 'R9W5H3KPT6N2'],
  ['BQL-SA-0005', 'Z4A8M7QXC2V6'], ['BQL-SA-0006', 'P3L9X6TRW8K5'],
  ['BQL-SA-0007', 'H8N4D2ZQA9M7'], ['BQL-SA-0008', 'V5C7K9LPR3X2'],
  ['BQL-SA-0009', 'T2Q6W8NMZ4A7'], ['BQL-SA-0010', 'L9X3A5VRK8P2'],
  ['BQL-SA-0011', 'Q4D8T7KCM2W9'], ['BQL-SA-0012', 'A6P2Z9XNH5R8'],
  ['BQL-SA-0013', 'W8K5M3LQV7C2'], ['BQL-SA-0014', 'X2R7H9DAP4T6'],
  ['BQL-SA-0015', 'M5V9Q2WKZ8N3'], ['BQL-SA-0016', 'K7C3P8XLA6D9'],
  ['BQL-SA-0017', 'D9T4V6NQR2M8'], ['BQL-SA-0018', 'Z6L8A3KPW9X5'],
  ['BQL-SA-0019', 'P8Q2C7MRH4V9'], ['BQL-SA-0020', 'N3W9X5TDL8A6'],
  ['BQL-SA-0021', 'R6K2M9ZPQ4C8'], ['BQL-SA-0022', 'A8V5D3XLT7N9'],
  ['BQL-SA-0023', 'C4P9H6QRW2M7'], ['BQL-SA-0024', 'T9L3Z8KAV5X2'],
  ['BQL-SA-0025', 'W2N7Q4DCP9R6'], ['BQL-SA-0026', 'H5X8M2VTA7K3'],
  ['BQL-SA-0027', 'L7A4R9WPZ3Q8'], ['BQL-SA-0028', 'V9C2K6HNM8T5'],
  ['BQL-SA-0029', 'Q3M8X7PLD2A9'], ['BQL-SA-0030', 'Z8R5T4KCW6N2'],
  ['BQL-SA-0031', 'K2P7A9VQH5X8'], ['BQL-SA-0032', 'M6D3W8LNC4R9'],
  ['BQL-SA-0033', 'X9T5Q2KAP7V6'], ['BQL-SA-0034', 'A4N8H6MRZ3W9'],
  ['BQL-SA-0035', 'R7C2P9XDL5T8'], ['BQL-SA-0036', 'W5Q9V3KNM8A2'],
  ['BQL-SA-0037', 'D8L4Z7TPH2C6'], ['BQL-SA-0038', 'P6X3A8RQK9M5'],
  ['BQL-SA-0039', 'T4V9M2WLC7N8'], ['BQL-SA-0040', 'H9K5Q6DAZ3P2'],
  ['BQL-SA-0041', 'N7R2X8CTW4M9'], ['BQL-SA-0042', 'C5A9P3KLV8Q6'],
  ['BQL-SA-0043', 'L8W4H9NDR2X7'], ['BQL-SA-0044', 'Q6T3Z5MPA9K8'],
  ['BQL-SA-0045', 'V2P8C7WRM4L9'], ['BQL-SA-0046', 'Z9X5K2AQT6N3'],
  ['BQL-SA-0047', 'M4D8R7VPH9C2'], ['BQL-SA-0048', 'A7L3W6KQP8X5'],
  ['BQL-SA-0049', 'R2N9H4TMZ7D6'], ['BQL-SA-0050', 'W8C5Q3XPL9V2'],
  ['BQL-SA-0051', 'K6M2A8ZRT4P9'], ['BQL-SA-0052', 'P9V7D5LQH3X8'],
  ['BQL-SA-0053', 'T3Q8W2KCM6A9'], ['BQL-SA-0054', 'H7X4R9NPZ5V2'],
  ['BQL-SA-0055', 'C8A6M3WTQ9L5'], ['BQL-SA-0056', 'L2P9Z7DKV4R8'],
  ['BQL-SA-0057', 'Q5W3H8XMA6T9'], ['BQL-SA-0058', 'V8N4C2PLR7K5'],
  ['BQL-SA-0059', 'Z3T9Q6VAW8M2'], ['BQL-SA-0060', 'M7K5X4RDH9C6'],
  ['BQL-SA-0061', 'A2L8P9WNT3Q7'], ['BQL-SA-0062', 'R9V6H5KCZ8M4'],
  ['BQL-SA-0063', 'W4C2M7XQP9A8'], ['BQL-SA-0064', 'K8T3Z6NLD5R9'],
  ['BQL-SA-0065', 'P5Q9A2VHW7X6'], ['BQL-SA-0066', 'T7M4C8RPK3L9'],
  ['BQL-SA-0067', 'H2X6W9DAZ5N8'], ['BQL-SA-0068', 'C9L5Q3KTV8P2'],
  ['BQL-SA-0069', 'L6R8M2XWA4T9'], ['BQL-SA-0070', 'Q8P3Z7CNH5V6'],
  ['BQL-SA-0071', 'V4W9K6ALR2M8'], ['BQL-SA-0072', 'Z7D2T9QXP5C4'],
  ['BQL-SA-0073', 'M3N8H4VRW6K9'], ['BQL-SA-0074', 'A9C5P7LQZ2T8'],
  ['BQL-SA-0075', 'R6X4W3KDM9V5'], ['BQL-SA-0076', 'W2T8Q5NAH7P9'],
  ['BQL-SA-0077', 'K9M6Z4XCC3R8'], ['BQL-SA-0078', 'P4V2A8WLT9Q5'],
  ['BQL-SA-0079', 'T8D7H3KPZ6M2'], ['BQL-SA-0080', 'H5Q9C2RNW8L4'],
  ['BQL-SA-0081', 'C7P3X9VAM5T8'], ['BQL-SA-0082', 'L4W6K2DQR9N5'],
  ['BQL-SA-0083', 'Q9A8M5XLZ3P7'], ['BQL-SA-0084', 'V6R2T7WCH4K9'],
  ['BQL-SA-0085', 'Z2N5Q8PAC6M3'], ['BQL-SA-0086', 'M9K4H6VDW3X8'],
  ['BQL-SA-0087', 'A5T7C9LQP2R6'], ['BQL-SA-0088', 'R8W3Z4NMK7V5'],
  ['BQL-SA-0089', 'W6X9P2DAH5Q4'], ['BQL-SA-0090', 'K3C8M7TRZ9L2'],
  ['BQL-SA-0091', 'P7L5W4XQA8N9'], ['BQL-SA-0092', 'T2R9H6KCM5V8'],
  ['BQL-SA-0093', 'H8A4Q3NPZ7W6'], ['BQL-SA-0094', 'C5M2X9VLR4T8'],
  ['BQL-SA-0095', 'L9Q7A6DWP3K5'], ['BQL-SA-0096', 'Q4V8Z2CMH9R6'],
  ['BQL-SA-0097', 'V7K3T5PXW8A2'], ['BQL-SA-0098', 'Z5W9H4LQM6C8'],
  ['BQL-SA-0099', 'M2X6R8NAK7P4'], ['BQL-SA-0100', 'A8C3Q9TVZ5L6'],
]);

function licenseApiBase() {
  return String((import.meta as any).env?.VITE_LICENSE_API_URL || '').replace(/\/+$/, '');
}

export function formatKey(raw: string): string {
  const r = raw.replace(/-/g, '').toUpperCase();
  return `${r.slice(0, 4)}-${r.slice(4, 8)}-${r.slice(8, 12)}`;
}

function electronAPI(): any { return (window as any).electronAPI; }
const isElectron = () => !!(window as any).electronAPI?.loadLicense;

async function getMachineIdSafe(): Promise<string> {
  if (isElectron()) {
    try { return await electronAPI().getMachineId(); } catch {}
  }
  return `browser-${navigator.userAgent.length}-${screen.width}x${screen.height}`;
}

function validateSeedLicense(licenseId: string, licenseKey: string) {
  const normalizedId = licenseId.toUpperCase().trim();
  const normalizedKey = licenseKey.replace(/-/g, '').toUpperCase().trim();
  return SEEDED_LICENSES.get(normalizedId) === normalizedKey;
}

function saveActivationRecord(record: ActivationRecord): ActivationRecord {
  inMemoryActivation = record;
  if (isElectron()) {
    electronAPI().saveLicense(record).catch(() => {});
  }
  return record;
}

function checkExpiry(record: ActivationRecord): ActivationRecord | null {
  if (record.expiresAt && Date.now() > record.expiresAt) {
    inMemoryActivation = null;
    if (isElectron()) electronAPI().clearLicense().catch(() => {});
    return null;
  }
  return record;
}

export async function initActivation(): Promise<ActivationRecord | null> {
  if (inMemoryActivation) return checkExpiry(inMemoryActivation);
  if (isElectron()) {
    try {
      const stored = await electronAPI().loadLicense();
      if (stored && typeof stored === 'object') {
        inMemoryActivation = stored as ActivationRecord;
        return checkExpiry(inMemoryActivation);
      }
    } catch {}
  }
  return null;
}

export function getActivation(): ActivationRecord | null {
  if (!inMemoryActivation) return null;
  return checkExpiry(inMemoryActivation);
}

async function requestLease(endpoint: 'activate' | 'trial' | 'heartbeat', body: Record<string, unknown>) {
  const base = licenseApiBase();
  if (!base) {
    throw new Error('License activation server is not configured. Set VITE_LICENSE_API_URL for production builds.');
  }
  const response = await fetch(`${base}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as Partial<SignedLeaseResponse> & { message?: string; error?: string };
  if (!response.ok || !data.lease) {
    throw new Error(data.message || data.error || `Activation server returned ${response.status}.`);
  }
  return data.lease;
}

export async function activateLicense(licenseId: string, licenseKey: string): Promise<ActivationRecord> {
  const normalizedId = licenseId.toUpperCase().trim();
  const normalizedKey = licenseKey.replace(/-/g, '').toUpperCase().trim();
  const machineId = await getMachineIdSafe();

  const base = licenseApiBase();
  if (base) {
    const lease = await requestLease('activate', { licenseId: normalizedId, licenseKey: normalizedKey, machineId, appVersion: APP_VERSION });
    return saveActivationRecord(lease as unknown as ActivationRecord);
  }

  if (!validateSeedLicense(normalizedId, normalizedKey)) {
    throw new Error('Invalid License ID or License Key.');
  }
  return saveActivationRecord({ licenseId: normalizedId, activatedAt: Date.now(), plan: 'standard', machineId });
}

export async function startTrial(): Promise<ActivationRecord> {
  const machineId = await getMachineIdSafe();
  const base = licenseApiBase();
  if (base) {
    const lease = await requestLease('trial', { machineId, appVersion: APP_VERSION });
    return saveActivationRecord(lease as unknown as ActivationRecord);
  }
  return saveActivationRecord({
    licenseId: `TRIAL-${machineId.slice(0, 12).toUpperCase()}`,
    activatedAt: Date.now(),
    expiresAt: Date.now() + 14 * 86400000,
    plan: 'trial',
    machineId,
  });
}

export function clearActivation(): void {
  inMemoryActivation = null;
  if (isElectron()) electronAPI().clearLicense().catch(() => {});
}

export function isActivated(): boolean {
  return !!getActivation();
}

export function trialDaysLeft(record: ActivationRecord): number {
  if (!record.expiresAt) return 999;
  return Math.max(0, Math.ceil((record.expiresAt - Date.now()) / 86400000));
}
