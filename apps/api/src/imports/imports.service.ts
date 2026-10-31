import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { ImportFinalizerService } from './import-finalizer.service';
import { ImportQueryService } from './import-query.service';
import { ImportStagingService } from './import-staging.service';
import { ImportValidationService } from './import-validation.service';
import type {
  ListImportBatchesDto,
  ListImportIssuesDto,
  ResolveImportIssueDto,
} from './imports.dto';
import { ImportQuarantineService } from './import-quarantine.service';

@Injectable()
export class ImportsService {
  constructor(
    private readonly staging: ImportStagingService,
    private readonly validation: ImportValidationService,
    private readonly finalizer: ImportFinalizerService,
    private readonly queries: ImportQueryService,
    private readonly quarantine: ImportQuarantineService,
  ) {}

  stage(access: AccessContext, originalName: string, buffer: Buffer) {
    return this.staging.stage(access, originalName, buffer);
  }

  validate(access: AccessContext, batchId: string) {
    return this.validation.validate(access, batchId);
  }

  reconcile(access: AccessContext, batchId: string) {
    return this.queries.reconcile(access, batchId);
  }

  finalize(access: AccessContext, batchId: string, idempotencyKey: string) {
    return this.finalizer.finalize(access, batchId, idempotencyKey);
  }

  promote(access: AccessContext, batchId: string, idempotencyKey: string) {
    return this.finalizer.promote(access, batchId, idempotencyKey);
  }

  archiveQuarantined(access: AccessContext, batchId: string, idempotencyKey: string, note: string) {
    return this.quarantine.archive(access, batchId, idempotencyKey, note);
  }

  listBatches(access: AccessContext, query: ListImportBatchesDto) {
    return this.queries.listBatches(access, query);
  }

  getBatch(access: AccessContext, batchId: string) {
    return this.queries.getBatch(access, batchId);
  }

  listIssues(access: AccessContext, batchId: string, query: ListImportIssuesDto) {
    return this.queries.listIssues(access, batchId, query);
  }

  resolveIssue(
    access: AccessContext,
    batchId: string,
    issueId: string,
    body: ResolveImportIssueDto,
  ) {
    return this.queries.resolveIssue(access, batchId, issueId, body);
  }
}
