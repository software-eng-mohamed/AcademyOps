import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { jsonObject, type MasterValue } from './import-values';
export async function saveRowValidation(
  db: Prisma.TransactionClient,
  access: AccessContext,
  batchId: string,
  rowId: string,
  value: object,
  errors: string[],
): Promise<void> {
  const unique = [...new Set(errors)];
  await db.importRow.update({
    where: { id: rowId },
    data: {
      normalizedValues: jsonObject(value),
      disposition: unique.length ? 'QUARANTINED' : 'READY',
    },
  });
  const candidate = value as Partial<MasterValue>;
  for (const code of unique) {
    await db.importIssue.create({
      data: {
        organizationId: access.organizationId,
        batchId,
        importRowId: rowId,
        severity: 'CRITICAL',
        code,
        message: code,
        details:
          code === 'PERSON_IDENTITY_REVIEW_REQUIRED'
            ? jsonObject({
                ruleVersion: 1,
                legacyCode: candidate.legacyCode ?? '',
                cohortCode: candidate.cohortCode ?? '',
                name: candidate.name ?? '',
                phone: candidate.phone ?? '',
                email: candidate.email ?? '',
                rule: 'Never merge people by legacy code; Data Steward decision required',
              })
            : code === 'PAYMENT_DATE_REQUIRED' || code === 'PAYMENT_METHOD_REQUIRED'
              ? jsonObject({
                  ruleVersion: 1,
                  paymentEvidenceIssues: candidate.paymentEvidenceIssues ?? [],
                  rule: 'Never post or infer a legacy payment until both method and date are known',
                })
              : { ruleVersion: 1 },
      },
    });
  }
}
