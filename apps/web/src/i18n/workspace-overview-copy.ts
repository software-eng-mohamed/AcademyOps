import type {
  WorkspaceMetricKey,
  WorkspaceOverviewRole,
} from '@academyops/api-client/workspace-overview';
import type { Locale } from '@/lib/locales';
import { ar } from './workspace-overview-copy.ar';
import { en } from './workspace-overview-copy.en';

export type WorkspaceOverviewCopy = {
  loading: string;
  error: string;
  stale: string;
  forbidden: string;
  retry: string;
  timezone: string;
  studentActive: { label: string; caption: string };
  roles: Record<WorkspaceOverviewRole, { title: string; description: string }>;
  metrics: Record<WorkspaceMetricKey, { label: string; caption: string }>;
  queues: Record<
    'TODAY' | 'UPCOMING' | 'PAYMENTS',
    { title: string; description: string; empty: string }
  >;
  preview: string;
  emptyTitle: string;
  session: string;
  payment: string;
  noRoom: string;
  status: Record<string, string>;
  unknownStatus: string;
  channel: {
    title: string;
    description: string;
    state: string;
    readiness: string;
    enabled: string;
    ready: string;
    notReady: string;
    on: string;
    off: string;
    phone: string;
    noPhone: string;
    lastConnected: string;
    heartbeat: string;
    never: string;
    qrNeeded: string;
    states: Record<string, string>;
  };
};

export function getWorkspaceOverviewCopy(locale: Locale): WorkspaceOverviewCopy {
  return locale === 'ar' ? ar : en;
}
