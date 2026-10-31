import { Body, Controller, Get, Headers, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { requireVersion } from '../common/http/headers';
import { CurrentAccess, RequirePermission } from '../iam/authorization/decorators';
import {
  CreateAcademicModuleDto,
  CreateCohortDto,
  CreateProgramDto,
  CreateProgramVersionDto,
  ListCatalogDto,
  PublishProgramVersionDto,
  ReasonDto,
  ReplaceCurriculumDto,
  UpdateAcademicModuleDto,
  UpdateCohortDto,
  UpdateProgramDto,
} from './catalog.dto';
import { CatalogService } from './catalog.service';

@ApiTags('academic-catalog')
@Controller({ path: 'programs', version: '1' })
export class ProgramsController {
  constructor(private readonly catalog: CatalogService) {}

  @RequirePermission('academic.catalog.read')
  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() query: ListCatalogDto) {
    return this.catalog.listPrograms(access, query);
  }

  @RequirePermission('academic.catalog.read')
  @Get(':id')
  read(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.catalog.readProgram(access, id);
  }

  @RequirePermission('academic.programs.manage')
  @Post()
  create(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateProgramDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.catalog.createProgram(access, input, correlationId);
  }

  @RequirePermission('academic.programs.manage')
  @Patch(':id')
  update(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: UpdateProgramDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.catalog.updateProgram(access, id, input, requireVersion(ifMatch), correlationId);
  }

  @RequirePermission('academic.programs.manage')
  @Post(':id/versions')
  createVersion(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: CreateProgramVersionDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.catalog.createProgramVersion(access, id, input, correlationId);
  }
}

@ApiTags('academic-catalog')
@Controller({ path: 'program-versions', version: '1' })
export class ProgramVersionsController {
  constructor(private readonly catalog: CatalogService) {}

  @RequirePermission('academic.catalog.read')
  @Get(':id')
  read(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.catalog.readProgramVersion(access, id);
  }

  @RequirePermission('academic.programs.manage')
  @Put(':id/curriculum')
  replaceCurriculum(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: ReplaceCurriculumDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.catalog.replaceCurriculum(
      access,
      id,
      input,
      requireVersion(ifMatch),
      correlationId,
    );
  }

  @RequirePermission('academic.programs.manage')
  @Post(':id/publish')
  publish(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: PublishProgramVersionDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.catalog.publishProgramVersion(
      access,
      id,
      input,
      requireVersion(ifMatch),
      correlationId,
    );
  }

  @RequirePermission('academic.programs.manage')
  @Post(':id/archive')
  archive(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: ReasonDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.catalog.archiveProgramVersion(
      access,
      id,
      input.reason,
      requireVersion(ifMatch),
      correlationId,
    );
  }
}

@ApiTags('academic-catalog')
@Controller({ path: 'modules', version: '1' })
export class ModulesController {
  constructor(private readonly catalog: CatalogService) {}

  @RequirePermission('academic.catalog.read')
  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() query: ListCatalogDto) {
    return this.catalog.listModules(access, query);
  }

  @RequirePermission('academic.programs.manage')
  @Post()
  create(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateAcademicModuleDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.catalog.createModule(access, input, correlationId);
  }

  @RequirePermission('academic.programs.manage')
  @Patch(':id')
  update(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: UpdateAcademicModuleDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.catalog.updateModule(access, id, input, requireVersion(ifMatch), correlationId);
  }
}

@ApiTags('academic-cohorts')
@Controller({ path: 'cohorts', version: '1' })
export class CohortsController {
  constructor(private readonly catalog: CatalogService) {}

  @RequirePermission('academic.catalog.read')
  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() query: ListCatalogDto) {
    return this.catalog.listCohorts(access, query);
  }

  @RequirePermission('academic.catalog.read')
  @Get(':id')
  read(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.catalog.readCohort(access, id);
  }

  @RequirePermission('academic.cohorts.manage')
  @Post()
  create(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateCohortDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.catalog.createCohort(access, input, correlationId);
  }

  @RequirePermission('academic.cohorts.manage')
  @Patch(':id')
  update(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: UpdateCohortDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.catalog.updateCohort(access, id, input, requireVersion(ifMatch), correlationId);
  }

  @RequirePermission('academic.cohorts.manage')
  @Post(':id/:command')
  transition(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Param('command') command: 'plan' | 'activate' | 'complete' | 'cancel',
    @Body() input: ReasonDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.catalog.transitionCohort(
      access,
      id,
      command,
      input.reason,
      requireVersion(ifMatch),
      correlationId,
    );
  }
}
