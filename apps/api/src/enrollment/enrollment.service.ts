import { Injectable } from '@nestjs/common';
import type { AccessContext, EnrollmentCommand, EnrollmentState } from '@academyops/contracts';
import { EnrollmentQueryService } from './enrollment-query.service';
import { EnrollmentCreateService } from './enrollment-create.service';
import { EnrollmentTransitionService } from './enrollment-transition.service';
import { EnrollmentCohortService } from './enrollment-cohort.service';
import {
  EnrollmentCancellationService,
  CancellationRequestMeta,
  IdempotentMeta,
} from './enrollment-cancellation.service';
import { EnrollmentRetakeService } from './enrollment-retake.service';
import type {
  CreateEnrollmentDto,
  CreateModuleRetakeDto,
  ListEnrollmentsDto,
} from './enrollment.dto';
import type { MutationMeta } from './enrollment-event.service';

@Injectable()
export class EnrollmentService {
  constructor(
    private readonly queryService: EnrollmentQueryService,
    private readonly createService: EnrollmentCreateService,
    private readonly transitionService: EnrollmentTransitionService,
    private readonly cohortService: EnrollmentCohortService,
    private readonly cancellationService: EnrollmentCancellationService,
    private readonly retakeService: EnrollmentRetakeService,
  ) {}

  async list(access: AccessContext, input: ListEnrollmentsDto) {
    return this.queryService.list(access, input);
  }

  async read(access: AccessContext, enrollmentId: string) {
    return this.queryService.read(access, enrollmentId);
  }

  async create(access: AccessContext, input: CreateEnrollmentDto, correlationId: string) {
    return this.createService.create(access, input, correlationId);
  }

  async transition(
    access: AccessContext,
    enrollmentId: string,
    command: Exclude<EnrollmentCommand, 'activate'>,
    meta: MutationMeta,
  ): Promise<{ id: string; state: EnrollmentState; version: number }> {
    return this.transitionService.transition(access, enrollmentId, command, meta);
  }

  async activate(
    access: AccessContext,
    enrollmentId: string,
    meta: MutationMeta,
  ): Promise<{ id: string; state: 'ACTIVE'; version: number }> {
    return this.transitionService.activate(access, enrollmentId, meta);
  }

  async transfer(
    access: AccessContext,
    enrollmentId: string,
    targetCohortId: string,
    meta: MutationMeta,
  ): Promise<{ id: string; cohortId: string; version: number }> {
    return this.cohortService.transfer(access, enrollmentId, targetCohortId, meta);
  }

  async requestCancellation(
    access: AccessContext,
    enrollmentId: string,
    meta: CancellationRequestMeta,
  ) {
    return this.cancellationService.requestCancellation(access, enrollmentId, meta);
  }

  async decideCancellation(
    access: AccessContext,
    requestId: string,
    decision: 'APPROVED' | 'REJECTED',
    decisionReason: string,
    meta: IdempotentMeta,
  ) {
    return this.cancellationService.decideCancellation(
      access,
      requestId,
      decision,
      decisionReason,
      meta,
    );
  }

  async requestRetake(
    access: AccessContext,
    enrollmentId: string,
    input: CreateModuleRetakeDto,
    correlationId: string,
  ) {
    return this.retakeService.requestRetake(access, enrollmentId, input, correlationId);
  }

  async decideRetake(
    access: AccessContext,
    retakeId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason: string,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.retakeService.decideRetake(
      access,
      retakeId,
      decision,
      reason,
      expectedVersion,
      correlationId,
    );
  }
}
