import { DiningTable } from '../types';

function compactLookupValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function tableLookupCandidates(value: string) {
  const compact = compactLookupValue(value);
  const numericMatch = compact.match(/^(?:table|tbl|t)[-_#]?(\d+)$/);
  const numericValue = numericMatch?.[1] || (/^\d+$/.test(compact) ? compact : '');

  return unique([
    compact,
    numericValue,
    numericValue ? `t${numericValue}` : '',
    numericValue ? `table-${numericValue}` : '',
    numericValue ? `tbl-${numericValue}` : '',
  ]);
}

export function tableLookupKeys(table: Pick<DiningTable, 'id' | 'label'>) {
  return unique([
    ...tableLookupCandidates(table.id),
    ...tableLookupCandidates(table.label),
  ]);
}

export function findTableByQrValue(tables: DiningTable[], value: string) {
  const candidateKeys = new Set(tableLookupCandidates(value));
  return tables.find(table => tableLookupKeys(table).some(key => candidateKeys.has(key)));
}
