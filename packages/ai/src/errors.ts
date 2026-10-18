import type { GatewayErrorCode } from './index';

/**
 * Typed gateway failure — carries the wire-level code from `GatewayErrorCode`
 * plus retryability (fallback decisions) and the HTTP status the route should
 * answer with when the stream has not started yet.
 */
export class GatewayError extends Error {
  readonly code: GatewayErrorCode;
  readonly retryable: boolean;
  readonly status: number;

  constructor(
    code: GatewayErrorCode,
    message: string,
    options: { retryable?: boolean; status?: number } = {},
  ) {
    super(message);
    this.name = 'GatewayError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? statusForGatewayError(code);
  }
}

export function statusForGatewayError(code: GatewayErrorCode): number {
  switch (code) {
    case 'invalid_request':
      return 400;
    case 'insufficient_sparks':
      return 402;
    case 'policy_blocked':
      return 403;
    case 'provider_rate_limit':
      return 429;
    case 'not_configured':
      return 503;
    case 'model_unavailable':
      return 503;
    case 'provider_auth':
      return 502;
    case 'network':
      return 502;
    case 'budget_exceeded':
      return 402;
    default:
      return 502;
  }
}
