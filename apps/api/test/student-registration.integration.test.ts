import { expect, it } from 'vitest';
import { createTestHarness } from './postgres/harness';
import { createTransactionPrismaAdapter } from './postgres/prisma-adapter';
import { StudentRegistrationService } from '../src/students/student-registration.service';
import { AuditService } from '../src/platform/audit/audit.service';
import { OutboxService } from '../src/platform/outbox/outbox.service';
const harness = createTestHarness();
harness.databaseDescribe('Student Registration Service - Submit', () => {
  it('creates all records atomically with unverified identifiers and audits/outbox', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const org = await transaction.organization.create({
        data: { code: 'INTEG_SUBMIT', name: 'Submit Integration' },
      });
      const adapter = createTransactionPrismaAdapter(transaction);
      const audit = new AuditService();
      const outbox = new OutboxService();
      const service = new StudentRegistrationService(adapter, audit, outbox);
      const countBefore = await transaction.studentRegistration.count({
        where: { organizationId: org.id },
      });
      expect(countBefore).toBe(0);
      const res = await service.register(
        {
          organizationCode: 'INTEG_SUBMIT',
          name: 'Ahmed Ali',
          email: 'submit@example.com',
          phone: '01011112222',
          password: 'securePassword123!',
          preferredLocale: 'ar',
        },
        'test-corr-submit',
      );
      expect(res.id).toBeDefined();
      expect(res.status).toBe('PENDING');
      const countAfter = await transaction.studentRegistration.count({
        where: { organizationId: org.id },
      });
      expect(countAfter).toBe(1);
      const reg = await transaction.studentRegistration.findUniqueOrThrow({
        where: { id: res.id },
      });
      expect(reg.status).toBe('PENDING');
      expect(reg.version).toBe(1);
      const person = await transaction.person.findUniqueOrThrow({
        where: { id: reg.personId },
      });
      expect(person.name).toBe('Ahmed Ali');
      const contacts = await transaction.personContact.findMany({
        where: { personId: reg.personId },
      });
      expect(contacts).toHaveLength(2);
      expect(contacts.some((c) => c.type === 'EMAIL' && c.rawValue === 'submit@example.com')).toBe(
        true,
      );
      const user = await transaction.user.findUniqueOrThrow({
        where: { id: reg.userId },
      });
      expect(user.status).toBe('PENDING');
      const ids = await transaction.userLoginIdentifier.findMany({
        where: { userId: reg.userId },
      });
      expect(ids).toHaveLength(2);
      expect(ids.every((i) => i.verifiedAt === null)).toBe(true);
      const audits = await transaction.auditEvent.findMany({
        where: { entityType: 'StudentRegistration', entityId: reg.id },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]!.action).toBe('student.registration.submitted');
      const auditAfter = audits[0]!.after as Record<string, string>;
      expect(auditAfter.registrationId).toBe(reg.id);
      expect(auditAfter.email).toBeUndefined();
      expect(auditAfter.phone).toBeUndefined();
      const events = await transaction.outboxEvent.findMany({
        where: { aggregateType: 'StudentRegistration', aggregateId: reg.id },
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('student.registration.submitted');
      const eventPayload = events[0]!.payload as Record<string, string>;
      expect(eventPayload.registrationId).toBe(reg.id);
      expect(eventPayload.email).toBeUndefined();
      expect(eventPayload.phone).toBeUndefined();
    }));
  it('accepts duplicate email and phone opaquely while leaving no partial records', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const org = await transaction.organization.create({
        data: { code: 'INTEG_DUP', name: 'Duplicate Integration' },
      });
      const adapter = createTransactionPrismaAdapter(transaction);
      const audit = new AuditService();
      const outbox = new OutboxService();
      const service = new StudentRegistrationService(adapter, audit, outbox);
      await service.register(
        {
          organizationCode: 'INTEG_DUP',
          name: 'Ahmed Ali',
          email: 'dup@example.com',
          phone: '01022223333',
          password: 'securePassword123!',
          preferredLocale: 'ar',
        },
        'test-corr-1',
      );
      const usersBefore = await transaction.user.count({ where: { organizationId: org.id } });
      expect(usersBefore).toBe(1);
      // Email collision
      await expect(
        service.register(
          {
            organizationCode: 'INTEG_DUP',
            name: 'Khaled Ali',
            email: 'dup@example.com',
            phone: '01022224444',
            password: 'securePassword555!',
            preferredLocale: 'ar',
          },
          'test-corr-2',
        ),
      ).resolves.toMatchObject({ status: 'PENDING' });
      // Phone collision
      await expect(
        service.register(
          {
            organizationCode: 'INTEG_DUP',
            name: 'Mahmoud Ali',
            email: 'different@example.com',
            phone: '01022223333',
            password: 'securePassword555!',
            preferredLocale: 'ar',
          },
          'test-corr-3',
        ),
      ).resolves.toMatchObject({ status: 'PENDING' });
      const usersAfter = await transaction.user.count({ where: { organizationId: org.id } });
      expect(usersAfter).toBe(1);
      const persons = await transaction.person.findMany({ where: { organizationId: org.id } });
      expect(persons).toHaveLength(1);
    }));
});
