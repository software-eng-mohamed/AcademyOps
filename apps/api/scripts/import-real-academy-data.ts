import {
  accessContext,
  assertFingerprint,
  countBy,
  currentIssues,
  issueKey,
  issueVersion,
  legacyIssueKey,
  sha256,
  type ReviewFile,
} from './import-real-academy-review';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { PrismaService } from '../src/platform/database/prisma.service';
import { OutboxService } from '../src/platform/outbox/outbox.service';
import { ImportLifecycleEventsService } from '../src/imports/import-lifecycle-events.service';
import { ImportStagingService } from '../src/imports/import-staging.service';
import { ImportValidationService } from '../src/imports/import-validation.service';
import { ImportArchiveWriter } from '../src/imports/import-archive-writer';
import { ImportQueryService } from '../src/imports/import-query.service';
import { isLegacyImportReviewV3 } from '../src/imports/import-review-schema';
import { ImportCatalogBuilder } from '../src/imports/import-catalog-builder';
import { ImportCatalogWriter } from '../src/imports/import-catalog-writer';
import { ImportFinanceWriter } from '../src/imports/import-finance-writer';
import { ImportStudentWriter } from '../src/imports/import-student-writer';
import { ImportAttendanceWriter } from '../src/imports/import-attendance-writer';
import { ImportFinalizerService } from '../src/imports/import-finalizer.service';
import { IdempotencyService } from '../src/platform/idempotency/idempotency.service';

config({ path: resolve(__dirname, '../../../.env') });

const [
  command,
  workbookPath,
  reviewPath,
  reportPath,
  expectedWorkbookSha256,
  expectedReviewSha256,
] = process.argv.slice(2);
if (!command || !workbookPath || !reviewPath || !reportPath) {
  throw new Error(
    'Usage: ts-node import-real-academy-data.ts <inspect|apply-safe|apply-policy|promote|promote-existing> <workbook.xlsx> <review.json> <report.json> [expected-workbook-sha256] [expected-review-sha256]',
  );
}

const prisma = new PrismaService();
const events = new ImportLifecycleEventsService(new OutboxService());
const staging = new ImportStagingService(prisma, events);
const validation = new ImportValidationService(prisma, new ImportArchiveWriter(), events);
const queries = new ImportQueryService(prisma, events, new ImportArchiveWriter());
const catalog = new ImportCatalogWriter(new ImportCatalogBuilder());
const students = new ImportStudentWriter(catalog, new ImportFinanceWriter());
const attendance = new ImportAttendanceWriter(catalog);
const finalizer = new ImportFinalizerService(
  prisma,
  new IdempotencyService(),
  catalog,
  students,
  attendance,
  queries,
  events,
);

