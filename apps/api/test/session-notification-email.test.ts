import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  sessionEmailContent,
} from '../src/worker/notifications/session-notification-email';
import type { SessionNotificationPayload } from '../src/worker/notifications/session-notification.types';
describe('session notification email copy', () => {
  it('escapes dynamic HTML and formats the session in Cairo time', () => {
    const content = sessionEmailContent(payloadFixture());
    expect(content.subject).toContain('<script>');
    expect(content.html).not.toContain('<script>');
    expect(content.html).toContain('&lt;script&gt;');
    expect(content.html).toContain('13:00');
  });
  it('builds English cancellation content', () => {
    const content = sessionEmailContent({ ...payloadFixture(), type: 'CANCELLED' });
    expect(content.subject).toContain('session cancelled');
    expect(content.html).toContain('lang="en" dir="ltr"');
  });
  it('escapes all HTML-special characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#039;');
  });
});
function payloadFixture(): SessionNotificationPayload {
  return {
    v: 1,
    sessionId: 'session-a',
    type: 'RESCHEDULED',
    startsAt: '2026-08-11T10:00:00.000Z',
    endsAt: '2026-08-11T12:00:00.000Z',
    cohort: { id: 'cohort-a', code: 'C01', name: '<script>alert(1)</script>' },
    room: {
      id: 'room-a',
      code: 'R01',
      name: 'Room & Hall',
    },
  };
}
