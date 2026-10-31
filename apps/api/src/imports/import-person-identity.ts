import type { Prisma } from '@prisma/client';
import { jsonObject, type MasterValue } from './import-values';

const reviewedMappingField = 'REVIEWED_PERSON_MAPPING';

export async function reviewedPersonForRow(
  db: Prisma.TransactionClient,
  organizationId: string,
  importRowId: string,
) {
  const mappings = await db.legacyReference.findMany({
    where: {
      organizationId,
      importRowId,
      entityType: 'PERSON',
      sourceField: reviewedMappingField,
    },
    select: { entityId: true },
  });
  if (mappings.length !== 1) return { person: null, mappingCount: mappings.length };
  const [person, decision] = await Promise.all([
    db.person.findFirst({
      where: { organizationId, id: mappings[0]!.entityId },
    }),
    db.personMatchCandidate.findFirst({
      where: {
        organizationId,
        importRowId,
        candidatePersonId: mappings[0]!.entityId,
        decision: 'MATCHED',
        decidedBy: { not: null },
        decidedAt: { not: null },
      },
      select: { id: true },
    }),
  ]);
  if (!decision) return { person: null, mappingCount: mappings.length };
  return { person, mappingCount: mappings.length };
}

export async function recordContactMatchEvidence(
  db: Prisma.TransactionClient,
  organizationId: string,
  importRowId: string,
  value: Pick<MasterValue, 'phone' | 'email'>,
): Promise<void> {
  const contacts = await db.personContact.findMany({
    where: {
      organizationId,
      OR: [
        ...(value.phone ? [{ type: 'PHONE', normalizedValue: value.phone }] : []),
        ...(value.email ? [{ type: 'EMAIL', normalizedValue: value.email }] : []),
      ],
    },
    select: { personId: true, type: true },
  });
  const matches = new Map<string, Set<string>>();
  for (const contact of contacts) {
    const types = matches.get(contact.personId) ?? new Set<string>();
    types.add(contact.type);
    matches.set(contact.personId, types);
  }
  for (const [candidatePersonId, types] of matches) {
    const existing = await db.personMatchCandidate.findFirst({
      where: { organizationId, importRowId, candidatePersonId },
      select: { id: true },
    });
    if (existing) continue;
    await db.personMatchCandidate.create({
      data: {
        organizationId,
        importRowId,
        candidatePersonId,
        score: types.size === 2 ? 1 : 0.5,
        reasons: jsonObject({
          matchedContactTypes: [...types].sort(),
          rule: 'Contact overlap is evidence only and never merges an imported row automatically',
        }),
      },
    });
  }
}

export async function reviewedCreateNewForRow(
  db: Prisma.TransactionClient,
  organizationId: string,
  importRowId: string,
): Promise<boolean> {
  return Boolean(
    await db.personMatchCandidate.findFirst({
      where: {
        organizationId,
        importRowId,
        candidatePersonId: null,
        decision: 'CREATE_NEW',
        decidedBy: { not: null },
        decidedAt: { not: null },
      },
      select: { id: true },
    }),
  );
}

export const personMappingSourceField = reviewedMappingField;
