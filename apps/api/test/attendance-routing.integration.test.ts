import { VersioningType, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AccessContext } from '@academyops/contracts';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceController } from '../src/attendance/attendance.controller';
import { AttendanceFinalizeService } from '../src/attendance/attendance-finalize.service';
import { AttendancePolicyService } from '../src/attendance/attendance-policy.service';
import { AttendanceReadService } from '../src/attendance/attendance-read.service';
import { AttendanceService } from '../src/attendance/attendance.service';
import { StableQrScanService } from '../src/attendance/stable-qr-scan.service';
import { IdentifierParamPipe } from '../src/platform/http/identifier-param.pipe';

const access: AccessContext = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  actorUserId: '00000000-0000-4000-8000-000000000002',
  studentPersonId: '00000000-0000-4000-8000-000000000003',
  grants: new Map(),
  branchIds: new Set(),
  assignedResourceIds: new Set(),
};

async function createApp(): Promise<INestApplication> {
  Reflect.defineMetadata(
    'design:paramtypes',
    [
      AttendanceService,
      AttendanceReadService,
      AttendancePolicyService,
      StableQrScanService,
      AttendanceFinalizeService,
    ],
    AttendanceController,
  );
  const module = await Test.createTestingModule({
    controllers: [AttendanceController],
    providers: [
      { provide: AttendanceService, useValue: {} },
      {
        provide: AttendanceReadService,
        useValue: { record: vi.fn(() => ({ route: 'attendance-record' })) },
      },
      { provide: AttendancePolicyService, useValue: {} },
      {
        provide: StableQrScanService,
        useValue: { generateToken: vi.fn(() => 'STABLE:v1:signed-test-token') },
      },
      { provide: AttendanceFinalizeService, useValue: {} },
    ],
  }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(
    (
      request: Request & { accessContext?: AccessContext },
      _response: Response,
      next: NextFunction,
    ) => {
      request.accessContext = access;
      next();
    },
  );
  app.useGlobalPipes(new IdentifierParamPipe());
  await app.listen(0, '127.0.0.1');
  return app;
}

describe('attendance route precedence', () => {
  it('serves the static self-token route before the dynamic record route', async () => {
    const app = await createApp();
    try {
      const base = await app.getUrl();
      const tokenResponse = await fetch(`${base}/api/v1/attendance/self-token`);
      expect(tokenResponse.status).toBe(200);
      expect(await tokenResponse.json()).toEqual({ token: 'STABLE:v1:signed-test-token' });

      const malformedResponse = await fetch(`${base}/api/v1/attendance/not-a-uuid`);
      expect(malformedResponse.status).toBe(400);
      expect(await malformedResponse.json()).toMatchObject({ code: 'INVALID_IDENTIFIER' });

      const recordResponse = await fetch(
        `${base}/api/v1/attendance/00000000-0000-4000-8000-000000000004`,
      );
      expect(recordResponse.status).toBe(200);
      expect(await recordResponse.json()).toEqual({ route: 'attendance-record' });
    } finally {
      await app.close();
    }
  });
});
