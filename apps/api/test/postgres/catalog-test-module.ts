import { Test, type TestingModule } from '@nestjs/testing';
import { CatalogAccessService } from '../../src/academic/catalog-access.service';
import { CatalogCalendarService } from '../../src/academic/catalog-calendar.service';
import { CatalogCohortsService } from '../../src/academic/catalog-cohorts.service';
import { CatalogProgramVersionsService } from '../../src/academic/catalog-program-versions.service';
import { CatalogProgramsService } from '../../src/academic/catalog-programs.service';
import { CatalogResourcesService } from '../../src/academic/catalog-resources.service';
import { CatalogService } from '../../src/academic/catalog.service';
import { AuditService } from '../../src/platform/audit/audit.service';
import { PrismaService } from '../../src/platform/database/prisma.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';

export function createCatalogTestModule(prisma: PrismaService): Promise<TestingModule> {
  return Test.createTestingModule({
    providers: [
      { provide: PrismaService, useValue: prisma },
      { provide: AuditService, useValue: new AuditService() },
      { provide: OutboxService, useValue: new OutboxService() },
      {
        provide: CatalogAccessService,
        inject: [PrismaService],
        useFactory: (database: PrismaService) => new CatalogAccessService(database),
      },
      {
        provide: CatalogProgramsService,
        inject: [PrismaService, AuditService],
        useFactory: (database: PrismaService, audit: AuditService) =>
          new CatalogProgramsService(database, audit),
      },
      {
        provide: CatalogProgramVersionsService,
        inject: [PrismaService, AuditService, OutboxService],
        useFactory: (database: PrismaService, audit: AuditService, outbox: OutboxService) =>
          new CatalogProgramVersionsService(database, audit, outbox),
      },
      {
        provide: CatalogCohortsService,
        inject: [PrismaService, AuditService, OutboxService, CatalogAccessService],
        useFactory: (
          database: PrismaService,
          audit: AuditService,
          outbox: OutboxService,
          access: CatalogAccessService,
        ) => new CatalogCohortsService(database, audit, outbox, access),
      },
      {
        provide: CatalogResourcesService,
        inject: [PrismaService, AuditService, CatalogAccessService],
        useFactory: (database: PrismaService, audit: AuditService, access: CatalogAccessService) =>
          new CatalogResourcesService(database, audit, access),
      },
      {
        provide: CatalogCalendarService,
        inject: [PrismaService, CatalogAccessService],
        useFactory: (database: PrismaService, access: CatalogAccessService) =>
          new CatalogCalendarService(database, access),
      },
      {
        provide: CatalogService,
        inject: [
          CatalogProgramsService,
          CatalogProgramVersionsService,
          CatalogCohortsService,
          CatalogResourcesService,
          CatalogCalendarService,
        ],
        useFactory: (
          programs: CatalogProgramsService,
          versions: CatalogProgramVersionsService,
          cohorts: CatalogCohortsService,
          resources: CatalogResourcesService,
          calendar: CatalogCalendarService,
        ) => new CatalogService(programs, versions, cohorts, resources, calendar),
      },
    ],
  }).compile();
}
