import * as crm from '@/api/generated/crm/crm';
import * as students from '@/api/generated/students/students';
import { cairoWallTimeToIso } from '@/lib/cairo-time';
import type { AcademyCommandContext } from './command-context';
import { optional } from './command-context';
import { textValue } from './models';

export async function executeLeadStudentCommand(context: AcademyCommandContext): Promise<unknown> {
  const { input, target, values, v, id, request, keyed, reason, requireBranch, enrollmentData } =
    context;
  const { resource, action, row } = target;
  if (resource === 'leads') {
    if (action === 'create')
      return (
        await crm.leadsControllerCreateV1({
          branchId: requireBranch(),
          ...(values.personId
            ? { personId: values.personId }
            : {
                newPerson: {
                  name: v.name.trim(),
                  ...optional(v, ['phone', 'email']),
                  ...(input.confirmedDistinctPersonIds?.length
                    ? { confirmDistinctFromPersonIds: input.confirmedDistinctPersonIds }
                    : {}),
                },
              }),
          ...optional(v, ['stageId', 'source']),
          ...(v.nextActionAt ? { nextActionAt: cairoWallTimeToIso(v.nextActionAt) } : {}),
        })
      ).data;
    if (action === 'edit')
      return (
        await crm.leadsControllerUpdateV1(
          id,
          {
            ...optional(v, ['stageId', 'source']),
            ...(v.nextActionAt ? { nextActionAt: cairoWallTimeToIso(v.nextActionAt) } : {}),
          },
          request,
        )
      ).data;
    if (action === 'assign')
      return (await crm.leadsControllerAssignV1(id, { userId: v.userId }, request)).data;
    if (action === 'claim') return (await crm.leadsControllerClaimV1(id, request)).data;
    if (action === 'open') return (await crm.leadsControllerOpenV1(id, request)).data;
    if (action === 'qualify') return (await crm.leadsControllerQualifyV1(id, request)).data;
    if (action === 'lose') return (await crm.leadsControllerLoseV1(id, reason, request)).data;
    if (action === 'disqualify')
      return (await crm.leadsControllerDisqualifyV1(id, reason, request)).data;
    if (action === 'reopen') return (await crm.leadsControllerReopenV1(id, reason, request)).data;
    if (action === 'win')
      return (
        await crm.leadsControllerWinV1(
          id,
          {
            ...(await enrollmentData()),
            ...(row?.data.personId ? { personId: textValue(row.data.personId) } : {}),
          },
          keyed,
        )
      ).data;
    if (action === 'addActivity') {
      const type = v.type;
      if (!['CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'NOTE'].includes(type))
        throw new Error('Invalid activity type');
      return (
        await crm.leadsControllerAddActivityV1(id, {
          type: type as 'CALL' | 'EMAIL' | 'WHATSAPP' | 'MEETING' | 'NOTE',
          data: { note: v.note.trim() },
          ...(v.occurredAt ? { occurredAt: cairoWallTimeToIso(v.occurredAt) } : {}),
        })
      ).data;
    }
  }
  if (resource === 'students') {
    const details = {
      name: v.name.trim(),
      ...optional(v, ['birthDate']),
      ...(v.gender === 'MALE' || v.gender === 'FEMALE'
        ? { gender: v.gender as 'MALE' | 'FEMALE' }
        : {}),
    };
    if (action === 'create')
      return (
        await students.studentsControllerCreateV1({
          ...details,
          branchId: requireBranch(),
          ...optional(v, ['email', 'phone', 'legacyCode']),
          ...(input.confirmedDistinctPersonIds?.length
            ? { confirmDistinctFromPersonIds: input.confirmedDistinctPersonIds }
            : {}),
        })
      ).data;
    if (action === 'edit')
      return (await students.studentsControllerUpdateV1(id, details, request)).data;
    if (action === 'editContacts')
      return (
        await students.studentsControllerReplaceContactsV1(
          id,
          {
            contacts: input.contacts.map((item) => ({
              type: item.type,
              isPrimary: item.isPrimary,
              value: item.value.trim(),
            })),
          },
          request,
        )
      ).data;
    if (action === 'merge') {
      const mergeTarget = (await students.studentsControllerReadV1(v.targetPersonId)).data;
      return (
        await students.studentsControllerMergeV1(
          id,
          {
            targetPersonId: mergeTarget.id,
            targetVersion: mergeTarget.version,
            reason: reason.reason,
          },
          keyed,
        )
      ).data;
    }
  }
  if (resource === 'registrations') {
    if (action === 'approve')
      return (
        await students.studentRegistrationControllerApproveV1(
          id,
          {
            verificationMethod: 'IN_PERSON_EMAIL_OWNERSHIP',
            verificationReference: v.verificationReference.trim(),
          },
          request,
        )
      ).data;
    if (action === 'reject')
      return (await students.studentRegistrationControllerRejectV1(id, reason, request)).data;
  }
  throw new Error('Unsupported academy command');
}
