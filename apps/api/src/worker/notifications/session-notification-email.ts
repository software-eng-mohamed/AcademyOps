import type { SessionNotificationPayload } from './session-notification.types';

export type SessionEmailContent = { subject: string; html: string; text: string };

export function sessionEmailContent(payload: SessionNotificationPayload): SessionEmailContent {
  const cancelled = payload.type === 'CANCELLED';
  const cohort = payload.cohort.name || payload.cohort.code;
  const room = payload.room ? payload.room.name || payload.room.code : 'To be announced';
  const start = formatCairo(payload.startsAt);
  const end = formatCairo(payload.endsAt);
  const subject = cancelled ? `${cohort} session cancelled` : `${cohort} session rescheduled`;
  const heading = cancelled ? 'Session cancelled' : 'Session rescheduled';
  const labels = { cohort: 'Cohort', start: 'Starts', end: 'Ends', room: 'Room' };
  const safe = {
    heading: escapeHtml(heading),
    cohort: escapeHtml(cohort),
    start: escapeHtml(start),
    end: escapeHtml(end),
    room: escapeHtml(room),
  };
  const html = [
    '<div lang="en" dir="ltr">',
    `<h1>${safe.heading}</h1>`,
    `<p><strong>${labels.cohort}:</strong> ${safe.cohort}</p>`,
    `<p><strong>${labels.start}:</strong> ${safe.start}</p>`,
    `<p><strong>${labels.end}:</strong> ${safe.end}</p>`,
    `<p><strong>${labels.room}:</strong> ${safe.room}</p>`,
    '</div>',
  ].join('');
  const text = [
    heading,
    `${labels.cohort}: ${cohort}`,
    `${labels.start}: ${start}`,
    `${labels.end}: ${end}`,
    `${labels.room}: ${room}`,
  ].join('\n');
  return { subject, html, text };
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!,
  );
}

function formatCairo(value: string | null): string {
  if (!value) return 'Not specified';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(value));
}
