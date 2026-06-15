import { HardwareConfig } from '../types';

export interface PaymentGatewayRequest {
  amount: number;
  currency: string;
  orderId: string;
  branchId?: string;
  terminalId?: string;
}

export interface PaymentGatewayResult {
  approved: boolean;
  approvalReference?: string;
  rrn?: string;
  cardScheme?: string;
  message: string;
  raw?: unknown;
}

export async function processMadaPayment(config: HardwareConfig, request: PaymentGatewayRequest): Promise<PaymentGatewayResult> {
  if (!config.paymentGatewayEnabled) {
    throw new Error('Payment gateway is disabled. Enable it in Settings > Hardware & Payments.');
  }

  const baseUrl = config.paymentGatewayUrl?.trim();
  if (!baseUrl) {
    throw new Error('Payment gateway URL is missing. Add your mada terminal middleware URL in Settings.');
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), (config.paymentGatewayTimeoutSeconds || 60) * 1000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/payments/mada`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.paymentGatewayApiKey ? { Authorization: `Bearer ${config.paymentGatewayApiKey}` } : {}),
      },
      body: JSON.stringify({
        amount: Number(request.amount.toFixed(2)),
        currency: request.currency || 'SAR',
        orderId: request.orderId,
        branchId: request.branchId,
        terminalId: request.terminalId || config.paymentGatewayTerminalId,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || `Payment gateway returned ${response.status}.`);
    }

    const approved = Boolean(payload.approved ?? payload.success);
    if (!approved) {
      throw new Error(payload.message || payload.error || 'Payment was declined by the terminal.');
    }

    return {
      approved: true,
      approvalReference: payload.approvalReference || payload.approvalCode || payload.authCode || payload.rrn,
      rrn: payload.rrn,
      cardScheme: payload.cardScheme || payload.scheme || 'mada',
      message: payload.message || 'Payment approved.',
      raw: payload,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Payment gateway timed out. Check the terminal and try again.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
