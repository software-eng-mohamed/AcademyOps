import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { StudentCommandService } from './student-command.service';
import { StudentMergeService } from './student-merge.service';
import { Candidate, StudentQueryService } from './student-query.service';
import type {
  CreateStudentDto,
  ListStudentsDto,
  MatchStudentDto,
  MergeStudentDto,
  ReplaceStudentContactsDto,
  UpdateStudentDto,
} from './students.dto';

export type { Candidate };

@Injectable()
export class StudentsService {
  constructor(
    private readonly queryService: StudentQueryService,
    private readonly commandService: StudentCommandService,
    private readonly mergeService: StudentMergeService,
  ) {}

  list(access: AccessContext, input: ListStudentsDto) {
    return this.queryService.list(access, input);
  }

  findCandidates(access: AccessContext, input: MatchStudentDto): Promise<Candidate[]> {
    return this.queryService.findCandidates(access, input);
  }

  create(access: AccessContext, input: CreateStudentDto, correlationId: string) {
    return this.commandService.create(access, input, correlationId);
  }

  read(access: AccessContext, personId: string) {
    return this.queryService.read(access, personId);
  }

  update(
    access: AccessContext,
    personId: string,
    input: UpdateStudentDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.commandService.update(access, personId, input, expectedVersion, correlationId);
  }

  replaceContacts(
    access: AccessContext,
    personId: string,
    input: ReplaceStudentContactsDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.commandService.replaceContacts(
      access,
      personId,
      input,
      expectedVersion,
      correlationId,
    );
  }

  merge(
    access: AccessContext,
    sourcePersonId: string,
    input: MergeStudentDto,
    sourceVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.mergeService.merge(access, sourcePersonId, input, {
      sourceVersion,
      idempotencyKey,
      correlationId,
    });
  }
}
