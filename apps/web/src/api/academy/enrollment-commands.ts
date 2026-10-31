import * as enrollments from '@/api/generated/enrollment/enrollment';
import type { AcademyCommandContext } from './command-context';
import { optional } from './command-context';

export async function executeEnrollmentCommand(context: AcademyCommandContext): Promise<unknown> {
  const { target, v, id, request, keyed, reason, idempotencyKey, enrollmentData } = context;
  const { action } = target;
  if (action === 'create')
    return (
      await enrollments.enrollmentControllerCreateV1({
        studentPersonId: v.studentPersonId,
        ...(await enrollmentData()),
      })
    ).data;
  if (action === 'submit')
    return (await enrollments.enrollmentControllerSubmitV1(id, request)).data;
  if (action === 'activate')
    return (await enrollments.enrollmentControllerActivateV1(id, optional(v, ['note']), request))
      .data;
  if (action === 'reject')
    return (await enrollments.enrollmentControllerRejectV1(id, reason, request)).data;
  if (action === 'transfer')
    return (
      await enrollments.enrollmentControllerTransferV1(
        id,
        { ...reason, targetCohortId: v.targetCohortId },
        request,
      )
    ).data;
  if (action === 'postpone')
    return (await enrollments.enrollmentControllerPostponeV1(id, reason, request)).data;
  if (action === 'resume')
    return (await enrollments.enrollmentControllerResumeV1(id, reason, request)).data;
  if (action === 'complete')
    return (await enrollments.enrollmentControllerCompleteV1(id, reason, request)).data;
  if (action === 'requestCancellation')
    return (await enrollments.enrollmentControllerRequestCancellationV1(id, reason, keyed)).data;
  if (action === 'approveCancellation')
    return (
      await enrollments.enrollmentCancellationControllerApproveV1(id, reason, { idempotencyKey })
    ).data;
  if (action === 'rejectCancellation')
    return (
      await enrollments.enrollmentCancellationControllerRejectV1(id, reason, { idempotencyKey })
    ).data;
  if (action === 'retake')
    return (
      await enrollments.enrollmentControllerRequestRetakeV1(id, {
        ...reason,
        programVersionModuleId: v.programVersionModuleId,
        ...optional(v, ['targetCohortModuleId']),
      })
    ).data;
  if (action === 'approveRetake')
    return (await enrollments.moduleRetakesControllerApproveV1(id, reason, request)).data;
  if (action === 'rejectRetake')
    return (await enrollments.moduleRetakesControllerRejectV1(id, reason, request)).data;
  throw new Error('Unsupported academy command');
}
