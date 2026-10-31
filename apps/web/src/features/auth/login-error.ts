import { isPlgApiError } from '@academyops/api-client/http';
import type { LoginCopy } from './login-copy';

export type LoginErrorView = { correlationId?: string; message: string };

export function loginErrorView(error: unknown, copy: LoginCopy): LoginErrorView {
  if (!isPlgApiError(error)) return { message: copy.errorGeneric };

  let message = copy.errorGeneric;
  if (error.payload.code === 'INVALID_CREDENTIALS') message = copy.errorInvalid;
  else if (error.payload.code === 'MFA_CODE_INVALID') message = copy.errorMfa;
  else if (error.payload.code === 'PHONE_OTP_INVALID') message = copy.errorPhoneOtpInvalid;
  else if (error.payload.code === 'PHONE_OTP_UNAVAILABLE') message = copy.errorPhoneOtpUnavailable;
  else if (error.status === 429) message = copy.errorRateLimit;
  else if (error.payload.code === 'NETWORK_ERROR') message = copy.errorNetwork;
  else if (error.payload.code === 'REQUEST_TIMEOUT') message = copy.errorTimeout;

  return {
    ...(error.correlationId ? { correlationId: error.correlationId } : {}),
    message,
  };
}
