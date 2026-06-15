import readXlsxFile from 'read-excel-file/browser';
import { Category, Product } from '../types';
import { downloadCsv } from './csvService';

function normalizeKey(key: string) {
  return key.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function mapRow(row: Record<string, any>): Partial<Product> {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
  return {
    nameEn: String(normalized.nameen || normalized.name || normalized.productname || '').trim(),
    nameAr: String(normalized.namear || normalized.arabicname || normalized.nameen || normalized.name || '').trim(),
    barcode: String(normalized.barcode || normalized.sku || '').trim(),
    price: Number(normalized.price || normalized.sellingprice || 0),
    costPrice: Number(normalized.costprice || normalized.cost || 0),
    stock: Number(normalized.stock || normalized.qty || normalized.quantity || 0),
    category: (normalized.category || Category.SNACKS) as Category,
    expiryDate: normalized.expirydate ? String(normalized.expirydate) : '',
    selectiveTax: normalized.selectivetax || 'none'
  };
}

export async function parseProductImport(file: File): Promise<Partial<Product>[]> {
  const buffer = await file.arrayBuffer();
  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = new TextDecoder().decode(buffer);
    const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
    const headers = headerLine.split(',').map(header => header.trim());
    const rows = lines.map(line => {
      const values = line.split(',').map(value => value.trim());
      return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
    });
    return rows.map(mapRow).filter(product => product.nameEn && product.barcode);
  }

  const sheetRows = await readXlsxFile(file) as unknown as any[][];
  const headers = (sheetRows[0] || []).map(value => String(value || ''));
  const rows = sheetRows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
  return rows
    .map(mapRow)
    .filter(product => product.nameEn && product.barcode);
}

export function downloadProductTemplate() {
  const rows = [
    {
      nameEn: 'Example Product',
      nameAr: 'منتج مثال',
      barcode: '6280000000000',
      price: 10,
      costPrice: 7,
      stock: 24,
      category: Category.SNACKS,
      expiryDate: '2026-12-31',
      selectiveTax: 'none'
    }
  ];
  const headers = Object.keys(rows[0]);
  downloadCsv(
    'baqala_product_import_template.csv',
    headers,
    rows.map(row => headers.map(header => (row as any)[header] ?? ''))
  );
}
