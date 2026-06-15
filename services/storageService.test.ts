import { describe, expect, it } from 'vitest';
import { StorageService } from './storageService';

describe('StorageService production reads', () => {
  it('does not persist preview data while reading customers without Firebase', () => {
    expect(StorageService.isFirebaseConfigured()).toBe(false);
    expect(() => StorageService.getCustomers()).not.toThrow();
  });
});
