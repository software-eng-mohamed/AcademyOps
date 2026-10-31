import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { readArtifact } from './artifacts';
import {
  E2E_FIXTURE_MARKER,
  E2E_ORGANIZATION_CODE,
  LOAD_ARTIFACT_MARKER,
  LOAD_PERSON_PREFIX,
  LOAD_SUBJECT_COUNT,
} from './constants';
import { assertDisposableOrganization, assertSeedIntent } from './safety';
import { buildPlan } from './plan';
import { verifyDomainData } from './verify-domain';

const chunkSize = 500;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function verifyLoadFixture(prisma: PrismaClient): Promise<void> {
  const environment = assertSeedIntent();
  const organization = await assertDisposableOrganization(prisma);
  const people = await prisma.person.findMany({
    where: { organizationId: organization.id, publicId: { startsWith: LOAD_PERSON_PREFIX } },
    select: { id: true },
  });
  if (people.length !== LOAD_SUBJECT_COUNT) throw new Error('Synthetic person count is invalid.');
  const personIds = people.map((person) => person.id);
  const expectedStudents = buildPlan(environment.runnerCount).filter(
    (item) => item.role === 'student',
  ).length;
  const users = await prisma.user.findMany({
    where: { organizationId: organization.id, personId: { in: personIds } },
    select: { id: true, passwordHash: true },
  });
  if (users.length !== LOAD_SUBJECT_COUNT || users.some((user) => user.passwordHash !== null)) {
    throw new Error('Load users are missing or unexpectedly have passwords.');
  }
  const userIds = users.map((user) => user.id);
  const [identifiers, assignments, sessions, students, staff] = await Promise.all([
    prisma.userLoginIdentifier.count({
      where: { organizationId: organization.id, userId: { in: userIds } },
    }),
    prisma.userRoleAssignment.count({
      where: { organizationId: organization.id, userId: { in: userIds }, endsAt: null },
    }),
    prisma.userSession.count({
      where: { organizationId: organization.id, userId: { in: userIds }, revokedAt: null },
    }),
    prisma.studentProfile.count({
      where: { organizationId: organization.id, personId: { in: personIds } },
    }),
    prisma.staffProfile.count({
      where: { organizationId: organization.id, personId: { in: personIds } },
    }),
  ]);
  if (
    identifiers !== 0 ||
    assignments !== LOAD_SUBJECT_COUNT ||
    sessions !== LOAD_SUBJECT_COUNT ||
    students + staff !== LOAD_SUBJECT_COUNT
  ) {
    throw new Error('Load identity/session/profile counts are inconsistent.');
  }
  const domain = await verifyDomainData(prisma, organization.id, personIds, expectedStudents);

  const artifactSessions = [];
  let attendanceSessionId: string | null = null;
  for (let runner = 0; runner < environment.runnerCount; runner += 1) {
    const artifact = await readArtifact(runner);
    if (
      artifact.marker !== LOAD_ARTIFACT_MARKER ||
      artifact.fixtureMarker !== E2E_FIXTURE_MARKER ||
      artifact.revision !== environment.revision ||
      artifact.organization.code !== E2E_ORGANIZATION_CODE ||
      artifact.targetOrigin !== environment.targetOrigin ||
      artifact.runner.index !== runner ||
      artifact.runner.count !== environment.runnerCount ||
      !domain.attendanceSessionIds.has(artifact.targets.attendanceSessionId)
    ) {
      throw new Error(`Runner ${runner} artifact metadata is invalid.`);
    }
    attendanceSessionId ??= artifact.targets.attendanceSessionId;
    if (attendanceSessionId !== artifact.targets.attendanceSessionId) {
      throw new Error('Runner attendance targets do not match.');
    }
    artifactSessions.push(...artifact.sessions);
  }
  if (artifactSessions.length !== LOAD_SUBJECT_COUNT) {
    throw new Error('Artifact session count is invalid.');
  }
  const subjects = new Set(artifactSessions.map((session) => session.syntheticSubjectId));
  if (subjects.size !== LOAD_SUBJECT_COUNT) throw new Error('Artifact subjects are not unique.');
  const enrollmentIds = artifactSessions.flatMap((session) =>
    session.role === 'student' && session.enrollmentId ? [session.enrollmentId] : [],
  );
  if (
    enrollmentIds.length !== expectedStudents ||
    new Set(enrollmentIds).size !== expectedStudents ||
    enrollmentIds.some((id) => !domain.enrollmentIds.has(id)) ||
    artifactSessions.some((session) => session.role !== 'student' && session.enrollmentId)
  ) {
    throw new Error('Artifact enrollment bindings are invalid.');
  }
  const tokenHashes = artifactSessions.map((session) => {
    const token = Object.entries(session.cookies).find(([name]) =>
      name.endsWith('plg_session'),
    )?.[1];
    if (!token) throw new Error('Artifact session cookie is missing.');
    return digest(`${token}:${environment.sessionPepper}`);
  });
  let matched = 0;
  for (let index = 0; index < tokenHashes.length; index += chunkSize) {
    matched += await prisma.userSession.count({
      where: { tokenHash: { in: tokenHashes.slice(index, index + chunkSize) }, revokedAt: null },
    });
  }
  if (matched !== LOAD_SUBJECT_COUNT)
    throw new Error('Artifact cookies do not match active DB sessions.');
  console.log(`${LOAD_SUBJECT_COUNT} synthetic load subjects, sessions, and artifacts verified.`);
}
