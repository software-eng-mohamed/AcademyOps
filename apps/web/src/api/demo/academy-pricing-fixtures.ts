import { baseRecord, type DemoRecord, demoId, ownerId, timestamp } from './shared';

export function academyPricingFixtures(): Record<string, DemoRecord[]> {
  const feeSchedules = Array.from({ length: 12 }, (_, index) =>
    baseRecord(demoId(720 + index), {
      enrollmentId: demoId(300 + index),
      pricingAgreementId: demoId(650 + index),
      status: 'APPROVED',
      lockVersion: 1,
      approvedBy: ownerId,
      approvedAt: timestamp(-25),
      installments: [
        baseRecord(demoId(750 + index), {
          scheduleId: demoId(720 + index),
          ordinal: 1,
          amount: '3000.00',
          dueDate: timestamp(-10).slice(0, 10),
          debitEntryId: null,
        }),
      ],
    }),
  );
  const feeAgreements = Array.from({ length: 12 }, (_, index) =>
    baseRecord(demoId(650 + index), {
      enrollmentId: demoId(300 + index),
      status: 'APPROVED',
      currencyCode: 'EGP',
      proposedBy: ownerId,
      approvedBy: ownerId,
      approvedAt: timestamp(-25),
      lockVersion: 1,
      subtotal: '3000.00',
      discountAmount: '0.00',
      totalAmount: '3000.00',
      requiredApprovalTier: 1,
      lines: [
        baseRecord(demoId(680 + index), {
          pricingAgreementId: demoId(650 + index),
          type: 'TUITION',
          descriptionEn: 'Course tuition',
          descriptionAr: 'مصروفات الدورة',
          quantity: '1',
          unitAmount: '3000.00',
          lineAmount: '3000.00',
        }),
      ],
      schedules: [feeSchedules[index]],
    }),
  );
  return { feeAgreements, feeSchedules };
}
