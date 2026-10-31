import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import { AcademicController } from './academic.controller';
import { AcademicSessionLifecycleService } from './academic-session-lifecycle.service';
import { AcademicSessionMutationService } from './academic-session-mutation.service';
import { AcademicService } from './academic.service';
import {
  CohortsController,
  ModulesController,
  ProgramsController,
  ProgramVersionsController,
} from './catalog.controller';
import {
  CalendarController,
  RoomsController,
  TrainersController,
} from './catalog-resource.controller';
import { CatalogAccessService } from './catalog-access.service';
import { CatalogCalendarService } from './catalog-calendar.service';
import { CatalogCohortsService } from './catalog-cohorts.service';
import { CatalogProgramVersionsService } from './catalog-program-versions.service';
import { CatalogProgramsService } from './catalog-programs.service';
import { CatalogResourcesService } from './catalog-resources.service';
import { CatalogService } from './catalog.service';
import { SessionSchedulePolicyService } from './session-schedule-policy.service';

@Module({
  imports: [PlatformModule],
  controllers: [
    AcademicController,
    ProgramsController,
    ProgramVersionsController,
    ModulesController,
    CohortsController,
    RoomsController,
    TrainersController,
    CalendarController,
  ],
  providers: [
    AcademicService,
    AcademicSessionMutationService,
    AcademicSessionLifecycleService,
    SessionSchedulePolicyService,
    CatalogAccessService,
    CatalogCalendarService,
    CatalogCohortsService,
    CatalogProgramVersionsService,
    CatalogProgramsService,
    CatalogResourcesService,
    CatalogService,
  ],
  exports: [AcademicService, CatalogAccessService],
})
export class AcademicModule {}
