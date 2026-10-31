import type { AccessContext } from '@academyops/contracts';
import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogCalendarService } from '../src/academic/catalog-calendar.service';
import type { CatalogCohortsService } from '../src/academic/catalog-cohorts.service';
import type { CalendarQueryDto, ListCatalogDto } from '../src/academic/catalog.dto';
import type { CatalogProgramVersionsService } from '../src/academic/catalog-program-versions.service';
import type { CatalogProgramsService } from '../src/academic/catalog-programs.service';
import type { CatalogResourcesService } from '../src/academic/catalog-resources.service';
import { CatalogService } from '../src/academic/catalog.service';

const access: AccessContext = {
  organizationId: 'org-1',
  actorUserId: 'user-1',
  grants: new Map(),
  branchIds: new Set(),
  assignedResourceIds: new Set(),
};
const listInput = { limit: 20 } as ListCatalogDto;
const calendarInput = {
  from: '2026-08-01T00:00:00Z',
  to: '2026-09-01T00:00:00Z',
} as CalendarQueryDto;

describe('CatalogService facade', () => {
  it('preserves the complete public catalog method surface', () => {
    expect(Object.getOwnPropertyNames(CatalogService.prototype)).toEqual([
      'constructor',
      'listPrograms',
      'readProgram',
      'createProgram',
      'updateProgram',
      'createProgramVersion',
      'readProgramVersion',
      'replaceCurriculum',
      'publishProgramVersion',
      'archiveProgramVersion',
      'listModules',
      'createModule',
      'updateModule',
      'listCohorts',
      'readCohort',
      'createCohort',
      'updateCohort',
      'transitionCohort',
      'listRooms',
      'createRoom',
      'updateRoom',
      'listTrainers',
      'readTrainer',
      'createTrainer',
      'updateTrainer',
      'readCalendar',
    ]);
  });

  it('routes each catalog boundary to its injected collaborator', async () => {
    const programsResult = { boundary: 'programs' };
    const versionsResult = { boundary: 'versions' };
    const cohortsResult = { boundary: 'cohorts' };
    const resourcesResult = { boundary: 'resources' };
    const calendarResult = { boundary: 'calendar' };
    const programs = {
      listPrograms: vi.fn().mockResolvedValue(programsResult),
    } as unknown as CatalogProgramsService;
    const versions = {
      readProgramVersion: vi.fn().mockResolvedValue(versionsResult),
    } as unknown as CatalogProgramVersionsService;
    const cohorts = {
      readCohort: vi.fn().mockResolvedValue(cohortsResult),
    } as unknown as CatalogCohortsService;
    const resources = {
      listRooms: vi.fn().mockResolvedValue(resourcesResult),
      readTrainer: vi.fn().mockResolvedValue(resourcesResult),
    } as unknown as CatalogResourcesService;
    const calendar = {
      readCalendar: vi.fn().mockResolvedValue(calendarResult),
    } as unknown as CatalogCalendarService;
    const service = new CatalogService(programs, versions, cohorts, resources, calendar);

    await expect(service.listPrograms(access, listInput)).resolves.toBe(programsResult);
    await expect(service.readProgramVersion(access, 'version-1')).resolves.toBe(versionsResult);
    await expect(service.readCohort(access, 'cohort-1')).resolves.toBe(cohortsResult);
    await expect(service.listRooms(access, listInput)).resolves.toBe(resourcesResult);
    await expect(service.readTrainer(access, 'trainer-1')).resolves.toBe(resourcesResult);
    await expect(service.readCalendar(access, calendarInput)).resolves.toBe(calendarResult);
  });

  it('resolves the facade through the emitted Nest dependency graph', () => {
    const script = `
      require('reflect-metadata');
      const { Test } = require('@nestjs/testing');
      const { CatalogService } = require('./src/academic/catalog.service');
      const { CatalogProgramsService } = require('./src/academic/catalog-programs.service');
      const { CatalogProgramVersionsService } = require('./src/academic/catalog-program-versions.service');
      const { CatalogCohortsService } = require('./src/academic/catalog-cohorts.service');
      const { CatalogResourcesService } = require('./src/academic/catalog-resources.service');
      const { CatalogCalendarService } = require('./src/academic/catalog-calendar.service');
      (async () => {
        const module = await Test.createTestingModule({ providers: [
          CatalogService,
          { provide: CatalogProgramsService, useValue: {} },
          { provide: CatalogProgramVersionsService, useValue: {} },
          { provide: CatalogCohortsService, useValue: {} },
          { provide: CatalogResourcesService, useValue: {} },
          { provide: CatalogCalendarService, useValue: {} },
        ] }).compile();
        console.log(module.get(CatalogService) instanceof CatalogService ? 'catalog-resolved' : 'failed');
        await module.close();
      })().catch((error) => { console.error(error); process.exitCode = 1; });
    `;
    const result = spawnSync(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', '-e', script],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 20_000 },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('catalog-resolved');
  }, 25_000);
});
