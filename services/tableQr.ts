import { DiningTable } from '../types';

interface TableQrLookupOptions {
  branchId?: string | null;
  tableLabel?: string | null;
}

function slugifySegment(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeTableLabel(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function labelCandidatesFromToken(value: string) {
  const clean = String(value || '').trim();
  const candidates = new Set<string>();
  if (!clean) return candidates;

  candidates.add(normalizeTableLabel(clean));

  const numberedTableMatch = clean.match(/^table[-_\s]*(\d+)$/i);
  if (numberedTableMatch) {
    candidates.add(normalizeTableLabel(`T${numberedTableMatch[1]}`));
  }

  const shortTableMatch = clean.match(/^t[-_\s]*(\d+)$/i);
  if (shortTableMatch) {
    candidates.add(normalizeTableLabel(`T${shortTableMatch[1]}`));
  }

  return candidates;
}

export function buildTablePublicCode(table: Pick<DiningTable, 'branchId' | 'label'>) {
  const branchSegment = slugifySegment(String(table.branchId || '').replace(/^branch-/, ''));
  const labelSegment = slugifySegment(table.label) || 'table';
  return branchSegment ? `${branchSegment}-${labelSegment}` : labelSegment;
}

export function ensureUniqueTablePublicCode(
  table: Pick<DiningTable, 'id' | 'branchId' | 'label'> & Partial<Pick<DiningTable, 'publicCode'>>,
  tables: Array<Pick<DiningTable, 'id'> & Partial<Pick<DiningTable, 'publicCode'>>>,
) {
  const requested = slugifySegment(table.publicCode || '') || buildTablePublicCode(table);
  let candidate = requested;
  let suffix = 2;

  while (tables.some(existing => existing.id !== table.id && existing.publicCode === candidate)) {
    candidate = `${requested}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function findTableForQr<T extends Pick<DiningTable, 'id' | 'branchId' | 'label'> & Partial<Pick<DiningTable, 'publicCode'>>>(
  tables: T[],
  qrToken: string,
  options: TableQrLookupOptions = {},
) {
  const cleanToken = String(qrToken || '').trim();
  const cleanBranchId = String(options.branchId || '').trim();
  const branchScopedTables = cleanBranchId
    ? tables.filter(table => !table.branchId || table.branchId === cleanBranchId)
    : tables;
  const exactCandidates = [cleanToken].filter(Boolean);
  const labelCandidates = new Set<string>();

  labelCandidatesFromToken(cleanToken).forEach(candidate => labelCandidates.add(candidate));
  labelCandidatesFromToken(String(options.tableLabel || '')).forEach(candidate => labelCandidates.add(candidate));

  const exactMatch = branchScopedTables.find(table =>
    exactCandidates.includes(table.id) || exactCandidates.includes(table.publicCode || '') || exactCandidates.includes(buildTablePublicCode(table))
  );
  if (exactMatch) return exactMatch;

  const labelMatch = branchScopedTables.find(table => labelCandidates.has(normalizeTableLabel(table.label)));
  if (labelMatch) return labelMatch;

  return tables.find(table =>
    exactCandidates.includes(table.id)
    || exactCandidates.includes(table.publicCode || '')
    || exactCandidates.includes(buildTablePublicCode(table))
    || labelCandidates.has(normalizeTableLabel(table.label))
  );
}
