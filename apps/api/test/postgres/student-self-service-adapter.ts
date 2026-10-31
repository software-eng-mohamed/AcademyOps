import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../src/platform/database/prisma.service';

export function createMockAdapter(transaction: Prisma.TransactionClient): PrismaService {
  return {
    organization: transaction.organization,
    branch: transaction.branch,
    person: transaction.person,
    user: transaction.user,
    studentProfile: transaction.studentProfile,
    billingAccount: transaction.billingAccount,
    program: transaction.program,
    programVersion: transaction.programVersion,
    academicModule: transaction.academicModule,
    programVersionModule: transaction.programVersionModule,
    cohortModule: transaction.cohortModule,
    enrollment: transaction.enrollment,
    pricingAgreement: transaction.pricingAgreement,
    pricingAgreementLine: transaction.pricingAgreementLine,
    installmentSchedule: transaction.installmentSchedule,
    installment: transaction.installment,
    ledgerEntry: transaction.ledgerEntry,
    ledgerAllocation: transaction.ledgerAllocation,
    paymentMethod: transaction.paymentMethod,
    payment: transaction.payment,
    paymentEvent: transaction.paymentEvent,
    session: transaction.session,
    sessionTrainer: transaction.sessionTrainer,
    cohort: transaction.cohort,
    cohortModule: transaction.cohortModule,
    enrollmentCohortAssignment: transaction.enrollmentCohortAssignment,
    attendanceRecord: transaction.attendanceRecord,
    makeupCredit: transaction.makeupCredit,
    certificateRuleVersion: transaction.certificateRuleVersion,
    certificate: transaction.certificate,
    fileAsset: transaction.fileAsset,
    eligibilityEvaluation: transaction.eligibilityEvaluation,
    room: transaction.room,
    trainerProfile: transaction.trainerProfile,
    legacyReference: transaction.legacyReference,
    $transaction: async <T>(work: (t: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
      work(transaction),
    serializable: async <T>(work: (t: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
      work(transaction),
    $executeRawUnsafe: transaction.$executeRawUnsafe.bind(transaction),
  } as unknown as PrismaService;
}
