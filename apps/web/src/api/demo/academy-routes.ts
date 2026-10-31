import { handleCatalogRoute } from './academy-catalog-routes';
import { handleEnrollmentRoute } from './academy-enrollment-routes';
import { handleLeadRoute } from './academy-lead-routes';
import { academyView } from './academy-relations';
import { handleStudentRoute } from './academy-student-routes';
import { type DemoContext, find, json, notFound, ownerId, page, records } from './shared';

const collections: Record<string, string> = {
  students: 'students',
  leads: 'leads',
  'lead-stages': 'leadStages',
  'student-registrations': 'studentRegistrations',
  enrollments: 'enrollments',
  programs: 'programs',
  'program-versions': 'programVersions',
  modules: 'modules',
  cohorts: 'cohorts',
  rooms: 'rooms',
  trainers: 'trainers',
};
export function handleAcademyRoute(context: DemoContext): Response | null {
  const catalog = handleCatalogRoute(context);
  if (catalog) return catalog;
  const enrollment = handleEnrollmentRoute(context);
  if (enrollment) return enrollment;
  const student = handleStudentRoute(context);
  if (student) return student;
  const lead = handleLeadRoute(context);
  if (lead) return lead;
  const { path, method, state, url } = context;
  const collection = collections[path[0] ?? ''];
  if (!collection || method !== 'GET') return null;
  if (path[0] === 'leads' && path[1] === 'assignees')
    return json({
      items: [{ userId: ownerId, name: 'Demo Owner', email: 'owner@academyops.demo' }],
      nextCursor: null,
    });
  if (path.length === 1) {
    const items = records(state, collection).map((item) => academyView(state, collection, item));
    return collection === 'leadStages'
      ? json(
          items.filter(
            (item) => url.searchParams.get('includeInactive') === 'true' || item.isActive !== false,
          ),
        )
      : page(items, url);
  }
  if (path.length === 2) {
    const item = find(state, collection, path[1]);
    return item ? json(academyView(state, collection, item)) : notFound();
  }
  return null;
}
