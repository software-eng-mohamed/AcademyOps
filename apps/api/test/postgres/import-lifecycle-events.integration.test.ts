import { randomUUID } from 'node:crypto';
import type { AccessContext } from '@academyops/contracts';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ImportLifecycleEventsService } from '../../src/imports/import-lifecycle-events.service';
import { ImportStagingService } from '../../src/imports/import-staging.service';
import { PrismaService } from '../../src/platform/database/prisma.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { createImportWorkbook } from './import-test-workbook';
const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;
const prisma = new PrismaService();
const events = new ImportLifecycleEventsService(new OutboxService());
const staging = new ImportStagingService(prisma, events);
databaseDescribe('import lifecycle outbox atomicity', () => {
  let access: AccessContext;
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: {
        code: `IMPORT-EVENT-${randomUUID()}`,
        name: 'Import Event Test',
      },
    });
    const person = await prisma.person.create({
      data: {
        organizationId: organization.id,
        publicId: `ACT-${randomUUID().slice(0, 20)}`,
        name: 'Importer',
      },
    });
    const actor = await prisma.user.create({
      data: { organizationId: organization.id, personId: person.id, status: 'ACTIVE' },
    });
    access = {
      organizationId: organization.id,
      actorUserId: actor.id,
      grants: new Map(),
      branchIds: new Set(),
      assignedResourceIds: new Set(),
    };
  });
  afterAll(async () => prisma.$disconnect());
  it('emits one sanitized staged event when the upload is replayed', async () => {
    const workbook = createImportWorkbook(`E${randomUUID().slice(0, 8)}`);
    const first = await staging.stage(access, 'contains-private-name.xlsx', workbook);
    const replay = await staging.stage(access, 'different-name.xlsx', workbook);
    expect(first.duplicate).toBe(false);
    expect(replay).toMatchObject({ id: first.id, duplicate: true });
    const stored = await prisma.outboxEvent.findMany({
      where: {
        organizationId: access.organizationId,
        aggregateId: first.id,
        type: 'imports.batch.staged',
      },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.payload).toEqual({
      batchId: first.id,
      status: 'STAGED',
      counts: { rows: first.rowCount },
    });
    expect(JSON.stringify(stored[0]?.payload)).not.toMatch(
      /private|filename|sha256|email|phone|rawValues|normalizedValues|note|error/i,
    );
  });
  it('rolls the durable stage back when enqueueing its event fails', async () => {
    const before = await prisma.importBatch.count({
      where: { organizationId: access.organizationId },
    });
    const failure = new Error('simulated outbox failure');
    const failingEvents = {
      staged: vi.fn().mockRejectedValue(failure),
    } as unknown as ImportLifecycleEventsService;
    const failingStaging = new ImportStagingService(prisma, failingEvents);
    await expect(
      failingStaging.stage(
        access,
        'rollback.xlsx',
        createImportWorkbook(`R${randomUUID().slice(0, 8)}`),
      ),
    ).rejects.toThrow(failure);
    await expect(
      prisma.importBatch.count({ where: { organizationId: access.organizationId } }),
    ).resolves.toBe(before);
  });
});
