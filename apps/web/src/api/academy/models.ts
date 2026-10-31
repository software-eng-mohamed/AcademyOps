export const academySections = [
  'leads',
  'students',
  'registrations',
  'enrollments',
  'programs',
  'cohorts',
  'resources',
] as const;
export type AcademySection = (typeof academySections)[number];
export type AcademyResource =
  | Exclude<AcademySection, 'resources'>
  | 'rooms'
  | 'trainers'
  | 'modules'
  | 'stages'
  | 'versions';
export type RecordData = Record<string, unknown>;
export type AcademyRecord = {
  id: string;
  name: string;
  code: string;
  status: string;
  version: number;
  data: RecordData;
};
export type AcademyPageData = {
  items: AcademyRecord[];
  nextCursor: string | null;
  total?: number;
  pages?: number;
};
export type AcademyFilters = {
  search?: string;
  status?: string;
  cursor?: string;
  page?: number;
  studentId?: string;
  cohortId?: string;
};

export function record(value: unknown): RecordData {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as RecordData)
    : {};
}
export function records(value: unknown): RecordData[] {
  return Array.isArray(value) ? value.map(record) : [];
}
export function textValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
export function field(data: RecordData, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => record(value)[key], data);
}
export function normalizeRecord(resource: AcademyResource, value: unknown): AcademyRecord {
  const data = record(value);
  if (typeof data.id !== 'string') throw new Error('Invalid academy record');
  const person = record(data.person);
  const student = record(data.student);
  const name = textValue(data.name || person.name || student.name || data.code || data.publicId);
  return {
    id: data.id,
    name,
    code: textValue(data.code || data.publicId || person.publicId || student.publicId),
    status: textValue(
      data.state ||
        data.status ||
        (typeof data.isActive === 'boolean' ? (data.isActive ? 'ACTIVE' : 'INACTIVE') : ''),
    ),
    version: Number(resource === 'versions' ? data.recordVersion : data.version),
    data,
  };
}

export const resourceStatuses: Partial<Record<AcademyResource, readonly string[]>> = {
  leads: ['NEW', 'OPEN', 'QUALIFIED', 'WON', 'LOST', 'DISQUALIFIED'],
  registrations: ['PENDING', 'APPROVED', 'REJECTED'],
  enrollments: ['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'POSTPONED', 'COMPLETED', 'CANCELLED'],
  programs: ['ACTIVE', 'ARCHIVED'],
  cohorts: ['DRAFT', 'PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
  trainers: ['ACTIVE', 'INACTIVE'],
};

export function supportsSearch(resource: AcademyResource) {
  return !['registrations', 'enrollments', 'stages', 'versions'].includes(resource);
}
