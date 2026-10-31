import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  CertificateEligibilityDto,
  CertificateDownloadResultDto,
} from '../common/student-response.dto';
import type { AccessContext } from '@academyops/contracts';
import { requireIdempotencyKey, requireVersion } from '../common/http/headers';
import { CurrentAccess, Public, RequirePermission } from '../iam/authorization/decorators';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator';
import { CertificateReadService } from './certificate-read.service';
import { CertificateRulesService } from './certificate-rules.service';
import { CertificateUploadService, type CertificateUploadFile } from './certificate-upload.service';
import {
  CertificateReasonDto,
  CreateCertificateRuleDto,
  EnrollmentCertificateDto,
  ListCertificateRulesDto,
  ListCertificatesDto,
} from './certificates.dto';
import { CertificatesService } from './certificates.service';

@ApiTags('certificates')
@Controller({ path: 'certificates', version: '1' })
export class CertificatesController {
  constructor(
    private readonly certificates: CertificatesService,
    private readonly reads: CertificateReadService,
    private readonly uploads: CertificateUploadService,
  ) {}

  @RequirePermission('certificates.read')
  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() input: ListCertificatesDto) {
    return this.reads.list(access, input);
  }

  @RequirePermission('certificates.read')
  @Get('enrollments/:id/evaluations')
  evaluations(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.reads.evaluations(access, id);
  }

  @RequirePermission('certificates.read')
  @ApiOkResponse({ type: CertificateEligibilityDto })
  @Get('enrollments/:id/eligibility')
  eligibility(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.reads.checkEligibility(access, id);
  }

  @Public()
  @RateLimit({ name: 'certificates.verify', limit: 120, windowSeconds: 60 })
  @Get('verify/:token')
  verify(@Param('token') token: string) {
    return this.certificates.verify(token);
  }

  @RequirePermission('certificates.read')
  @ApiOkResponse({ type: CertificateDownloadResultDto })
  @Get(':id/download')
  download(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.reads.download(access, id);
  }

  @RequirePermission('certificates.read')
  @Get(':id')
  read(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.reads.read(access, id);
  }

  @RequirePermission('certificates.issue')
  @Post('evaluate')
  evaluate(@CurrentAccess() access: AccessContext, @Body() input: EnrollmentCertificateDto) {
    return this.certificates.evaluate(access, input.enrollmentId);
  }

  @RequirePermission('certificates.issue')
  @Post('issue')
  issue(
    @CurrentAccess() access: AccessContext,
    @Body() input: EnrollmentCertificateDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.certificates.issue(
      access,
      input.enrollmentId,
      requireIdempotencyKey(key),
      correlationId,
    );
  }

  @RequirePermission('certificates.upload')
  @RateLimit({ name: 'certificates.upload', limit: 20, windowSeconds: 60 })
  @Post(':id/file')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { files: 1, fileSize: 10 * 1024 * 1024, fields: 0, parts: 2, headerPairs: 20 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  upload(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @UploadedFile() file: CertificateUploadFile | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.uploads.upload(
      access,
      id,
      requireVersion(ifMatch),
      requireIdempotencyKey(key),
      correlationId,
      file,
    );
  }

  @RequirePermission('certificates.issue')
  @Post(':id/reissue')
  reissue(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: CertificateReasonDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.certificates.reissue(
      access,
      id,
      input.reason,
      requireIdempotencyKey(key),
      correlationId,
    );
  }

  @RequirePermission('certificates.revoke')
  @Post(':id/revoke')
  revoke(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: CertificateReasonDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.certificates.revoke(
      access,
      id,
      input.reason,
      requireVersion(ifMatch),
      requireIdempotencyKey(key),
      correlationId,
    );
  }

  @RequirePermission('certificates.collect')
  @Post(':id/print')
  print(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.certificates.fulfill(
      access,
      id,
      'PRINTED',
      requireVersion(ifMatch),
      requireIdempotencyKey(key),
      correlationId,
    );
  }

  @RequirePermission('certificates.collect')
  @Post(':id/ready')
  ready(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.certificates.fulfill(
      access,
      id,
      'READY_FOR_COLLECTION',
      requireVersion(ifMatch),
      requireIdempotencyKey(key),
      correlationId,
    );
  }

  @RequirePermission('certificates.collect')
  @Post(':id/collect')
  collect(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.certificates.fulfill(
      access,
      id,
      'COLLECTED',
      requireVersion(ifMatch),
      requireIdempotencyKey(key),
      correlationId,
    );
  }
}

@ApiTags('certificate-rules')
@Controller({ path: 'certificate-rules', version: '1' })
export class CertificateRulesController {
  constructor(private readonly rules: CertificateRulesService) {}

  @RequirePermission('certificate_rules.manage')
  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() input: ListCertificateRulesDto) {
    return this.rules.list(access, input);
  }

  @RequirePermission('certificate_rules.manage')
  @Post()
  create(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateCertificateRuleDto,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.rules.create(access, input, requireIdempotencyKey(key), correlationId);
  }
}
