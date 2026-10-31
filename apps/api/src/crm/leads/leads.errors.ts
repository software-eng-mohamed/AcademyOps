import { ConflictException, NotFoundException } from '@nestjs/common';

export function notFound() {
  return new NotFoundException({ code: 'LEAD_NOT_FOUND', messageKey: 'leads.notFound' });
}

export function personNotFound() {
  return new NotFoundException({
    code: 'PERSON_NOT_FOUND',
    messageKey: 'students.personNotFound',
  });
}

export function billingNotFound() {
  return new ConflictException({
    code: 'BILLING_ACCOUNT_INVALID',
    messageKey: 'finance.billingAccountInvalid',
  });
}

export function assigneeNotFound() {
  return new NotFoundException({
    code: 'ASSIGNEE_NOT_FOUND',
    messageKey: 'leads.assigneeNotFound',
  });
}

export function versionConflict(): ConflictException {
  return new ConflictException({
    code: 'VERSION_CONFLICT',
    messageKey: 'errors.versionConflict',
  });
}

export function stageConflict() {
  return new ConflictException({
    code: 'LEAD_STAGE_CONFLICT',
    messageKey: 'leads.stageConflict',
  });
}
