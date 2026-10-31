import { LOAD_ROLES, LOAD_SUBJECT_COUNT, type LoadRole } from './constants';

export interface PlannedSubject {
  runnerIndex: number;
  role: LoadRole;
  roleIndex: number;
  syntheticSubjectId: string;
  publicId: string;
}

export function localUsers(total: number, runners: number, runner: number): number {
  return Math.floor((total + runners - 1 - runner) / runners);
}

export function roleAllocations(users: number): Record<LoadRole, number> {
  if (!Number.isInteger(users) || users < 4)
    throw new Error('Each runner needs at least four users.');
  const owner = Math.max(1, Math.round(users * 0.01));
  const accounts = Math.max(1, Math.round(users * 0.02));
  const attendance = Math.max(1, Math.round(users * 0.03));
  return { student: users - owner - accounts - attendance, attendance, accounts, owner };
}

export function buildPlan(runnerCount: number): PlannedSubject[] {
  const roleSequences: Record<LoadRole, number> = {
    student: 0,
    attendance: 0,
    accounts: 0,
    owner: 0,
  };
  const plan: PlannedSubject[] = [];
  for (let runnerIndex = 0; runnerIndex < runnerCount; runnerIndex += 1) {
    const allocation = roleAllocations(localUsers(LOAD_SUBJECT_COUNT, runnerCount, runnerIndex));
    for (const role of LOAD_ROLES) {
      for (let localIndex = 0; localIndex < allocation[role]; localIndex += 1) {
        roleSequences[role] += 1;
        const roleIndex = roleSequences[role];
        const suffix = String(roleIndex).padStart(6, '0');
        plan.push({
          runnerIndex,
          role,
          roleIndex,
          syntheticSubjectId: `load-${role}-${roleIndex}`,
          publicId: `LOAD-${role.toUpperCase()}-${suffix}`,
        });
      }
    }
  }
  if (plan.length !== LOAD_SUBJECT_COUNT) throw new Error('Load subject plan is inconsistent.');
  return plan;
}
