import { randomUUID } from 'node:crypto';
import { CertificateTokenService } from '../../src/certificates/certificate-token.service';
import { attendanceFixture } from './attendance-role-http-support';
import { seedBusinessFixture } from './business-chain-fixture';
import type { HttpTestContext } from './http-test-harness';

export async function trainerFixture(context: HttpTestContext) {
  const f = await attendanceFixture(context, 'TRAINER');
  const { prisma, organizationId, personId, branchId } = context;
  const trainer = await prisma.trainerProfile.create({ data: { organizationId, personId } });
  const room = await prisma.room.create({
    data: { organizationId, branchId, code: 'ASSIGNED', name: 'Assigned room' },
  });
  const session = await prisma.session.update({
    where: { id: f.sessionId },
    data: { roomId: room.id, deliveryMode: 'IN_PERSON' },
  });
  const assignment = await prisma.sessionTrainer.create({
    data: {
      organizationId,
      sessionId: session.id,
      trainerId: trainer.id,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
    },
  });
  // Same company and physical location: access must come from teaching assignment, not branch membership.
  const other = await seedBusinessFixture(context);
  const otherRoom = await prisma.room.create({
    data: { organizationId, branchId, code: 'OTHER', name: 'Unassigned room' },
  });
  const otherPerson = await prisma.person.create({
    data: { organizationId, publicId: `TR-${randomUUID().slice(0, 12)}`, name: 'Other trainer' },
  });
  const otherTrainer = await prisma.trainerProfile.create({
    data: { organizationId, personId: otherPerson.id },
  });
  const otherSession = await prisma.session.create({
    data: {
      organizationId,
      cohortId: other.cohortId,
      cohortModuleId: other.cohortModuleId,
      ordinal: 1,
      roomId: otherRoom.id,
      deliveryMode: 'IN_PERSON',
      status: 'SCHEDULED',
      startsAt: new Date(Date.now() + 7200000),
      endsAt: new Date(Date.now() + 10800000),
    },
  });
  await prisma.sessionTrainer.create({
    data: {
      organizationId,
      sessionId: otherSession.id,
      trainerId: otherTrainer.id,
      startsAt: otherSession.startsAt,
      endsAt: otherSession.endsAt,
    },
  });
  // A shared room and cohort do not give a trainer access to another trainer's session.
  const peerSession = await prisma.session.create({
    data: {
      organizationId,
      cohortId: f.cohortId,
      cohortModuleId: f.cohortModuleId,
      ordinal: 2,
      roomId: room.id,
      deliveryMode: 'IN_PERSON',
      status: 'SCHEDULED',
      startsAt: new Date(Date.now() + 14400000),
      endsAt: new Date(Date.now() + 18000000),
    },
  });
  return {
    ...f,
    trainerId: trainer.id,
    assignmentId: assignment.id,
    roomId: room.id,
    other,
    otherRoomId: otherRoom.id,
    otherTrainerId: otherTrainer.id,
    otherSessionId: otherSession.id,
    peerSessionId: peerSession.id,
  };
}

export async function trainerCertificate(
  context: HttpTestContext,
  enrollmentId: string,
  programVersionId: string,
  sessionId: string,
) {
  const { prisma, organizationId, userId } = context;
  await prisma.attendanceRecord.create({
    data: {
      organizationId,
      enrollmentId,
      sessionId,
      currentStatus: 'PRESENT',
      source: 'MANUAL',
      recordedBy: userId,
      recordedAt: new Date(),
    },
  });
  const rule = await prisma.certificateRuleVersion.create({
    data: {
      organizationId,
      programVersionId,
      version: 1,
      minimumRatio: '0.8000',
      effectiveFrom: new Date(Date.now() - 86400000),
      createdBy: userId,
    },
  });
  const evaluation = await prisma.eligibilityEvaluation.create({
    data: {
      organizationId,
      enrollmentId,
      ruleVersionId: rule.id,
      academicResult: 'ELIGIBLE',
      attendanceRatio: '1.0000',
      financialHold: false,
      evidenceSnapshot: {},
      evaluatedBy: userId,
    },
  });
  const id = randomUUID();
  const tokens = context.app.get(CertificateTokenService);
  return prisma.certificate.create({
    data: {
      id,
      organizationId,
      enrollmentId,
      evaluationId: evaluation.id,
      serial: `TRAINER-QA-${id}`,
      verificationDigest: tokens.digest(tokens.tokenFor(id)),
      issuedBy: userId,
    },
  });
}
