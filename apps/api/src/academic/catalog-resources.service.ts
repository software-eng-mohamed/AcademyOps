import { CatalogResourceSchedules } from './catalog-resource-schedules';
import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { AuditService } from '../platform/audit/audit.service';
import { PrismaService } from '../platform/database/prisma.service';
import { CatalogAccessService } from './catalog-access.service';
import type {
  CreateRoomDto,
  CreateTrainerDto,
  ListCatalogDto,
  UpdateRoomDto,
  UpdateTrainerDto,
} from './catalog.dto';
import {
  catalogConflict,
  catalogNotFound,
  catalogPage,
  catalogVersionConflict,
} from './catalog-helper';
@Injectable()
export class CatalogResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accessPolicy: CatalogAccessService,
  ) {}
  async listRooms(access: AccessContext, input: ListCatalogDto) {
    const scopes = access.grants.get('academic.catalog.read');
    const branchIds = scopes?.has('O') ? undefined : [...access.branchIds];
    const assignmentOnly = this.accessPolicy.assignmentOnly(access);
    const sessionIds = assignmentOnly
      ? await this.accessPolicy.assignedSessionIds(access)
      : undefined;
    const assignedRooms = sessionIds
      ? await this.prisma.session.findMany({
          where: { organizationId: access.organizationId, id: { in: sessionIds } },
          select: { roomId: true },
        })
      : undefined;
    const rooms = await this.prisma.room.findMany({
      where: {
        organizationId: access.organizationId,
        ...(assignmentOnly
          ? { id: { in: assignedRooms?.flatMap(({ roomId }) => (roomId ? [roomId] : [])) ?? [] } }
          : branchIds
            ? { branchId: { in: branchIds } }
            : {}),
        ...(input.branchId ? { branchId: input.branchId } : {}),
        ...(input.search
          ? {
              OR: [
                { code: { contains: input.search, mode: 'insensitive' as const } },
                { name: { contains: input.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { id: 'asc' },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const page = catalogPage(rooms, input.limit);
    return {
      ...page,
      items: await new CatalogResourceSchedules(this.prisma).enrichRooms(
        access.organizationId,
        page.items,
        sessionIds,
      ),
    };
  }
  async createRoom(access: AccessContext, input: CreateRoomDto, correlationId: string) {
    this.accessPolicy.assertBranchManage(access, input.branchId);
    return this.prisma.$transaction(async (transaction) => {
      const branch = await transaction.branch.findFirst({
        where: { id: input.branchId, organizationId: access.organizationId, isActive: true },
      });
      if (!branch) throw catalogNotFound('BRANCH_NOT_FOUND', 'branches.notFound');
      const room = await transaction.room.create({
        data: {
          organizationId: access.organizationId,
          branchId: branch.id,
          code: input.code.trim().toUpperCase(),
          name: input.name.trim(),
          capacity: input.capacity ?? null,
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'room.create',
        entityType: 'Room',
        entityId: room.id,
        correlationId,
        after: { branchId: branch.id, code: room.code },
      });
      return room;
    });
  }
  async updateRoom(
    access: AccessContext,
    id: string,
    input: UpdateRoomDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const room = await transaction.room.findFirst({
        where: { id, organizationId: access.organizationId },
      });
      if (!room) throw catalogNotFound('ROOM_NOT_FOUND', 'academic.roomNotFound');
      this.accessPolicy.assertBranchManage(access, room.branchId);
      if (room.version !== expectedVersion) throw catalogVersionConflict();
      const updated = await transaction.room.update({
        where: { id: room.id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.capacity === undefined ? {} : { capacity: input.capacity }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          version: { increment: 1 },
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'room.update',
        entityType: 'Room',
        entityId: room.id,
        correlationId,
        before: {
          name: room.name,
          capacity: room.capacity,
          isActive: room.isActive,
        },
        after: {
          name: updated.name,
          capacity: updated.capacity,
          isActive: updated.isActive,
        },
      });
      return updated;
    });
  }
  async listTrainers(access: AccessContext, input: ListCatalogDto) {
    const assignmentOnly = this.accessPolicy.assignmentOnly(access);
    const actorTrainerId = assignmentOnly ? await this.accessPolicy.actorTrainerId(access) : null;
    let personIds: string[] | undefined;
    if (input.search) {
      personIds = (
        await this.prisma.person.findMany({
          where: {
            organizationId: access.organizationId,
            OR: [
              { publicId: { contains: input.search, mode: 'insensitive' } },
              { name: { contains: input.search, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
          take: 200,
        })
      ).map(({ id }) => id);
    }
    const trainers = await this.prisma.trainerProfile.findMany({
      where: {
        organizationId: access.organizationId,
        ...(assignmentOnly ? { id: { in: actorTrainerId ? [actorTrainerId] : [] } } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(personIds ? { personId: { in: personIds } } : {}),
      },
      orderBy: { id: 'asc' },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const visible = trainers.slice(0, input.limit);
    const people = await this.prisma.person.findMany({
      where: {
        organizationId: access.organizationId,
        id: { in: visible.map(({ personId }) => personId) },
      },
      select: { id: true, publicId: true, name: true },
    });
    const items = visible.map((trainer) => ({
      ...trainer,
      person: people.find(({ id }) => id === trainer.personId) ?? null,
    }));
    return {
      items: await new CatalogResourceSchedules(this.prisma).enrichTrainers(
        access.organizationId,
        items,
      ),
      nextCursor: trainers.length > input.limit ? (visible.at(-1)?.id ?? null) : null,
    };
  }
  async readTrainer(access: AccessContext, id: string) {
    const scopes = access.grants.get('academic.catalog.read');
    if (scopes?.has('A') && !scopes.has('O') && !scopes.has('B')) {
      if ((await this.accessPolicy.actorTrainerId(access)) !== id)
        throw catalogNotFound('TRAINER_NOT_FOUND', 'academic.trainerNotFound');
    }
    const trainer = await this.prisma.trainerProfile.findFirst({
      where: { id, organizationId: access.organizationId },
    });
    if (!trainer) throw catalogNotFound('TRAINER_NOT_FOUND', 'academic.trainerNotFound');
    const person = await this.prisma.person.findFirst({
      where: { id: trainer.personId, organizationId: access.organizationId },
      select: { id: true, publicId: true, name: true },
    });
    return (
      await new CatalogResourceSchedules(this.prisma).enrichTrainers(access.organizationId, [
        { ...trainer, person },
      ])
    )[0];
  }
  async createTrainer(access: AccessContext, input: CreateTrainerDto, correlationId: string) {
    if (!input.personId && !input.name)
      throw catalogConflict('TRAINER_PERSON_REQUIRED', 'academic.trainerPersonRequired');
    return this.prisma.$transaction(async (transaction) => {
      const person = input.personId
        ? await transaction.person.findFirst({
            where: { id: input.personId, organizationId: access.organizationId },
          })
        : await transaction.person.create({
            data: {
              organizationId: access.organizationId,
              publicId: `TRN-${randomBytes(6).toString('hex').toUpperCase()}`,
              name: input.name?.trim() ?? null,
            },
          });
      if (!person) throw catalogNotFound('PERSON_NOT_FOUND', 'students.notFound');
      const duplicate = await transaction.trainerProfile.findFirst({
        where: { organizationId: access.organizationId, personId: person.id },
      });
      if (duplicate) throw catalogConflict('TRAINER_EXISTS', 'academic.trainerExists');
      const trainer = await transaction.trainerProfile.create({
        data: {
          organizationId: access.organizationId,
          personId: person.id,
          biographyAr: input.biographyAr?.trim() ?? null,
          biographyEn: input.biographyEn?.trim() ?? null,
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'trainer.create',
        entityType: 'TrainerProfile',
        entityId: trainer.id,
        correlationId,
        after: { personId: person.id },
      });
      return { ...trainer, person };
    });
  }
  async updateTrainer(
    access: AccessContext,
    id: string,
    input: UpdateTrainerDto,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const trainer = await transaction.trainerProfile.findFirst({
        where: { id, organizationId: access.organizationId },
      });
      if (!trainer) throw catalogNotFound('TRAINER_NOT_FOUND', 'academic.trainerNotFound');
      if (trainer.version !== expectedVersion) throw catalogVersionConflict();
      const updated = await transaction.trainerProfile.update({
        where: { id: trainer.id },
        data: {
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.biographyAr === undefined ? {} : { biographyAr: input.biographyAr.trim() }),
          ...(input.biographyEn === undefined ? {} : { biographyEn: input.biographyEn.trim() }),
          version: { increment: 1 },
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: 'trainer.update',
        entityType: 'TrainerProfile',
        entityId: trainer.id,
        correlationId,
        before: {
          status: trainer.status,
          biographyAr: trainer.biographyAr,
          biographyEn: trainer.biographyEn,
        },
        after: {
          status: updated.status,
          biographyAr: updated.biographyAr,
          biographyEn: updated.biographyEn,
        },
      });
      return updated;
    });
  }
}
