/** Thin wrapper around electronAPI printer IPC channels. Works only in Electron. */

export interface PrinterConfig {
  host: string;
  port: number;
  enabled: boolean;
}

export interface ReceiptData {
  storeName: string;
  address?: string;
  vatNumber?: string;
  date: string;
  invoiceId: string;
  cashierName?: string;
  items: { qty: number; name: string; price: number }[];
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  paid: number;
  change: number;
  paymentMethod?: string;
  qrCode?: string;
  invoiceHash?: string;
}

function api() { return (window as any).electronAPI; }

export const PrinterService = {
  isAvailable(): boolean { return !!(window as any).electronAPI?.printReceipt; },

  async getConfig(): Promise<PrinterConfig> {
    if (!api()) return { host: '', port: 9100, enabled: false };
    return api().getPrinterConfig();
  },

  async saveConfig(cfg: PrinterConfig): Promise<void> {
    if (api()) await api().savePrinterConfig(cfg);
  },

  async printReceipt(data: ReceiptData): Promise<{ success: boolean; error?: string }> {
    if (!api()) return { success: false, error: 'Electron not available' };
    const cfg = await api().getPrinterConfig();
    if (!cfg.enabled || !cfg.host) return { success: false, error: 'Printer not configured' };
    return api().printReceipt(cfg, data);
  },

  async openCashDrawer(): Promise<{ success: boolean; error?: string }> {
    if (!api()) return { success: false, error: 'Electron not available' };
    const cfg = await api().getPrinterConfig();
    if (!cfg.enabled || !cfg.host) return { success: false, error: 'Printer not configured' };
    return api().openCashDrawer(cfg);
  },

  async testPrint(): Promise<{ success: boolean; error?: string }> {
    if (!api()) return { success: false, error: 'Electron not available' };
    const cfg = await api().getPrinterConfig();
    return api().testPrint(cfg);
  },
};

export const CustomerDisplayService = {
  isAvailable(): boolean { return !!(window as any).electronAPI?.openCustomerDisplay; },

  async open(): Promise<void> { if (api()) await api().openCustomerDisplay(); },
  async close(): Promise<void> { if (api()) await api().closeCustomerDisplay(); },
  async isOpen(): Promise<boolean> { return api() ? api().isCustomerDisplayOpen() : false; },

  async update(cart: { items: any[]; total: number; storeName: string }): Promise<void> {
    if (api()) await api().updateCustomerDisplay(cart);
  },

  onCartUpdate(cb: (data: any) => void): () => void {
    if (!api()?.onCustomerDisplayCart) return () => {};
    return api().onCustomerDisplayCart(cb);
  },
};
