import type { HardwareConfig, StoreConfig, User, ZatcaState } from './types';

declare module '*.md?raw' {
  const content: string;
  export default content;
}

declare global {
  interface Window {
    baqala?: {
      data<T = unknown>(command: string, payload?: Record<string, unknown>): T;
      printReceipt(): Promise<boolean>;
      printHtml(options: { html: string; deviceName?: string; silent?: boolean }): Promise<{ ok: boolean; message?: string }>;
      getPrinters(): Promise<Array<{ name: string; displayName?: string; isDefault?: boolean; status?: number }>>;
      openPath(targetPath: string): Promise<boolean>;
      selectBackupFile(): Promise<string>;
      onUpdateStatus(callback: (payload: { status: 'checking' | 'available' | 'not-available' | 'downloaded' | 'error'; version?: string; message?: string }) => void): () => void;
    };
  }
}

export interface BaqalaBridgeShapes {
  config: StoreConfig;
  user: User;
  hardware: HardwareConfig;
  zatca: ZatcaState;
}
