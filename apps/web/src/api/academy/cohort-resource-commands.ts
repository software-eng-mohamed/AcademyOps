import * as cohorts from '@/api/generated/academic-cohorts/academic-cohorts';
import * as resources from '@/api/generated/academic-resources/academic-resources';
import * as crm from '@/api/generated/crm/crm';
import type { AcademyCommandContext } from './command-context';
import { numberValue, optional } from './command-context';

export async function executeCohortResourceCommand(
  context: AcademyCommandContext,
): Promise<unknown> {
  const { target, v, id, request, reason, requireBranch } = context;
  const { resource, action } = target;
  if (resource === 'cohorts') {
    if (action === 'create')
      return (
        await cohorts.cohortsControllerCreateV1({
          code: v.code.trim(),
          owningBranchId: requireBranch(),
          programVersionId: v.programVersionId,
          ...optional(v, ['name', 'startsOn', 'endsOn']),
          ...numberValue(v, 'capacity'),
        })
      ).data;
    if (action === 'edit')
      return (
        await cohorts.cohortsControllerUpdateV1(
          id,
          { ...optional(v, ['name', 'startsOn', 'endsOn']), ...numberValue(v, 'capacity') },
          request,
        )
      ).data;
    if (['plan', 'activate', 'complete', 'cancelCohort'].includes(action))
      return (
        await cohorts.cohortsControllerTransitionV1(
          id,
          action === 'cancelCohort' ? 'cancel' : (action as 'plan' | 'activate' | 'complete'),
          reason,
          request,
        )
      ).data;
  }
  if (resource === 'rooms') {
    if (action === 'create')
      return (
        await resources.roomsControllerCreateV1({
          branchId: requireBranch(),
          code: v.code.trim(),
          name: v.name.trim(),
          ...numberValue(v, 'capacity'),
        })
      ).data;
    if (action === 'edit')
      return (
        await resources.roomsControllerUpdateV1(
          id,
          { name: v.name.trim(), ...numberValue(v, 'capacity') },
          request,
        )
      ).data;
    if (action === 'enable' || action === 'deactivate')
      return (
        await resources.roomsControllerUpdateV1(id, { isActive: action === 'enable' }, request)
      ).data;
  }
  if (resource === 'trainers') {
    if (action === 'create') {
      const bio = (v.biography || v.biographyEn || '').trim();
      return (
        await resources.trainersControllerCreateV1({
          name: v.name.trim(),
          ...(bio ? { biographyEn: bio, biographyAr: (v.biographyAr || bio).trim() } : {}),
        })
      ).data;
    }
    if (action === 'edit') {
      const bio = (v.biography || v.biographyEn || '').trim();
      return (
        await resources.trainersControllerUpdateV1(
          id,
          bio ? { biographyEn: bio, biographyAr: (v.biographyAr || bio).trim() } : {},
          request,
        )
      ).data;
    }
    if (action === 'enable' || action === 'deactivate')
      return (
        await resources.trainersControllerUpdateV1(
          id,
          { status: action === 'enable' ? 'ACTIVE' : 'INACTIVE' },
          request,
        )
      ).data;
  }
  if (resource === 'stages') {
    if (action === 'create')
      return (
        await crm.leadStagesControllerCreateV1({
          code: v.code.trim(),
          name: v.name.trim(),
          ordinal: Number(v.ordinal),
        })
      ).data;
    if (action === 'edit')
      return (
        await crm.leadStagesControllerUpdateV1(
          id,
          { name: v.name.trim(), ordinal: Number(v.ordinal) },
          request,
        )
      ).data;
    if (action === 'enable' || action === 'deactivate')
      return (
        await crm.leadStagesControllerUpdateV1(id, { isActive: action === 'enable' }, request)
      ).data;
  }
  throw new Error('Unsupported academy command');
}
