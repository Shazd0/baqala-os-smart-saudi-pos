import { CartItem } from '../types';

export interface SaleTotals {
  subtotal: number;
  vat: number;
  selectiveTaxAmount: number;
  total: number;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateSaleTotals(cart: CartItem[], discount = 0): SaleTotals {
  let subtotal = 0;
  let vat = 0;
  let selectiveTaxAmount = 0;
  let total = 0;

  cart.forEach(item => {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;

    const selTax = item.selectiveTax || 'none';
    if (selTax === 'tobacco') {
      const basePrice = itemTotal / 2.3;
      subtotal += basePrice;
      selectiveTaxAmount += basePrice;
      vat += basePrice * 0.3;
    } else if (selTax === 'energy') {
      const basePrice = itemTotal / 1.725;
      subtotal += basePrice;
      selectiveTaxAmount += basePrice * 0.5;
      vat += basePrice * 0.225;
    } else {
      const basePrice = itemTotal / 1.15;
      subtotal += basePrice;
      vat += itemTotal - basePrice;
    }
  });

  if (discount > 0 && total > 0) {
    const boundedDiscount = Math.min(discount, total);
    const discountRatio = (total - boundedDiscount) / total;
    subtotal *= discountRatio;
    vat *= discountRatio;
    selectiveTaxAmount *= discountRatio;
    total -= boundedDiscount;
  }

  return {
    subtotal: roundMoney(subtotal),
    vat: roundMoney(vat),
    selectiveTaxAmount: roundMoney(selectiveTaxAmount),
    total: roundMoney(total)
  };
}
