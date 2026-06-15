import { describe, expect, it } from 'vitest';
import { resolveQrTable, buildPublicQrUrl } from './publicQr';

const tables = [
  { id: 'TBL-1781515451416', branchId: 'branch-main', label: 'T11' },
  { id: 'TBL-1781521415664', branchId: 'branch-main', label: 'T2' },
  { id: 'TBL-1781521415665', branchId: 'branch-patio', label: 'T2' },
];

describe('resolveQrTable', () => {
  it('matches the current Firestore document id', () => {
    expect(resolveQrTable(tables, ['TBL-1781521415664'])?.label).toBe('T2');
  });

  it('matches stable table labels and legacy table-number tokens', () => {
    expect(resolveQrTable(tables, ['T2'])?.id).toBe('TBL-1781521415664');
    expect(resolveQrTable(tables, ['table-2'])?.id).toBe('TBL-1781521415664');
    expect(resolveQrTable(tables, ['2'])?.id).toBe('TBL-1781521415664');
  });

  it('uses the branch id to disambiguate repeated labels', () => {
    expect(resolveQrTable(tables, ['T2'], 'branch-patio')?.id).toBe('TBL-1781521415665');
  });
});

describe('buildPublicQrUrl', () => {
  it('includes both the stable label and the live table id', () => {
    expect(buildPublicQrUrl(tables[1], {
      appUrl: 'https://tandeel.netlify.app/?view=admin',
      cloudUrl: 'https://cloud.example.com',
    })).toBe('https://tandeel.netlify.app/?qrTable=T2&qrId=TBL-1781521415664&qrBranch=branch-main&cloudUrl=https%3A%2F%2Fcloud.example.com');
  });
});
