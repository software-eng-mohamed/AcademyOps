import { escapeHtml } from './session-notification-email';
import type { OtpChannelAlertPayload } from './otp-channel-notification.types';

export function otpChannelAlertEmail(
  payload: OtpChannelAlertPayload,
  dashboardUrl: string,
): { subject: string; html: string; text: string } {
  const messages = copy(payload.type);
  const state = `State: ${payload.state}`;
  const error = payload.errorCode ? `Fault code: ${payload.errorCode}` : null;
  const action = 'Open OTP channel dashboard';
  const html = [
    '<div lang="en" dir="ltr">',
    `<h1>${escapeHtml(messages.heading)}</h1>`,
    `<p>${escapeHtml(messages.body)}</p>`,
    `<p>${escapeHtml(state)}</p>`,
    error ? `<p>${escapeHtml(error)}</p>` : '',
    `<p><a href="${escapeHtml(dashboardUrl)}">${escapeHtml(action)}</a></p>`,
    '</div>',
  ].join('');
  return {
    subject: messages.subject,
    html,
    text: [messages.body, state, error, `${action}: ${dashboardUrl}`].filter(Boolean).join('\n'),
  };
}

function copy(type: OtpChannelAlertPayload['type']) {
  if (type === 'QR_REQUIRED') {
    return {
      subject: 'WhatsApp OTP needs a QR scan',
      heading: 'WhatsApp reconnection required',
      body: 'The OTP channel stopped and needs a QR scan from the dashboard.',
    };
  }
  if (type === 'RECOVERED') {
    return {
      subject: 'WhatsApp OTP channel recovered',
      heading: 'OTP channel recovered',
      body: 'The connection is healthy and sign-in codes can be delivered again.',
    };
  }
  return {
    subject: 'WhatsApp OTP channel is down',
    heading: 'OTP delivery stopped',
    body: 'OTP issuance was automatically stopped because the WhatsApp channel is unhealthy.',
  };
}
