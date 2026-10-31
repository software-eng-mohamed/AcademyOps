import { NotFoundException } from '@nestjs/common';
import type { Prisma, StudentRegistration } from '@prisma/client';
import type { StudentRegistrationDetailDto } from './student-registration.dto';
type TransactionClient = Omit<
  Prisma.TransactionClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
export async function presentRegistrationDetails(
  transaction: TransactionClient,
  organizationId: string,
  registrations: StudentRegistration[],
): Promise<StudentRegistrationDetailDto[]> {
  if (registrations.length === 0) {
    return [];
  }
  const personIds = Array.from(new Set(registrations.map((r) => r.personId)));
  const userIds = Array.from(new Set(registrations.map((r) => r.userId)));
  const [persons, users, contacts] = await Promise.all([
    transaction.person.findMany({
      where: { organizationId, id: { in: personIds } },
    }),
    transaction.user.findMany({
      where: { organizationId, id: { in: userIds } },
    }),
    transaction.personContact.findMany({
      where: { organizationId, personId: { in: personIds }, isPrimary: true },
    }),
  ]);
  const personMap = new Map(persons.map((p) => [p.id, p]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const contactsByPerson = new Map<
    string,
    {
      email?: string;
      phone?: string;
    }
  >();
  for (const contact of contacts) {
    const values = contactsByPerson.get(contact.personId) ?? {};
    if (contact.type === 'EMAIL') values.email = contact.rawValue;
    if (contact.type === 'PHONE') values.phone = contact.rawValue;
    contactsByPerson.set(contact.personId, values);
  }
  return registrations.map((item) => {
    const person = personMap.get(item.personId);
    const user = userMap.get(item.userId);
    const personContacts = contactsByPerson.get(item.personId);
    return {
      id: item.id,
      organizationId: item.organizationId,
      personId: item.personId,
      userId: item.userId,
      status: item.status as 'PENDING' | 'APPROVED' | 'REJECTED',
      submittedAt: item.submittedAt,
      reviewedAt: item.reviewedAt,
      reviewedByUserId: item.reviewedByUserId,
      rejectionReason: item.rejectionReason,
      preferredLocale: (user?.preferredLocale || 'ar') as 'ar' | 'en',
      version: item.version,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      name: person?.name || null,
      email: personContacts?.email ?? '',
      phone: personContacts?.phone ?? '',
    };
  });
}
export async function presentRegistrationDetail(
  transaction: TransactionClient,
  organizationId: string,
  id: string,
): Promise<StudentRegistrationDetailDto> {
  const item = await transaction.studentRegistration.findFirst({
    where: { organizationId, id },
  });
  if (!item) {
    throw new NotFoundException({
      code: 'REGISTRATION_NOT_FOUND',
      messageKey: 'students.registration.notFound',
    });
  }
  const [detail] = await presentRegistrationDetails(transaction, organizationId, [item]);
  if (!detail) {
    throw new NotFoundException({
      code: 'REGISTRATION_NOT_FOUND',
      messageKey: 'students.registration.notFound',
    });
  }
  return detail;
}
