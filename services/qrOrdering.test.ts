import { describe, expect, it } from 'vitest';
import { findTableByQrValue, tableLookupCandidates, tableLookupKeys } from './qrOrdering';
import { DiningTable } from '../types';

const tables: DiningTable[] = [
  {
    id: 'table-49',
    branchId: 'branch-main',
    areaId: 'area-main',
    label: 'T49',
    seats: 4,
    state: 'vacant',
    updatedAt: 1,
  },
  {
    id: 'TBL-1700000000000',
    branchId: 'branch-main',
    areaId: 'area-main',
    label: '7',
    seats: 2,
    state: 'vacant',
    updatedAt: 1,
  },
];

describe('QR table lookup helpers', () => {
  it('builds aliases for numeric table scans', () => {
    expect(tableLookupCandidates('49')).toEqual(['49', 't49', 'table-49', 'tbl-49']);
    expect(tableLookupCandidates('T49')).toEqual(['t49', '49', 'table-49', 'tbl-49']);
  });

  it('matches scanned table numbers against ids and labels', () => {
    expect(findTableByQrValue(tables, '49')?.id).toBe('table-49');
    expect(findTableByQrValue(tables, 'table-49')?.id).toBe('table-49');
    expect(findTableByQrValue(tables, 'T49')?.id).toBe('table-49');
    expect(findTableByQrValue(tables, '7')?.id).toBe('TBL-1700000000000');
  });

  it('includes both stable ids and printed labels as table keys', () => {
    expect(tableLookupKeys(tables[1])).toContain('tbl-1700000000000');
    expect(tableLookupKeys(tables[1])).toContain('7');
  });
});
