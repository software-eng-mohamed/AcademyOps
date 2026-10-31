import { ConflictException, Injectable } from '@nestjs/common';
import type { AccessContext, LeadCommand, LeadState } from '@academyops/contracts';
import { DomainTransitionError, transitionLead } from '@academyops/contracts';
import { PrismaService } from '../../platform/database/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { LeadAccessService } from './lead-access.service';
import { notFound, versionConflict } from './leads.errors';

type MutationMeta = { correlationId: string; expectedVersion: number };

@Injectable()
export class LeadTransitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly access: LeadAccessService,
  ) {}

  async transition(
    access: AccessContext,
    leadId: string,
    command: Exclude<LeadCommand, 'win'>,
    reason: string | undefined,
    meta: MutationMeta,
  ): Promise<{ id: string; state: LeadState; version: number }> {
    return this.prisma.$transaction(async (transaction) => {
      const lead = await transaction.lead.findFirst({
        where: { id: leadId, organizationId: access.organizationId },
      });
      if (!lead) throw notFound();
      this.access.assertLeadScope(access, lead, 'leads.update');
      const next = this.nextState(lead.state, command);
      const updated = await transaction.lead.updateMany({
        where: {
          id: lead.id,
          organizationId: access.organizationId,
          version: meta.expectedVersion,
        },
        data: {
          state: next,
          version: { increment: 1 },
          lostReason: ['lose', 'disqualify'].includes(command) ? (reason ?? null) : null,
        },
      });
      if (updated.count !== 1) throw versionConflict();
      await transaction.leadStatusHistory.create({
        data: {
          organizationId: access.organizationId,
          leadId: lead.id,
          fromState: lead.state,
          toState: next,
          reason: reason ?? null,
          actorUserId: access.actorUserId,
        },
      });
      await this.audit.write(transaction, {
        organizationId: access.organizationId,
        actorUserId: access.actorUserId,
        action: `lead.${command}`,
        entityType: 'Lead',
        entityId: lead.id,
        correlationId: meta.correlationId,
        before: { state: lead.state, version: lead.version },
        after: { state: next, version: lead.version + 1 },
      });
      await this.outbox.add(transaction, {
        organizationId: access.organizationId,
        aggregateType: 'Lead',
        aggregateId: lead.id,
        type: `lead.${this.commandEventName(command)}`,
        payload: { leadId: lead.id, state: next },
      });
      return { id: lead.id, state: next, version: lead.version + 1 };
    });
  }

  nextState(state: string, command: LeadCommand): LeadState {
    try {
      return transitionLead(state as LeadState, command);
    } catch (error) {
      if (error instanceof DomainTransitionError)
        throw new ConflictException({
          code: 'LEAD_TRANSITION_INVALID',
          messageKey: 'leads.transitionInvalid',
        });
      throw error;
    }
  }

  private commandEventName(command: Exclude<LeadCommand, 'win'>): string {
    return {
      open: 'opened',
      qualify: 'qualified',
      lose: 'lost',
      disqualify: 'disqualified',
      reopen: 'reopened',
    }[command];
  }
}
