import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { CatalogCalendarService } from './catalog-calendar.service';
import { CatalogCohortsService, type CohortCommand } from './catalog-cohorts.service';
import type {
  CalendarQueryDto,
  CreateAcademicModuleDto,
  CreateCohortDto,
  CreateProgramDto,
  CreateProgramVersionDto,
  CreateRoomDto,
  CreateTrainerDto,
  ListCatalogDto,
  PublishProgramVersionDto,
  ReplaceCurriculumDto,
  UpdateAcademicModuleDto,
  UpdateCohortDto,
  UpdateProgramDto,
  UpdateRoomDto,
  UpdateTrainerDto,
} from './catalog.dto';
import { CatalogProgramVersionsService } from './catalog-program-versions.service';
import { CatalogProgramsService } from './catalog-programs.service';
import { CatalogResourcesService } from './catalog-resources.service';

@Injectable()
export class CatalogService {
  constructor(
    private readonly programs: CatalogProgramsService,
    private readonly versions: CatalogProgramVersionsService,
    private readonly cohorts: CatalogCohortsService,
    private readonly resources: CatalogResourcesService,
    private readonly calendar: CatalogCalendarService,
  ) {}

  listPrograms(access: AccessContext, input: ListCatalogDto) {
    return this.programs.listPrograms(access, input);
  }

  readProgram(access: AccessContext, id: string) {
    return this.programs.readProgram(access, id);
  }

  createProgram(access: AccessContext, input: CreateProgramDto, correlationId: string) {
    return this.programs.createProgram(access, input, correlationId);
  }

  updateProgram(
    access: AccessContext,
    id: string,
    input: UpdateProgramDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.programs.updateProgram(access, id, input, expectedVersion, correlationId);
  }

  createProgramVersion(
    access: AccessContext,
    programId: string,
    input: CreateProgramVersionDto,
    correlationId: string,
  ) {
    return this.versions.createProgramVersion(access, programId, input, correlationId);
  }

  readProgramVersion(access: AccessContext, id: string) {
    return this.versions.readProgramVersion(access, id);
  }

  replaceCurriculum(
    access: AccessContext,
    id: string,
    input: ReplaceCurriculumDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.versions.replaceCurriculum(access, id, input, expectedVersion, correlationId);
  }

  publishProgramVersion(
    access: AccessContext,
    id: string,
    input: PublishProgramVersionDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.versions.publishProgramVersion(access, id, input, expectedVersion, correlationId);
  }

  archiveProgramVersion(
    access: AccessContext,
    id: string,
    reason: string,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.versions.archiveProgramVersion(access, id, reason, expectedVersion, correlationId);
  }

  listModules(access: AccessContext, input: ListCatalogDto) {
    return this.programs.listModules(access, input);
  }

  createModule(access: AccessContext, input: CreateAcademicModuleDto, correlationId: string) {
    return this.programs.createModule(access, input, correlationId);
  }

  updateModule(
    access: AccessContext,
    id: string,
    input: UpdateAcademicModuleDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.programs.updateModule(access, id, input, expectedVersion, correlationId);
  }

  listCohorts(access: AccessContext, input: ListCatalogDto) {
    return this.cohorts.listCohorts(access, input);
  }

  readCohort(access: AccessContext, id: string) {
    return this.cohorts.readCohort(access, id);
  }

  createCohort(access: AccessContext, input: CreateCohortDto, correlationId: string) {
    return this.cohorts.createCohort(access, input, correlationId);
  }

  updateCohort(
    access: AccessContext,
    id: string,
    input: UpdateCohortDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.cohorts.updateCohort(access, id, input, expectedVersion, correlationId);
  }

  transitionCohort(
    access: AccessContext,
    id: string,
    command: CohortCommand,
    reason: string,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.cohorts.transitionCohort(
      access,
      id,
      command,
      reason,
      expectedVersion,
      correlationId,
    );
  }

  listRooms(access: AccessContext, input: ListCatalogDto) {
    return this.resources.listRooms(access, input);
  }

  createRoom(access: AccessContext, input: CreateRoomDto, correlationId: string) {
    return this.resources.createRoom(access, input, correlationId);
  }

  updateRoom(
    access: AccessContext,
    id: string,
    input: UpdateRoomDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.resources.updateRoom(access, id, input, expectedVersion, correlationId);
  }

  listTrainers(access: AccessContext, input: ListCatalogDto) {
    return this.resources.listTrainers(access, input);
  }

  readTrainer(access: AccessContext, id: string) {
    return this.resources.readTrainer(access, id);
  }

  createTrainer(access: AccessContext, input: CreateTrainerDto, correlationId: string) {
    return this.resources.createTrainer(access, input, correlationId);
  }

  updateTrainer(
    access: AccessContext,
    id: string,
    input: UpdateTrainerDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.resources.updateTrainer(access, id, input, expectedVersion, correlationId);
  }

  readCalendar(access: AccessContext, input: CalendarQueryDto) {
    return this.calendar.readCalendar(access, input);
  }
}
