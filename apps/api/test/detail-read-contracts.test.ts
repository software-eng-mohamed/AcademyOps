import type { AccessContext } from '@academyops/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogAccessService } from '../src/academic/catalog-access.service';
import { CatalogResourcesService } from '../src/academic/catalog-resources.service';
import type { PrismaService } from '../src/platform/database/prisma.service';
import type { AuditService as AuditWriter } from '../src/platform/audit/audit.service';
import { AuditService } from '../src/platform/audit/audit.service';
const access: AccessContext = {
  actorUserId: 'user-1',
  assignedResourceIds: new Set(),
  branchIds: new Set(),
  grants: new Map(),
  organizationId: 'org-1',
};
describe('stable operational detail reads', () => {
  it('reads a trainer and its allowlisted person identity inside the organization scope', async () => {
    const trainerFindFirst = vi.fn().mockResolvedValue({
      id: 'trainer-1',
      organizationId: 'org-1',
      personId: 'person-1',
      status: 'ACTIVE',
    });
    const personFindFirst = vi.fn().mockResolvedValue({
      id: 'person-1',
      name: 'Trainer One',
      publicId: 'TRN-001',
    });
    const prisma = {
      person: { findFirst: personFindFirst },
      session: { findMany: vi.fn().mockResolvedValue([]) },
      sessionTrainer: { findMany: vi.fn().mockResolvedValue([]) },
      trainerProfile: { findFirst: trainerFindFirst },
    } as unknown as PrismaService;
    const service = new CatalogResourcesService(
      prisma,
      {} as AuditWriter,
      {} as CatalogAccessService,
    );
    await expect(service.readTrainer(access, 'trainer-1')).resolves.toMatchObject({
      id: 'trainer-1',
      person: { publicId: 'TRN-001' },
    });
    expect(trainerFindFirst).toHaveBeenCalledWith({
      where: { id: 'trainer-1', organizationId: 'org-1' },
    });
    expect(personFindFirst).toHaveBeenCalledWith({
      select: { id: true, name: true, publicId: true },
      where: { id: 'person-1', organizationId: 'org-1' },
    });
  });
  it('returns an explicit not-found response instead of leaking a trainer across organizations', async () => {
    const prisma = {
      person: { findFirst: vi.fn() },
      trainerProfile: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new CatalogResourcesService(
      prisma,
      {} as AuditWriter,
      {} as CatalogAccessService,
    );
    await expect(service.readTrainer(access, 'trainer-other-org')).rejects.toMatchObject({
      response: { code: 'TRAINER_NOT_FOUND' },
    });
  });
  it('reads an audit event and its actor without crossing the organization boundary', async () => {
    const auditEventFindFirst = vi.fn().mockResolvedValue({
      action: 'student.update',
      actorUserId: 'actor-1',
      id: 'audit-1',
      organizationId: 'org-1',
    });
    const userFindFirst = vi.fn().mockResolvedValue({ personId: 'person-1' });
    const personFindFirst = vi.fn().mockResolvedValue({
      name: 'Owner',
      publicId: 'PER-001',
    });
    const prisma = {
      auditEvent: { findFirst: auditEventFindFirst },
      person: { findFirst: personFindFirst },
      user: { findFirst: userFindFirst },
    } as unknown as PrismaService;
    const service = new AuditService(prisma);
    await expect(service.read(access, 'audit-1')).resolves.toMatchObject({
      actor: { publicId: 'PER-001' },
      id: 'audit-1',
    });
    expect(auditEventFindFirst).toHaveBeenCalledWith({
      where: { id: 'audit-1', organizationId: 'org-1' },
    });
    expect(userFindFirst).toHaveBeenCalledWith({
      select: { personId: true },
      where: { id: 'actor-1', organizationId: 'org-1' },
    });
    expect(personFindFirst).toHaveBeenCalledWith({
      select: { name: true, publicId: true },
      where: { id: 'person-1', organizationId: 'org-1' },
    });
  });
  it('returns an explicit 404 for a missing audit event in the current organization', async () => {
    const prisma = {
      auditEvent: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new AuditService(prisma);
    await expect(service.read(access, 'missing')).rejects.toMatchObject({
      response: { code: 'AUDIT_EVENT_NOT_FOUND' },
    });
  });
});
