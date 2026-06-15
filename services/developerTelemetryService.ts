import type {
  DeveloperBugReportPayload,
  DeveloperDeviceType,
  DeveloperNetworkSourceType,
  DeveloperReportCategory,
} from '../types/developerTelemetry';

const RECIPIENT_EMAIL = 'shhahhzzadd@gmail.com' as const;
const APP_VERSION = '1.0.2';
const QUEUE_STORAGE_KEY = 'oasis:developer-telemetry:failed-reports';
const MAX_QUEUED_REPORTS = 20;

export interface DeveloperBugReportDraft {
  category: DeveloperReportCategory;
  title: string;
  screenContext: string;
  description: string;
}

export interface DeveloperTelemetryContext {
  targetBranchId: string;
  activeBranchName?: string;
  activeUserSessionName: string;
  activeUserRole?: string;
  networkSourceType: DeveloperNetworkSourceType;
  currentReactStateDump: Record<string, unknown>;
  activeComponentStackTrace?: string;
}

export interface DeveloperTelemetrySubmitResult {
  delivered: boolean;
  fallback: 'none' | 'electron-log' | 'browser-queue';
  status?: number;
  message: string;
}

function telemetryEndpoint() {
  return String(import.meta.env.VITE_DEVELOPER_TELEMETRY_ENDPOINT || '').trim();
}

function getDeviceType(): DeveloperDeviceType {
  if (typeof window !== 'undefined' && window.oasisDeveloperTelemetry?.appendDebugLog) {
    return 'Electron Desktop';
  }

  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const tabletSignals = /iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent);
  return tabletSignals ? 'Tablet Web' : 'Browser Web';
}

function browserStackTrace() {
  try {
    throw new Error('Developer telemetry capture');
  } catch (error) {
    return error instanceof Error ? error.stack || error.message : 'Stack unavailable';
  }
}

export function buildDeveloperBugReportPayload(
  draft: DeveloperBugReportDraft,
  context: DeveloperTelemetryContext
): DeveloperBugReportPayload {
  const now = new Date();

  return {
    id: `DEV-${now.getTime()}`,
    recipientEmail: RECIPIENT_EMAIL,
    systemMetadata: {
      appVersion: APP_VERSION,
      targetBranchId: context.targetBranchId || 'unassigned',
      activeBranchName: context.activeBranchName,
      deviceType: getDeviceType(),
      activeUserSessionName: context.activeUserSessionName || 'Unknown session',
      activeUserRole: context.activeUserRole,
    },
    environmentalContext: {
      sqlLocalLatencyMs: null,
      networkSourceType: context.networkSourceType,
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
      userAgent: typeof navigator === 'undefined' ? 'Unknown user agent' : navigator.userAgent,
      locationPath: typeof window === 'undefined'
        ? 'Unknown location'
        : `${window.location.pathname}${window.location.search}`,
    },
    reportBody: {
      category: draft.category,
      title: draft.title,
      screenContext: draft.screenContext,
      description: draft.description,
    },
    diagnostics: {
      currentReactStateDump: context.currentReactStateDump,
      activeComponentStackTrace: context.activeComponentStackTrace || 'No React component stack captured.',
      browserStackTrace: browserStackTrace(),
      timestampIso: now.toISOString(),
    },
  };
}

function readQueuedReports(): DeveloperBugReportPayload[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-MAX_QUEUED_REPORTS) : [];
  } catch {
    return [];
  }
}

function queueInBrowser(payload: DeveloperBugReportPayload) {
  if (typeof window === 'undefined') return;

  const nextQueue = [...readQueuedReports(), payload].slice(-MAX_QUEUED_REPORTS);
  try {
    window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(nextQueue));
  } catch {
    // Telemetry must never block POS operations if the browser storage quota is full.
  }
}

async function appendElectronDebugLog(payload: DeveloperBugReportPayload) {
  const bridge = typeof window === 'undefined' ? undefined : window.oasisDeveloperTelemetry;
  if (!bridge?.appendDebugLog) return false;

  const logLine = `${JSON.stringify(payload)}\n`;
  return Boolean(await bridge.appendDebugLog(logLine));
}

async function persistFallback(payload: DeveloperBugReportPayload): Promise<'electron-log' | 'browser-queue'> {
  try {
    if (await appendElectronDebugLog(payload)) return 'electron-log';
  } catch {
    // Fall through to the browser queue if the desktop bridge rejects.
  }

  queueInBrowser(payload);
  return 'browser-queue';
}

export async function submitDeveloperBugReport(
  payload: DeveloperBugReportPayload
): Promise<DeveloperTelemetrySubmitResult> {
  const endpoint = telemetryEndpoint();

  if (!endpoint) {
    const fallback = await persistFallback(payload);
    return {
      delivered: false,
      fallback,
      message: 'Developer telemetry endpoint is not configured. Report was saved for developer review.',
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.status !== 200) {
      throw new Error(`Developer telemetry endpoint returned HTTP ${response.status}.`);
    }

    return {
      delivered: true,
      fallback: 'none',
      status: response.status,
      message: `Diagnostics delivered to ${RECIPIENT_EMAIL}.`,
    };
  } catch (error) {
    const fallback = await persistFallback(payload);
    return {
      delivered: false,
      fallback,
      message: error instanceof Error
        ? `${error.message} Report was saved for developer review.`
        : 'Network delivery failed. Report was saved for developer review.',
    };
  }
}
