import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import {
  IMPORT_CORRECTION_SCHEMA,
  IMPORT_ISSUE_RULE_VERSION,
  type PersonMappingCorrection,
} from './import-correction-validation';
import type { ResolveImportIssueDto } from './imports.dto';
import { jsonObject } from './import-values';

export function assertCorrectionEnvelope(
  issue: { code: string; details: Prisma.JsonValue | null },
  row: { rowHash: string },
  body: ResolveImportIssueDto,
): void {
  if (body.schemaVersion !== IMPORT_CORRECTION_SCHEMA) throw invalidCorrection('schemaVersion');
  if (body.expectedRowHash.toLowerCase() !== row.rowHash.toLowerCase())
    throw new ConflictException({
      code: 'IMPORT_ROW_FINGERPRINT_MISMATCH',
      messageKey: 'imports.rowFingerprintMismatch',
    });
  if (body.expectedIssueCode !== issue.code)
    throw new ConflictException({
      code: 'IMPORT_ISSUE_FINGERPRINT_MISMATCH',
      messageKey: 'imports.issueFingerprintMismatch',
    });
  if (body.expectedIssueVersion !== issueVersion(issue.details))
    throw new ConflictException({
      code: 'IMPORT_ISSUE_VERSION_MISMATCH',
      messageKey: 'imports.issueVersionMismatch',
    });
}

export function issueVersion(details: Prisma.JsonValue | null): number {
  if (!details || typeof details !== 'object' || Array.isArray(details))
    return IMPORT_ISSUE_RULE_VERSION;
  return typeof details.ruleVersion === 'number' ? details.ruleVersion : IMPORT_ISSUE_RULE_VERSION;
}

export function changedFields(
  before: Prisma.JsonValue | null,
  after: Prisma.JsonValue | null,
): string[] {
  const left = before && typeof before === 'object' && !Array.isArray(before) ? before : {};
  const right = after && typeof after === 'object' && !Array.isArray(after) ? after : {};
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]))
    .sort();
}

export async function savePersonMapping(
  transaction: Prisma.TransactionClient,
  access: AccessContext,
  row: { id: string; rowHash: string },
  issueCode: string,
  correction: PersonMappingCorrection,
): Promise<void> {
  if (correction.action === 'MATCH_EXISTING') {
    const [person, candidate] = await Promise.all([
      transaction.person.findFirst({
        where: { id: correction.personId, organizationId: access.organizationId },
        select: { id: true },
      }),
      transaction.personMatchCandidate.findFirst({
        where: {
          organizationId: access.organizationId,
          importRowId: row.id,
          candidatePersonId: correction.personId,
        },
        select: { id: true },
      }),
    ]);
    if (!person || !candidate)
      throw invalidCorrection('correction.personId', 'Person is not a candidate for this row');
    await transaction.legacyReference.create({
      data: {
        organizationId: access.organizationId,
        importRowId: row.id,
        entityType: 'PERSON',
        entityId: person.id,
        sourceField: 'REVIEWED_PERSON_MAPPING',
        rawValue: JSON.stringify({ rowHash: row.rowHash, issueCode }),
      },
    });
    await transaction.personMatchCandidate.update({
      where: { id: candidate.id },
      data: { decision: 'MATCHED', decidedBy: access.actorUserId, decidedAt: new Date() },
    });
    return;
  }
  const candidate = await transaction.personMatchCandidate.findFirst({
    where: {
      organizationId: access.organizationId,
      importRowId: row.id,
      candidatePersonId: null,
    },
    select: { id: true },
  });
  const decision = {
    decision: 'CREATE_NEW',
    decidedBy: access.actorUserId,
    decidedAt: new Date(),
    reasons: jsonObject({ rowHash: row.rowHash, issueCode, reviewed: true }),
  };
  if (candidate) {
    await transaction.personMatchCandidate.update({
      where: { id: candidate.id },
      data: decision,
    });
  } else {
    await transaction.personMatchCandidate.create({
      data: {
        organizationId: access.organizationId,
        importRowId: row.id,
        candidatePersonId: null,
        score: 0,
        ...decision,
      },
    });
  }
}

export function invalidCorrection(field: string, reason?: string): BadRequestException {
  return new BadRequestException({
    code: 'IMPORT_CORRECTION_INVALID',
    messageKey: 'imports.correctionInvalid',
    field,
    ...(reason ? { reason } : {}),
  });
}
