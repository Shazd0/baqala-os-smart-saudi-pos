import { describe, expect, it } from 'vitest';
import { DiningTable } from '../types';
import { buildTablePublicCode, ensureUniqueTablePublicCode, findTableForQr } from './tableQr';

function table(overrides: Partial<DiningTable>): DiningTable {
  return {
    id: 'tbl-1',
    publicCode: 'main-t1',
    branchId: 'branch-main',
    areaId: 'area-main',
    label: 'T1',
    seats: 4,
    state: 'vacant',
    updatedAt: 1,
    ...overrides,
  };
}

describe('tableQr helpers', () => {
  it('matches legacy default QR ids by table label pattern', () => {
    const tables = [
      table({ id: 'TBL-123', publicCode: 'main-t2', label: 'T2' }),
      table({ id: 'TBL-456', publicCode: 'main-t11', label: 'T11' }),
    ];

    expect(findTableForQr(tables, 'table-2', { branchId: 'branch-main' })?.id).toBe('TBL-123');
    expect(findTableForQr(tables, 'table-11', { branchId: 'branch-main' })?.id).toBe('TBL-456');
  });

  it('matches stable public codes before falling back to labels', () => {
    const tables = [
      table({ id: 'TBL-123', publicCode: 'main-t2', label: 'T2' }),
      table({ id: 'TBL-456', publicCode: 'family-t2', branchId: 'branch-family', label: 'T2' }),
    ];

    expect(findTableForQr(tables, 'family-t2', { branchId: 'branch-family' })?.id).toBe('TBL-456');
  });

  it('keeps regenerated public codes unique inside a branch', () => {
    const tables = [
      table({ id: 'TBL-123', publicCode: 'main-t2', label: 'T2' }),
    ];
    const recreated = table({ id: 'TBL-789', publicCode: '', label: 'T2' });

    expect(buildTablePublicCode(recreated)).toBe('main-t2');
    expect(ensureUniqueTablePublicCode(recreated, tables)).toBe('main-t2-2');
  });
});
