export type DeveloperReportCategory =
  | 'pos_crash'
  | 'zatca_signing_failure'
  | 'inventory_mismatch'
  | 'hardware_printer_failure'
  | 'payment_gateway_failure'
  | 'sync_latency'
  | 'other';

export type DeveloperNetworkSourceType = 'cloud' | 'firestore' | 'local';

export type DeveloperDeviceType = 'Electron Desktop' | 'Tablet Web' | 'Browser Web';

export interface DeveloperReportSystemMetadata {
  appVersion: string;
  targetBranchId: string;
  activeBranchName?: string;
  deviceType: DeveloperDeviceType;
  activeUserSessionName: string;
  activeUserRole?: string;
}

export interface DeveloperReportEnvironmentalContext {
  sqlLocalLatencyMs: number | null;
  networkSourceType: DeveloperNetworkSourceType;
  online: boolean;
  userAgent: string;
  locationPath: string;
}

export interface DeveloperReportBody {
  category: DeveloperReportCategory;
  title: string;
  screenContext: string;
  description: string;
}

export interface DeveloperReportDiagnostics {
  currentReactStateDump: Record<string, unknown>;
  activeComponentStackTrace: string;
  browserStackTrace: string;
  timestampIso: string;
}

export interface DeveloperBugReportPayload {
  id: string;
  recipientEmail: 'shhahhzzadd@gmail.com';
  systemMetadata: DeveloperReportSystemMetadata;
  environmentalContext: DeveloperReportEnvironmentalContext;
  reportBody: DeveloperReportBody;
  diagnostics: DeveloperReportDiagnostics;
}

export interface DeveloperTelemetryBridge {
  appendDebugLog?: (payloadLine: string) => boolean | Promise<boolean>;
}

declare global {
  interface Window {
    oasisDeveloperTelemetry?: DeveloperTelemetryBridge;
  }
}
