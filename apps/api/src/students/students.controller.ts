import { Body, Controller, Get, Headers, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { requireIdempotencyKey, requireVersion } from '../common/http/headers';
import { CurrentAccess, RequirePermission } from '../iam/authorization/decorators';
import {
  CreateStudentDto,
  ListStudentsDto,
  MatchStudentDto,
  MergeStudentDto,
  ReplaceStudentContactsDto,
  UpdateStudentDto,
} from './students.dto';
import { StudentsService } from './students.service';

@ApiTags('students')
@Controller({ path: 'students', version: '1' })
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @RequirePermission('students.read_basic')
  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() query: ListStudentsDto) {
    return this.students.list(access, query);
  }

  @RequirePermission('students.read_basic')
  @Get(':id')
  read(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.students.read(access, id);
  }

  @RequirePermission('students.create')
  @Post('match-candidates')
  match(@CurrentAccess() access: AccessContext, @Body() input: MatchStudentDto) {
    return this.students.findCandidates(access, input);
  }

  @RequirePermission('students.create')
  @Post()
  create(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateStudentDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.students.create(access, input, correlationId);
  }

  @RequirePermission('students.merge')
  @Post(':id/merge')
  merge(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: MergeStudentDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.students.merge(
      access,
      id,
      input,
      requireVersion(ifMatch),
      requireIdempotencyKey(idempotencyKey),
      correlationId,
    );
  }

  @RequirePermission('students.update')
  @Patch(':id')
  update(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: UpdateStudentDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.students.update(access, id, input, requireVersion(ifMatch), correlationId);
  }

  @RequirePermission('students.update')
  @Put(':id/contacts')
  replaceContacts(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: ReplaceStudentContactsDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.students.replaceContacts(access, id, input, requireVersion(ifMatch), correlationId);
  }
}
