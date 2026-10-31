import { describe, it, expect, vi } from 'vitest';
import type { AccessContext } from '@academyops/contracts';
import { PricingService } from '../src/finance/pricing/pricing.service';
import type { PricingReadService } from '../src/finance/pricing/pricing-read.service';
import type { PricingAgreementService } from '../src/finance/pricing/pricing-agreement.service';
import type { PricingApprovalService } from '../src/finance/pricing/pricing-approval.service';
import type { PricingScheduleService } from '../src/finance/pricing/pricing-schedule.service';
import type {
  CreateInstallmentScheduleDto,
  CreatePricingAgreementDto,
  ListPricingAgreementsDto,
  UpdateInstallmentScheduleDto,
  UpdatePricingAgreementDto,
} from '../src/finance/pricing/pricing.dto';

function createMockFacade(overrides: {
  readService?: Partial<PricingReadService>;
  agreementService?: Partial<PricingAgreementService>;
  approvalService?: Partial<PricingApprovalService>;
  scheduleService?: Partial<PricingScheduleService>;
}): PricingService {
  return new PricingService(
    (overrides.readService ?? {}) as PricingReadService,
    (overrides.agreementService ?? {}) as PricingAgreementService,
    (overrides.approvalService ?? {}) as PricingApprovalService,
    (overrides.scheduleService ?? {}) as PricingScheduleService,
  );
}

describe('PricingService Facade Decomposition', () => {
  const access: AccessContext = {
    organizationId: 'org-id',
    actorUserId: 'actor-id',
    permissions: [],
  };

  it('delegates list to PricingReadService', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const facade = createMockFacade({ readService: { list } });
    const input: ListPricingAgreementsDto = { limit: 10 };
    const result = await facade.list(access, input);

    expect(list).toHaveBeenCalledWith(access, input);
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('delegates read to PricingReadService', async () => {
    const read = vi.fn().mockResolvedValue({ id: 'agreement-id' });
    const facade = createMockFacade({ readService: { read } });
    const result = await facade.read(access, 'agreement-id');

    expect(read).toHaveBeenCalledWith(access, 'agreement-id');
    expect(result).toEqual({ id: 'agreement-id' });
  });

  it('delegates create to PricingAgreementService', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'agreement-id' });
    const facade = createMockFacade({ agreementService: { create } });
    const input: CreatePricingAgreementDto = {
      enrollmentId: 'enrollment-id',
      lines: [],
      discountAmount: '0.00',
    };
    const result = await facade.create(access, input, 'idem-key', 'corr-id');

    expect(create).toHaveBeenCalledWith(access, input, 'idem-key', 'corr-id');
    expect(result).toEqual({ id: 'agreement-id' });
  });

  it('delegates update to PricingAgreementService', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'agreement-id' });
    const facade = createMockFacade({ agreementService: { update } });
    const input: UpdatePricingAgreementDto = { lines: [], discountAmount: '0.00' };
    const result = await facade.update(access, 'agreement-id', input, 1, 'idem-key', 'corr-id');

    expect(update).toHaveBeenCalledWith(access, 'agreement-id', input, 1, 'idem-key', 'corr-id');
    expect(result).toEqual({ id: 'agreement-id' });
  });

  it('delegates submit to PricingAgreementService', async () => {
    const submit = vi.fn().mockResolvedValue({ id: 'agreement-id' });
    const facade = createMockFacade({ agreementService: { submit } });
    const result = await facade.submit(access, 'agreement-id', 1, 'idem-key', 'corr-id');

    expect(submit).toHaveBeenCalledWith(access, 'agreement-id', 1, 'idem-key', 'corr-id');
    expect(result).toEqual({ id: 'agreement-id' });
  });

  it('delegates approve to PricingApprovalService', async () => {
    const approve = vi.fn().mockResolvedValue({ id: 'agreement-id' });
    const facade = createMockFacade({ approvalService: { approve } });
    const result = await facade.approve(access, 'agreement-id', 'reason', 1, 'idem-key', 'corr-id');

    expect(approve).toHaveBeenCalledWith(
      access,
      'agreement-id',
      'reason',
      1,
      'idem-key',
      'corr-id',
    );
    expect(result).toEqual({ id: 'agreement-id' });
  });

  it('delegates reject to PricingAgreementService', async () => {
    const reject = vi.fn().mockResolvedValue({ id: 'agreement-id' });
    const facade = createMockFacade({ agreementService: { reject } });
    const result = await facade.reject(access, 'agreement-id', 'reason', 1, 'idem-key', 'corr-id');

    expect(reject).toHaveBeenCalledWith(access, 'agreement-id', 'reason', 1, 'idem-key', 'corr-id');
    expect(result).toEqual({ id: 'agreement-id' });
  });

  it('delegates createSchedule to PricingScheduleService', async () => {
    const createSchedule = vi.fn().mockResolvedValue({ id: 'schedule-id' });
    const facade = createMockFacade({ scheduleService: { createSchedule } });
    const input: CreateInstallmentScheduleDto = { installments: [] };
    const result = await facade.createSchedule(
      access,
      'agreement-id',
      input,
      'idem-key',
      'corr-id',
    );

    expect(createSchedule).toHaveBeenCalledWith(
      access,
      'agreement-id',
      input,
      'idem-key',
      'corr-id',
    );
    expect(result).toEqual({ id: 'schedule-id' });
  });

  it('delegates updateSchedule to PricingScheduleService', async () => {
    const updateSchedule = vi.fn().mockResolvedValue({ id: 'schedule-id' });
    const facade = createMockFacade({ scheduleService: { updateSchedule } });
    const input: UpdateInstallmentScheduleDto = { installments: [] };
    const result = await facade.updateSchedule(
      access,
      'schedule-id',
      input,
      1,
      'idem-key',
      'corr-id',
    );

    expect(updateSchedule).toHaveBeenCalledWith(
      access,
      'schedule-id',
      input,
      1,
      'idem-key',
      'corr-id',
    );
    expect(result).toEqual({ id: 'schedule-id' });
  });

  it('delegates approveSchedule to PricingScheduleService', async () => {
    const approveSchedule = vi.fn().mockResolvedValue({ id: 'schedule-id' });
    const facade = createMockFacade({ scheduleService: { approveSchedule } });
    const result = await facade.approveSchedule(access, 'schedule-id', 1, 'idem-key', 'corr-id');

    expect(approveSchedule).toHaveBeenCalledWith(access, 'schedule-id', 1, 'idem-key', 'corr-id');
    expect(result).toEqual({ id: 'schedule-id' });
  });
});
