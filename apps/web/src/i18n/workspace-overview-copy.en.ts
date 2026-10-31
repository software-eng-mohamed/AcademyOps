import type { WorkspaceOverviewCopy } from './workspace-overview-copy';
export const en: WorkspaceOverviewCopy = {
  studentActive: { label: 'My courses', caption: 'Your active enrollments' },
  loading: 'Loading your overview',
  error: 'We couldn’t load your overview. Please try again.',
  stale: 'We couldn’t refresh this view. These are the last loaded figures.',
  forbidden: 'Your account no longer has access to this workspace.',
  retry: 'Try again',
  timezone: 'Cairo time',
  roles: {
    OPERATIONS: {
      title: 'Operations overview',
      description: 'A clear start to your day. Keep sessions and registrations moving.',
    },
    ACADEMIC: {
      title: 'Academic overview',
      description: 'Your academy at a glance. A little space to plan a great learning day.',
    },
    RECEPTION: {
      title: 'Reception overview',
      description:
        'Welcome everyone with confidence. Here is today’s schedule and the registration queue.',
    },
    ACCOUNTS: {
      title: 'Accounts overview',
      description: 'A simple view of your recent payments, with the details close at hand.',
    },
    ATTENDANCE: {
      title: 'Attendance overview',
      description: 'Ready for today’s classes. Keep an eye on sessions and attendance windows.',
    },
    TRAINER: {
      title: 'Trainer overview',
      description:
        'Your next class, a little closer. Here is what is coming up in your teaching schedule.',
    },
    STUDENT: {
      title: 'My learning overview',
      description:
        'Good things start with a little progress. Your courses and next classes are right here.',
    },
    OTP_OPERATOR: {
      title: 'WhatsApp overview',
      description: 'A quick check on your verification channel, so sign-in messages keep moving.',
    },
  },
  metrics: {
    sessionsToday: { label: 'Today’s sessions', caption: 'Scheduled and completed today' },
    sessionsNext7Days: {
      label: 'Coming up',
      caption: 'Upcoming sessions, today and the next 6 days',
    },
    completedSessionsThisMonth: {
      label: 'Classes completed',
      caption: 'Your sessions dated this month',
    },
    activeEnrollments: {
      label: 'Active enrollments',
      caption: 'Currently active within your access',
    },
    pendingEnrollments: { label: 'Awaiting approval', caption: 'Enrollments pending approval' },
    draftEnrollments: { label: 'Registration drafts', caption: 'Registrations not yet submitted' },
    completedEnrollments: { label: 'Completed courses', caption: 'Your completed enrollments' },
    activeCohorts: { label: 'Active groups', caption: 'Groups currently running' },
    openWindowsToday: {
      label: 'Attendance open',
      caption: 'Today’s sessions accepting attendance',
    },
    completedSessionsToday: {
      label: 'Sessions completed',
      caption: 'Today’s classes marked complete',
    },
    paymentsToday: { label: 'Payments today', caption: 'Received today and currently posted' },
    paymentsThisMonth: {
      label: 'Payments this month',
      caption: 'Received this month and currently posted',
    },
    reversedPaymentsThisMonth: {
      label: 'Reversed payments',
      caption: 'Received this month, now reversed',
    },
  },
  queues: {
    TODAY: {
      title: 'Today’s schedule',
      description: 'Your visible sessions, in time order.',
      empty: 'No scheduled or completed sessions for today.',
    },
    UPCOMING: {
      title: 'Your next sessions',
      description: 'The next classes from today through the next 6 days.',
      empty: 'No upcoming sessions in this seven-day window.',
    },
    PAYMENTS: {
      title: 'Recent payments',
      description: 'Payments received this month, newest first.',
      empty: 'No payments received this month within your access.',
    },
  },
  preview: 'Showing {shown} of {total}',
  emptyTitle: 'A little breathing room',
  session: 'Class session',
  payment: 'Payment',
  noRoom: 'No room assigned',
  unknownStatus: 'Status unavailable',
  status: {
    SCHEDULED: 'Scheduled',
    COMPLETED: 'Completed',
    POSTED: 'Posted',
    PENDING_VERIFICATION: 'Pending verification',
    REVERSED: 'Reversed',
    REJECTED: 'Rejected',
  },
  channel: {
    title: 'Channel details',
    description: 'Connection status only. No verification codes or pairing secrets are shown here.',
    state: 'Connection',
    readiness: 'OTP delivery',
    enabled: 'Channel',
    ready: 'Ready',
    notReady: 'Not ready',
    on: 'Enabled',
    off: 'Disabled',
    phone: 'Linked number',
    noPhone: 'No number linked',
    lastConnected: 'Last connected',
    heartbeat: 'Last heartbeat',
    never: 'Not recorded yet',
    qrNeeded: 'The channel needs pairing before it can send verification messages.',
    states: {
      DISABLED: 'Disabled',
      STARTING: 'Starting',
      QR_REQUIRED: 'Pairing needed',
      CONNECTED: 'Connected',
      DISCONNECTED: 'Disconnected',
      FAULTED: 'Needs attention',
      STALE: 'Not responding',
    },
  },
};
