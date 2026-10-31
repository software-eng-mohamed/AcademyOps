import type { AcademyRecord, AcademyResource, records } from '@/api/academy/models';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import type { AcademyCopy } from '@/i18n/academy-copy';
import type { Locale } from '@/lib/locales';
import type { ActionTarget, recordActions } from './actions';
import type { DetailSelection } from './detail-drawer';
export type AcademyDetailModel = {
  detail: AcademyRecord;
  resource: AcademyResource;
  user: DashboardUser;
  locale: Locale;
  copy: AcademyCopy;
  actions: ReturnType<typeof recordActions>;
  allEvents: ReturnType<typeof records>;
  onInspect: (selection: DetailSelection) => void;
  onAction: (target: ActionTarget) => void;
};
