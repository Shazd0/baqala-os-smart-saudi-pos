import { DiningTable } from '../types';

type QrTableTarget = Pick<DiningTable, 'id' | 'label' | 'branchId'>;

function cleanUrl(value: string) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeQrToken(value: string) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function labelCandidates(value: string) {
  const raw = String(value || '').trim();
  const normalized = normalizeQrToken(raw);
  const candidates = new Set<string>();

  if (raw) candidates.add(raw);
  if (normalized) candidates.add(normalized);

  const tableMatch = raw.match(/^(?:table|tbl|t)[\s_-]*0*(\d+)$/i) || raw.match(/^0*(\d+)$/);
  if (tableMatch) {
    const numericLabel = `T${Number(tableMatch[1])}`;
    candidates.add(numericLabel);
    candidates.add(normalizeQrToken(numericLabel));
  }

  return [...candidates];
}

function scopeTables<T extends QrTableTarget>(tables: T[], branchId?: string) {
  if (!branchId) return tables;
  return tables.filter(table => !table.branchId || table.branchId === branchId);
}

export function resolveQrTable<T extends QrTableTarget>(
  tables: T[],
  tokens: Array<string | null | undefined>,
  branchId?: string
) {
  const searchScope = scopeTables(tables, branchId);
  const tokenValues = tokens.map(value => String(value || '').trim()).filter(Boolean);

  for (const token of tokenValues) {
    const exact = tables.find(table => table.id === token);
    if (exact) return exact;
  }

  for (const token of tokenValues) {
    const exactLabel = searchScope.find(table => table.label.trim().toLowerCase() === token.toLowerCase());
    if (exactLabel) return exactLabel;
  }

  for (const token of tokenValues) {
    const candidates = labelCandidates(token);
    const normalizedMatch = searchScope.find(table => candidates.includes(normalizeQrToken(table.label)));
    if (normalizedMatch) return normalizedMatch;
  }

  return undefined;
}

export function buildPublicQrUrl(
  table: QrTableTarget,
  options: {
    appUrl: string;
    cloudUrl?: string;
  }
) {
  const url = new URL(options.appUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('qrTable', table.label.trim() || table.id);
  url.searchParams.set('qrId', table.id);
  if (table.branchId) url.searchParams.set('qrBranch', table.branchId);

  const appOrigin = cleanUrl(url.origin);
  const cloudUrl = cleanUrl(options.cloudUrl || '');
  if (cloudUrl && cloudUrl !== appOrigin) {
    url.searchParams.set('cloudUrl', cloudUrl);
  }

  return url.toString();
}
