import { describe, expect, it } from 'vitest';
import { Category, CartItem } from '../types';
import { calculateSaleTotals } from './pricing';

function item(overrides: Partial<CartItem>): CartItem {
  return {
    id: 'p1',
    nameEn: 'Product',
    nameAr: 'منتج',
    barcode: '123',
    price: 115,
    category: Category.SNACKS,
    stock: 10,
    quantity: 1,
    selectiveTax: 'none',
    ...overrides
  };
}

describe('calculateSaleTotals', () => {
  it('extracts 15% VAT from VAT-inclusive shelf prices', () => {
    expect(calculateSaleTotals([item({ price: 115 })])).toEqual({
      subtotal: 100,
      vat: 15,
      selectiveTaxAmount: 0,
      total: 115
    });
  });

  it('calculates tobacco selective tax and VAT portions', () => {
    expect(calculateSaleTotals([item({ price: 230, selectiveTax: 'tobacco' })])).toEqual({
      subtotal: 100,
      vat: 30,
      selectiveTaxAmount: 100,
      total: 230
    });
  });

  it('bounds discounts to the sale total', () => {
    expect(calculateSaleTotals([item({ price: 50 })], 100).total).toBe(0);
  });
});
