import { Injectable } from '@nestjs/common';
import { PrismaService } from '../platform/database/prisma.service';
import type { InternalEventEnvelope } from './realtime.contracts';

@Injectable()
export class RealtimeTargetResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveStudentPersonIds(event: InternalEventEnvelope): Promise<string[]> {
    const { type, id } = event.aggregate;
    switch (type) {
      case 'Enrollment':
        return this.fromEnrollment(event.organizationId, id);
      case 'AttendanceRecord':
        return this.fromAttendanceRecord(event.organizationId, id);
      case 'Certificate':
        return this.fromCertificate(event.organizationId, id);
      case 'Payment':
        return this.fromPayment(event.organizationId, id);
      case 'Session':
        return this.fromSession(event.organizationId, id);
      case 'PricingAgreement':
        return this.fromPricingAgreement(event.organizationId, id);
      case 'InstallmentSchedule':
        return this.fromInstallmentSchedule(event.organizationId, id);
      case 'EnrollmentCancellationRequest':
        return this.fromCancellationRequest(event.organizationId, id);
      case 'ModuleRetake':
        return this.fromModuleRetake(event.organizationId, id);
      case 'Invoice':
        return this.fromInvoice(event.organizationId, id);
      case 'CreditNote':
        return this.fromCreditNote(event.organizationId, id);
      case 'Student':
        return this.fromStudent(event.organizationId, id);
      case 'StudentRegistration':
        return this.fromRegistration(event.organizationId, id);
      default:
        return [];
    }
  }

  private async fromEnrollment(organizationId: string, id: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { organizationId, id },
      select: { studentPersonId: true },
    });
    return enrollment ? [enrollment.studentPersonId] : [];
  }

  private async fromAttendanceRecord(organizationId: string, id: string) {
    const record = await this.prisma.attendanceRecord.findFirst({
      where: { organizationId, id },
      select: { enrollmentId: true },
    });
    return record ? this.fromEnrollment(organizationId, record.enrollmentId) : [];
  }

  private async fromCertificate(organizationId: string, id: string) {
    const certificate = await this.prisma.certificate.findFirst({
      where: { organizationId, id },
      select: { enrollmentId: true },
    });
    return certificate ? this.fromEnrollment(organizationId, certificate.enrollmentId) : [];
  }

  private async fromPayment(organizationId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { organizationId, id },
      select: { enrollmentId: true, billingAccountId: true },
    });
    if (!payment) return [];
    if (payment.enrollmentId) return this.fromEnrollment(organizationId, payment.enrollmentId);
    return this.fromBillingAccount(organizationId, payment.billingAccountId);
  }

  private async fromSession(organizationId: string, id: string) {
    const session = await this.prisma.session.findFirst({
      where: { organizationId, id },
      select: { cohortId: true, startsAt: true, endsAt: true },
    });
    if (!session) return [];
    const at = session.startsAt ?? session.endsAt;
    if (!at) return [];
    const assignments = await this.prisma.enrollmentCohortAssignment.findMany({
      where: {
        organizationId,
        cohortId: session.cohortId,
        startsAt: { lte: at },
        OR: [{ endsAt: null }, { endsAt: { gt: at } }],
      },
      select: { enrollmentId: true },
      distinct: ['enrollmentId'],
    });
    return this.fromEnrollments(
      organizationId,
      assignments.map(({ enrollmentId }) => enrollmentId),
    );
  }

  private async fromPricingAgreement(organizationId: string, id: string) {
    const agreement = await this.prisma.pricingAgreement.findFirst({
      where: { organizationId, id },
      select: { enrollmentId: true },
    });
    return agreement ? this.fromEnrollment(organizationId, agreement.enrollmentId) : [];
  }

  private async fromInstallmentSchedule(organizationId: string, id: string) {
    const schedule = await this.prisma.installmentSchedule.findFirst({
      where: { organizationId, id },
      select: { enrollmentId: true },
    });
    return schedule ? this.fromEnrollment(organizationId, schedule.enrollmentId) : [];
  }

  private async fromCancellationRequest(organizationId: string, id: string) {
    const request = await this.prisma.enrollmentCancellationRequest.findFirst({
      where: { organizationId, id },
      select: { enrollmentId: true },
    });
    return request ? this.fromEnrollment(organizationId, request.enrollmentId) : [];
  }

  private async fromModuleRetake(organizationId: string, id: string) {
    const retake = await this.prisma.moduleRetake.findFirst({
      where: { organizationId, id },
      select: { enrollmentId: true },
    });
    return retake ? this.fromEnrollment(organizationId, retake.enrollmentId) : [];
  }

  private async fromInvoice(organizationId: string, id: string) {
    const invoice = await this.prisma.internalInvoice.findFirst({
      where: { organizationId, id },
      select: { billingAccountId: true },
    });
    return invoice ? this.fromBillingAccount(organizationId, invoice.billingAccountId) : [];
  }

  private async fromCreditNote(organizationId: string, id: string) {
    const creditNote = await this.prisma.creditNote.findFirst({
      where: { organizationId, id },
      select: { invoiceId: true },
    });
    return creditNote ? this.fromInvoice(organizationId, creditNote.invoiceId) : [];
  }

  private async fromStudent(organizationId: string, id: string) {
    const person = await this.prisma.person.findFirst({
      where: { organizationId, id },
      select: { id: true },
    });
    return person ? [person.id] : [];
  }

  private async fromRegistration(organizationId: string, id: string) {
    const registration = await this.prisma.studentRegistration.findFirst({
      where: { organizationId, id },
      select: { personId: true },
    });
    return registration ? [registration.personId] : [];
  }

  private async fromBillingAccount(organizationId: string, billingAccountId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { organizationId, billingAccountId },
      select: { studentPersonId: true },
    });
    return [...new Set(enrollments.map(({ studentPersonId }) => studentPersonId))];
  }

  private async fromEnrollments(organizationId: string, ids: string[]) {
    if (!ids.length) return [];
    const enrollments = await this.prisma.enrollment.findMany({
      where: { organizationId, id: { in: ids } },
      select: { studentPersonId: true },
    });
    return [...new Set(enrollments.map(({ studentPersonId }) => studentPersonId))];
  }
}
