import * as catalog from '@/api/generated/academic-catalog/academic-catalog';
import type { AcademyCommandContext } from './command-context';

export async function executeCatalogCommand(context: AcademyCommandContext): Promise<unknown> {
  const { target, v, id, request, reason, curriculum } = context;
  const { resource, action } = target;
  if (resource === 'programs') {
    if (action === 'create')
      return (
        await catalog.programsControllerCreateV1({ name: v.name.trim(), code: v.code.trim() })
      ).data;
    if (action === 'edit')
      return (await catalog.programsControllerUpdateV1(id, { name: v.name.trim() }, request)).data;
    if (action === 'archive' || action === 'restore')
      return (
        await catalog.programsControllerUpdateV1(
          id,
          { status: action === 'archive' ? 'ARCHIVED' : 'ACTIVE' },
          request,
        )
      ).data;
    if (action === 'createVersion')
      return (await catalog.programsControllerCreateVersionV1(id, curriculum)).data;
  }
  if (resource === 'versions') {
    if (action === 'replaceCurriculum')
      return (await catalog.programVersionsControllerReplaceCurriculumV1(id, curriculum, request))
        .data;
    if (action === 'publish')
      return (
        await catalog.programVersionsControllerPublishV1(
          id,
          { effectiveFrom: v.effectiveFrom },
          request,
        )
      ).data;
    if (action === 'archive')
      return (await catalog.programVersionsControllerArchiveV1(id, reason, request)).data;
  }
  if (resource === 'modules') {
    if (action === 'create')
      return (await catalog.modulesControllerCreateV1({ code: v.code.trim(), name: v.name.trim() }))
        .data;
    if (action === 'edit')
      return (await catalog.modulesControllerUpdateV1(id, { name: v.name.trim() }, request)).data;
    if (action === 'enable' || action === 'deactivate')
      return (
        await catalog.modulesControllerUpdateV1(id, { isActive: action === 'enable' }, request)
      ).data;
  }
  throw new Error('Unsupported academy command');
}
