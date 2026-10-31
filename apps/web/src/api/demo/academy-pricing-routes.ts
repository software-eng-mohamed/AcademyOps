import {
  type FeeInstallment,
  type FeeLine,
  feeMinorUnits,
  feeTotal,
  feeTypes,
  validFeeSchedule,
} from '@/features/academy/pricing-values';
import { insert, saved } from './academy-write';
import {
  baseRecord,
  bump,
  type DemoContext,
  type DemoRecord,
  failure,
  find,
  invalid,
  money,
  nextId,
  object,
  ownerId,
  records,
  required,
  string,
  timestamp,
  versionConflict,
} from './shared';

function parseLines(body: Record<string, unknown>) {
  if (!Array.isArray(body.lines) || body.lines.length > 100) return null;
  const lines: FeeLine[] = [];
  for (const [index, value] of body.lines.entries()) {
    const line = object(value);
    const type = feeTypes.find((candidate) => candidate === line.type);
    if (!type) return null;
    lines.push({
      key: String(index),
      type,
      descriptionAr: string(line.descriptionAr),
      descriptionEn: string(line.descriptionEn),
      quantity: string(line.quantity),
      unitAmount: string(line.unitAmount),
    });
  }
  const discount = string(body.discountAmount) || '0';
  const total = feeTotal(lines, discount);
  const subtotal = feeTotal(lines, '0');
  if (total === null || subtotal === null || subtotal > BigInt(Number.MAX_SAFE_INTEGER))
    return null;
  return {
    lines,
    subtotal: money(Number(subtotal)),
    discountAmount: money(Number(feeMinorUnits(discount))),
    totalAmount: money(Number(total)),
  };
}
function lineRecords(context: DemoContext, agreementId: string, lines: FeeLine[]) {
  return lines.map((line) => {
    const quantity = feeMinorUnits(line.quantity) ?? BigInt(0);
    const unit = feeMinorUnits(line.unitAmount) ?? BigInt(0);
    return baseRecord(nextId(context.state), {
      pricingAgreementId: agreementId,
      type: line.type,
      descriptionAr: line.descriptionAr,
      descriptionEn: line.descriptionEn,
      quantity: line.quantity,
      unitAmount: line.unitAmount,
      lineAmount: money(Number((quantity * unit + BigInt(50)) / BigInt(100))),
    });
  });
}
function updateLocked(item: DemoRecord, values: Record<string, unknown>) {
  const revision = item.version;
  bump(item, { ...values, lockVersion: Number(item.lockVersion) + 1 });
  item.version = revision;
  return item;
}
function installments(context: DemoContext, total: string, scheduleId: string) {
  if (!Array.isArray(context.body.installments)) return null;
  const values: FeeInstallment[] = context.body.installments.map((entry, index) => ({
    key: String(index),
    amount: string(object(entry).amount),
    dueDate: string(object(entry).dueDate),
  }));
  if (!validFeeSchedule(values, total)) return null;
  return values.map((entry, index) =>
    baseRecord(nextId(context.state), {
      scheduleId,
      ordinal: index + 1,
      dueDate: entry.dueDate,
      amount: entry.amount,
      debitEntryId: null,
    }),
  );
}
export function handleAcademyPricingRoute(context: DemoContext): Response | null {
  const { path, method, state, body } = context;
  if (!['pricing-agreements', 'installment-schedules'].includes(path[0] ?? '') || method === 'GET')
    return null;
  if (path[0] === 'pricing-agreements' && path.length === 1 && method === 'POST') {
    const enrollment = find(state, 'enrollments', body.enrollmentId);
    const values = parseLines(body);
    if (body.currencyCode !== undefined && body.currencyCode !== 'EGP') return invalid();
    if (!enrollment || !['DRAFT', 'PENDING_APPROVAL'].includes(string(enrollment.state)) || !values)
      return invalid();
    const agreement = insert(state, 'feeAgreements', {
      enrollmentId: enrollment.id,
      currencyCode: 'EGP',
      status: 'DRAFT',
      lockVersion: 1,
      version:
        Math.max(
          0,
          ...records(state, 'feeAgreements')
            .filter((item) => item.enrollmentId === enrollment.id)
            .map((item) => Number(item.version)),
        ) + 1,
      proposedBy: ownerId,
      approvedBy: null,
      approvedAt: null,
      requiredApprovalTier: 1,
      subtotal: values.subtotal,
      discountAmount: values.discountAmount,
      totalAmount: values.totalAmount,
      schedules: [],
    });
    agreement.lines = lineRecords(context, agreement.id, values.lines);
    return saved(context, 'feeAgreements', agreement, 'CREATE', 201);
  }
  const collection = path[0] === 'pricing-agreements' ? 'feeAgreements' : 'feeSchedules';
  const item = find(state, collection, path[1]);
  if (!item) return null;
  const conflict = versionConflict(context, { ...item, version: item.lockVersion });
  if (conflict) return conflict;
  if (collection === 'feeAgreements') {
    if (path.length === 2 && method === 'PUT') {
      const values = parseLines(body);
      if (item.status !== 'DRAFT' || !values) return invalid();
      updateLocked(item, {
        subtotal: values.subtotal,
        discountAmount: values.discountAmount,
        totalAmount: values.totalAmount,
        lines: lineRecords(context, item.id, values.lines),
      });
      return saved(context, collection, item, 'UPDATE');
    }
    const action = path[2];
    if (path.length !== 3 || method !== 'POST') return null;
    if (action === 'installment-schedules') {
      if (item.status !== 'APPROVED') return failure('INVALID_STATE_TRANSITION', 409);
      const id = nextId(state);
      const values = installments(context, string(item.totalAmount), id);
      if (!values) return invalid();
      const previous = records(state, 'feeSchedules').filter(
        (schedule) => schedule.pricingAgreementId === item.id,
      );
      const schedule = baseRecord(id, {
        pricingAgreementId: item.id,
        enrollmentId: item.enrollmentId,
        status: 'DRAFT',
        lockVersion: 1,
        version: Math.max(0, ...previous.map((entry) => Number(entry.version))) + 1,
        installments: values,
        approvedAt: null,
        approvedBy: null,
      });
      state.collections.feeSchedules ??= [];
      state.collections.feeSchedules.push(schedule);
      item.schedules = [...previous, schedule];
      return saved(context, 'feeSchedules', schedule, 'CREATE', 201);
    }
    const transitions: Record<string, { from: string; to: string }> = {
      submit: { from: 'DRAFT', to: 'PROPOSED' },
      approve: { from: 'PROPOSED', to: 'APPROVED' },
      reject: { from: 'PROPOSED', to: 'REJECTED' },
    };
    const transition = transitions[action ?? ''];
    if (!transition) return null;
    if (item.status !== transition.from) return failure('INVALID_STATE_TRANSITION', 409);
    if (action !== 'submit' && !required(body.reason, 1000)) return invalid();
    return saved(
      context,
      collection,
      updateLocked(item, {
        status: transition.to,
        ...(action === 'approve' ? { approvedBy: ownerId, approvedAt: timestamp() } : {}),
      }),
      string(action).toUpperCase(),
    );
  }
  const agreement = find(state, 'feeAgreements', item.pricingAgreementId);
  if (agreement?.status !== 'APPROVED' || item.status !== 'DRAFT')
    return failure('INVALID_STATE_TRANSITION', 409);
  if (path.length === 2 && method === 'PUT') {
    const values = installments(context, string(agreement.totalAmount), item.id);
    if (!values) return invalid();
    return saved(context, collection, updateLocked(item, { installments: values }), 'UPDATE');
  }
  if (path.length === 3 && path[2] === 'approve' && method === 'POST')
    return saved(
      context,
      collection,
      updateLocked(item, { status: 'APPROVED', approvedBy: ownerId, approvedAt: timestamp() }),
      'APPROVE',
    );
  return null;
}
