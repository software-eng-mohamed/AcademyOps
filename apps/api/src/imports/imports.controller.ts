import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { CurrentAccess, RequirePermission } from '../iam/authorization/decorators';
import { requireIdempotencyKey } from '../common/http/headers';
import { ImportsService } from './imports.service';
import { LegacyArchiveService } from './legacy-archive.service';
import {
  ArchiveQuarantinedRowsDto,
  ListImportBatchesDto,
  ListImportIssuesDto,
  ListLegacyArchiveDto,
  ResolveImportIssueDto,
} from './imports.dto';

@ApiTags('imports')
@Controller({ path: 'imports/batches', version: '1' })
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @RequirePermission('imports.preview')
  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() query: ListImportBatchesDto) {
    return this.imports.listBatches(access, query);
  }

  @RequirePermission('imports.execute')
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 0, parts: 2, headerPairs: 20 },
    }),
  )
  stage(
    @CurrentAccess() access: AccessContext,
    @UploadedFile() file: { originalname: string; buffer: Buffer },
  ) {
    return this.imports.stage(access, file.originalname, file.buffer);
  }

  @RequirePermission('imports.preview')
  @Get(':id')
  detail(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.imports.getBatch(access, id);
  }

  @RequirePermission('imports.preview')
  @Get(':id/issues')
  issues(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Query() query: ListImportIssuesDto,
  ) {
    return this.imports.listIssues(access, id, query);
  }

  @RequirePermission('imports.finalize')
  @Patch(':id/issues/:issueId')
  resolveIssue(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Param('issueId') issueId: string,
    @Body() body: ResolveImportIssueDto,
  ) {
    return this.imports.resolveIssue(access, id, issueId, body);
  }

  @RequirePermission('imports.finalize')
  @Post(':id/archive-quarantined')
  archiveQuarantined(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: ArchiveQuarantinedRowsDto,
  ) {
    return this.imports.archiveQuarantined(access, id, requireIdempotencyKey(key), body.note);
  }

  @RequirePermission('imports.preview')
  @Post(':id/validate')
  validate(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.imports.validate(access, id);
  }

  @RequirePermission('imports.preview')
  @Post(':id/reconcile')
  reconcile(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.imports.reconcile(access, id);
  }

  @RequirePermission('imports.finalize')
  @Post(':id/promote-ready')
  promote(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.imports.promote(access, id, requireIdempotencyKey(key));
  }

  @RequirePermission('imports.finalize')
  @Post(':id/finalize')
  finalize(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.imports.finalize(access, id, requireIdempotencyKey(key));
  }
}

@ApiTags('imports')
@Controller({ path: 'legacy-archive', version: '1' })
export class LegacyArchiveController {
  constructor(private readonly archive: LegacyArchiveService) {}

  @RequirePermission('legacy_archive.read')
  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() query: ListLegacyArchiveDto) {
    return this.archive.list(access, query);
  }

  @RequirePermission('legacy_archive.read')
  @Get(':id')
  read(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.archive.read(access, id);
  }
}
