import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import type { PrismaService } from '../src/platform/database/prisma.service';

export type ReviewDecision = {
  sheet: string;
  row: number;
  issueCode: string;
  rowHash?: string;
  issueVersion?: number;
  decision: 'CORRECT' | 'EXCLUDE';
  correction?: Record<string, unknown> | string | null;
  notes?: string;
};

export type ReviewFile = {
  $schema?: string;
  schemaVersion?: string;
  workbook?: { sha256?: string };
  issueDecisions?: ReviewDecision[];
};

export function issueKey(rowHash: string, code: string, issueVersion: number): string {
  return `${rowHash.toLowerCase()}|${code}|v${issueVersion}`;
}

export function legacyIssueKey(sheet: string, row: number, code: string): string {
  return `${sheet}:${row}|${code}`;
}

export function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function issueVersion(details: Prisma.JsonValue | null): number {
  return details &&
    typeof details === 'object' &&
    !Array.isArray(details) &&
    typeof details.ruleVersion === 'number'
    ? details.ruleVersion
    : 1;
}

export function assertFingerprint(
  label: string,
  expected: string | undefined,
  actual: string,
): void {
  if (!expected || !/^[a-f0-9]{64}$/i.test(expected) || expected.toLowerCase() !== actual)
    throw new Error(`${label} fingerprint mismatch; refusing to mutate import data.`);
}

export function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(key(value), (counts.get(key(value)) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

export async function accessContext(prisma: PrismaService): Promise<AccessContext> {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { code: 'PLG' } });
  const ownerIdentifier = await prisma.userLoginIdentifier.findFirstOrThrow({
    where: {
      organizationId: organization.id,
      type: 'EMAIL',
      normalizedValue: 'owner@plg.local',
      revokedAt: null,
    },
  });
  const branchIds = new Set(
    (
      await prisma.branch.findMany({
        where: { organizationId: organization.id, isActive: true },
        select: { id: true },
      })
    ).map(({ id }) => id),
  );
  return {
    organizationId: organization.id,
    actorUserId: ownerIdentifier.userId,
    branchIds,
    grants: new Map(),
    assignedResourceIds: new Set(),
    mfaVerifiedAt: new Date().toISOString(),
  } as AccessContext;
}

export async function currentIssues(
  prisma: PrismaService,
  batchId: string,
  organizationId: string,
) {
  const issues = await prisma.importIssue.findMany({
    where: { organizationId, batchId, status: 'OPEN' },
    select: {
      id: true,
      code: true,
      details: true,
      importRowId: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const rowIds = [
    ...new Set(issues.flatMap(({ importRowId }) => (importRowId ? [importRowId] : []))),
  ];
  const rows = await prisma.importRow.findMany({
    where: { organizationId, id: { in: rowIds } },
    select: {
      id: true,
      sheetName: true,
      rowNumber: true,
      rowHash: true,
      disposition: true,
      normalizedValues: true,
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return issues
    .map((issue) => ({
      ...issue,
      importRow: issue.importRowId ? (byId.get(issue.importRowId) ?? null) : null,
    }))
    .sort((left, right) => {
      const sheet = (left.importRow?.sheetName ?? '').localeCompare(
        right.importRow?.sheetName ?? '',
      );
      if (sheet) return sheet;
      const row = (left.importRow?.rowNumber ?? 0) - (right.importRow?.rowNumber ?? 0);
      return row || left.code.localeCompare(right.code);
    });
}