async function main() {
  const workbookBytes = await readFile(resolve(workbookPath));
  const reviewBytes = await readFile(resolve(reviewPath));
  const review = JSON.parse(reviewBytes.toString('utf8')) as ReviewFile;
  const legacyV3 = isLegacyImportReviewV3(review);
  const workbookFingerprint = sha256(workbookBytes);
  const reviewFingerprint = sha256(reviewBytes);
  const mutating = command !== 'inspect';
  if (mutating) {
    assertFingerprint('Workbook', expectedWorkbookSha256, workbookFingerprint);
    assertFingerprint('Review JSON', expectedReviewSha256, reviewFingerprint);
    assertFingerprint('Review-declared workbook', review.workbook?.sha256, workbookFingerprint);
  }
  const decisions = review.issueDecisions ?? [];
  if (mutating && !legacyV3) {
    for (const decision of decisions) {
      if (!/^[a-f0-9]{64}$/i.test(decision.rowHash ?? '') || decision.issueVersion !== 1)
        throw new Error(
          `Decision ${decision.sheet}:${decision.row}|${decision.issueCode} requires an explicit row hash and supported issue version.`,
        );
    }
  }
  if (command === 'apply-policy') {
    const decisionsByRow = new Map<string, Set<string>>();
    for (const decision of decisions) {
      const rowKey = `${decision.sheet}:${decision.row}`;
      const kinds = decisionsByRow.get(rowKey) ?? new Set<string>();
      kinds.add(decision.decision);
      decisionsByRow.set(rowKey, kinds);
      if (
        decision.decision === 'CORRECT' &&
        (!decision.correction ||
          typeof decision.correction !== 'object' ||
          Array.isArray(decision.correction))
      )
        throw new Error(`CORRECT requires structured correction values for ${rowKey}.`);
    }
    if ([...decisionsByRow.values()].some((kinds) => kinds.size > 1))
      throw new Error(
        'A row cannot be both CORRECT and EXCLUDE in the same reviewed decision set.',
      );
  }
  const access = await accessContext(prisma);
  const staged = await staging.stage(access, workbookPath.split(/[\\/]/).at(-1)!, workbookBytes);
  const shouldValidate = ['inspect', 'apply-safe', 'apply-policy', 'promote'].includes(command);
  const validated = shouldValidate ? await validation.validate(access, staged.id) : null;
  const issues = await currentIssues(prisma, staged.id, access.organizationId);
  const currentKeys = new Set(
    issues.map((issue) =>
      legacyV3
        ? legacyIssueKey(issue.importRow!.sheetName, issue.importRow!.rowNumber, issue.code)
        : issueKey(issue.importRow!.rowHash, issue.code, issueVersion(issue.details)),
    ),
  );
  const decisionKeys = new Set(
    decisions.map((decision) =>
      legacyV3
        ? legacyIssueKey(decision.sheet, decision.row, decision.issueCode)
        : issueKey(decision.rowHash ?? '', decision.issueCode, decision.issueVersion ?? 0),
    ),
  );
  const missingFromWorkbook = [...decisionKeys].filter((key) => !currentKeys.has(key)).sort();
  const missingFromReview = [...currentKeys].filter((key) => !decisionKeys.has(key)).sort();
  const currentByRow = new Map<string, Set<string>>();
  for (const issue of issues) {
    const row = issue.importRow!;
    const key = `${row.sheetName}:${row.rowNumber}`;
    const codes = currentByRow.get(key) ?? new Set<string>();
    codes.add(issue.code);
    currentByRow.set(key, codes);
  }
  const reviewedByRow = new Map<string, { codes: Set<string>; decisions: Set<string> }>();
  for (const decision of decisions) {
    const key = `${decision.sheet}:${decision.row}`;
    const entry = reviewedByRow.get(key) ?? {
      codes: new Set<string>(),
      decisions: new Set<string>(),
    };
    entry.codes.add(decision.issueCode);
    entry.decisions.add(decision.decision);
    reviewedByRow.set(key, entry);
  }
  const exactReviewedRows = [...reviewedByRow].filter(([key, reviewRow]) => {
    const current = currentByRow.get(key);
    return (
      current &&
      current.size === reviewRow.codes.size &&
      [...current].every((code) => reviewRow.codes.has(code))
    );
  });

  const report: Record<string, unknown> = {
    command,
    batchId: staged.id,
    staged,
    validated,
    reviewDeclaredSha256: review.workbook?.sha256 ?? null,
    currentSourceSha256: workbookFingerprint,
    reviewSha256: reviewFingerprint,
    reviewSchema: review.schemaVersion ?? review.$schema ?? null,
    decisionBinding: legacyV3 ? 'DERIVED_FROM_EXACT_WORKBOOK_V3' : 'EXPLICIT_ROW_HASH_AND_VERSION',
    derivedBindings: legacyV3
      ? issues
          .filter((issue) =>
            decisionKeys.has(
              legacyIssueKey(issue.importRow!.sheetName, issue.importRow!.rowNumber, issue.code),
            ),
          )
          .map((issue) => ({
            sheet: issue.importRow!.sheetName,
            row: issue.importRow!.rowNumber,
            rowHash: issue.importRow!.rowHash,
            issueCode: issue.code,
            issueVersion: issueVersion(issue.details),
          }))
      : [],
    reviewMatchesCurrentIssues: missingFromWorkbook.length === 0 && missingFromReview.length === 0,
    issueCounts: {
      current: issues.length,
      reviewed: decisions.length,
      currentByCode: countBy(issues, (issue) => issue.code),
      reviewedByCode: countBy(decisions, (decision) => decision.issueCode),
    },
    mismatchCounts: {
      reviewIssuesAbsentFromCurrentWorkbook: missingFromWorkbook.length,
      currentIssuesAbsentFromReview: missingFromReview.length,
    },
    mismatchSamples: {
      reviewIssuesAbsentFromCurrentWorkbook: missingFromWorkbook.slice(0, 50),
      currentIssuesAbsentFromReview: missingFromReview.slice(0, 50),
    },
    reviewDecisionRows: {
      declaredRows: reviewedByRow.size,
      declaredAllExcludeRows: [...reviewedByRow.values()].filter(
        ({ decisions: kinds }) => kinds.size === 1 && kinds.has('EXCLUDE'),
      ).length,
      declaredMixedRows: [...reviewedByRow.values()].filter(
        ({ decisions: kinds }) => kinds.size > 1,
      ).length,
      exactCurrentIssueSetRows: exactReviewedRows.length,
      eligibleAllExcludeRows: exactReviewedRows.filter(
        ([, { decisions: kinds }]) => kinds.size === 1 && kinds.has('EXCLUDE'),
      ).length,
      exactMixedRows: exactReviewedRows.filter(([, { decisions: kinds }]) => kinds.size > 1).length,
      issueSetMismatchRows:
        new Set([...currentByRow.keys(), ...reviewedByRow.keys()]).size - exactReviewedRows.length,
    },
  };

  if (command === 'apply-policy' || command === 'apply-safe') {
    if (missingFromWorkbook.length || missingFromReview.length) {
      throw new Error(
        'Review decisions are not bound to the current row hashes, issue codes and rule versions.',
      );
    }
    const decisionByKey = new Map(
      decisions.map((decision) => [
        legacyV3
          ? legacyIssueKey(decision.sheet, decision.row, decision.issueCode)
          : issueKey(decision.rowHash!, decision.issueCode, decision.issueVersion!),
        decision,
      ]),
    );
    if (decisionByKey.size !== decisions.length)
      throw new Error('Review JSON contains duplicate decisions for the same row and issue.');
    const rowDecisions = new Map<string, Set<string>>();
    for (const issue of issues) {
      if (!issue.importRowId || !issue.importRow) continue;
      const decision = decisionByKey.get(
        legacyV3
          ? legacyIssueKey(issue.importRow.sheetName, issue.importRow.rowNumber, issue.code)
          : issueKey(issue.importRow.rowHash, issue.code, issueVersion(issue.details)),
      );
      if (!decision)
        throw new Error(`Missing decision for ${issue.code} on ${issue.importRow.rowHash}.`);
      const kinds = rowDecisions.get(issue.importRowId) ?? new Set<string>();
      kinds.add(decision.decision);
      rowDecisions.set(issue.importRowId, kinds);
      if (command === 'apply-policy' && decision.decision === 'CORRECT') {
        if (
          !decision.correction ||
          typeof decision.correction !== 'object' ||
          Array.isArray(decision.correction)
        )
          throw new Error(`CORRECT requires structured correction values for ${issue.code}.`);
      } else if (
        !legacyV3 &&
        decision.decision === 'EXCLUDE' &&
        decision.correction !== undefined &&
        decision.correction !== null &&
        decision.correction !== ''
      ) {
        throw new Error(`EXCLUDE must not carry correction values for ${issue.code}.`);
      }
    }
    const mixed = [...rowDecisions].filter(([, decisions]) => decisions.size > 1);
    if (command === 'apply-policy' && mixed.length)
      throw new Error(
        'A row cannot be both CORRECT and EXCLUDE in the same reviewed decision set.',
      );
    const mixedRowIds = new Set(mixed.map(([rowId]) => rowId));
    const actions = {
      excludedIssues: 0,
      correctedIssues: 0,
      skippedCorrections: 0,
      conflictingRows: mixedRowIds.size,
      skippedMixedDecisions: 0,
      eligibleAllExcludeRows: [...rowDecisions].filter(
        ([, kinds]) => kinds.size === 1 && kinds.has('EXCLUDE'),
      ).length,
    };
    for (const issue of issues) {
      const row = issue.importRow!;
      const decision = decisionByKey.get(
        legacyV3
          ? legacyIssueKey(row.sheetName, row.rowNumber, issue.code)
          : issueKey(row.rowHash, issue.code, issueVersion(issue.details)),
      )!;
      if (command === 'apply-safe' && mixedRowIds.has(issue.importRowId!)) {
        actions.skippedMixedDecisions += 1;
        continue;
      }
      if (command === 'apply-safe' && decision.decision === 'CORRECT') {
        actions.skippedCorrections += 1;
        continue;
      }
      await queries.resolveIssue(access, staged.id, issue.id, {
        schemaVersion: 'plg-import-correction/v1',
        decision: decision.decision,
        expectedRowHash: row.rowHash,
        expectedIssueCode: issue.code,
        expectedIssueVersion: issueVersion(issue.details) as 1,
        ...(decision.decision === 'CORRECT'
          ? { correction: decision.correction as Record<string, unknown> }
          : {}),
        note:
          [
            decision.notes?.trim(),
            typeof decision.correction === 'string' ? decision.correction.trim() : '',
          ]
            .filter(Boolean)
            .join(' — ') ||
          `Data Steward decision bound to review ${reviewFingerprint.slice(0, 16)}.`,
      });
      if (decision.decision === 'EXCLUDE') actions.excludedIssues += 1;
      else actions.correctedIssues += 1;
    }
    report.policyActions = actions;
    report.postPolicy = await queries.getBatch(access, staged.id);
  } else if (command === 'promote' || command === 'promote-existing') {
    const promoted = await finalizer.promote(
      access,
      staged.id,
      `real-data-promote-${randomUUID()}`,
    );
    const reconciliation = await queries.reconcile(access, staged.id);
    report.promoted = promoted;
    report.reconciliation = reconciliation;
    report.detail = await queries.getBatch(access, staged.id);
  } else if (command !== 'inspect') {
    throw new Error(`Unsupported command: ${command}`);
  }

  await writeFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${JSON.stringify(
      {
        command,
        batchId: staged.id,
        sourceSha256: staged.sha256,
        reviewMatchesCurrentIssues: report.reviewMatchesCurrentIssues,
        issueCounts: report.issueCounts,
        mismatchCounts: report.mismatchCounts,
        safeReviewActions: report.safeReviewActions ?? null,
        policyActions: report.policyActions ?? null,
        promoted: report.promoted ?? null,
        reconciliation: report.reconciliation ?? null,
        reportPath: resolve(reportPath),
      },
      null,
      2,
    )}\n`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
