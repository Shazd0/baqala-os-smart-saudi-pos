export function requiredText(value: unknown, label: string) {
  if (!String(value ?? '').trim()) return `${label} is required.`;
  return '';
}

export function positiveNumber(value: unknown, label: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return `${label} must be greater than zero.`;
  return '';
}

export function nonNegativeNumber(value: unknown, label: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return `${label} cannot be negative.`;
  return '';
}

export function integerAtLeast(value: unknown, min: number, label: string) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) return `${label} must be at least ${min}.`;
  return '';
}

export function optionalSaudiPhone(value: unknown, label = 'Phone') {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return `${label} is not valid.`;
  return '';
}

export function optionalVatNumber(value: unknown, label = 'VAT number') {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!/^3\d{13}3$/.test(digits)) return `${label} should be a valid 15-digit Saudi VAT number.`;
  return '';
}

export function firstError(...errors: string[]) {
  return errors.find(Boolean) || '';
}
