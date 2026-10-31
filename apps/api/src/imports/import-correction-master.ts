import type { MasterValue, PaymentValue, PaymentEvidenceIssue } from './import-values';
import {
  array,
  object,
  exactKeys,
  requiredString,
  text,
  requiredText,
  nullableText,
  money,
  positiveMoney,
  integer,
  oneOf,
  invalid,
} from './import-correction-primitives';

export function master(input: Record<string, unknown>): MasterValue {
  exactKeys(
    input,
    [
      'legacyCode',
      'state',
      'telesalesAgent',
      'acquisitionSource',
      'secondaryCode',
      'name',
      'phone',
      'email',
      'kind',
      'branch',
      'deliveryMode',
      'programCode',
      'cohortCode',
      'subtotal',
      'discountAmount',
      'totalAmount',
      'paidAmount',
      'workbookShouldPaid',
      'workbookRemaining',
      'payments',
      'paymentEvidenceIssues',
    ],
    'correction.values',
  );
  const payments = array(input.payments, 'payments').map(payment);
  const paymentEvidenceIssues = input.paymentEvidenceIssues
    ? array(input.paymentEvidenceIssues, 'paymentEvidenceIssues').map(paymentEvidence)
    : [];
  const ordinals = payments.flatMap((entry) =>
    entry.sourceOrdinal === undefined ? [] : [entry.sourceOrdinal],
  );
  if (new Set(ordinals).size !== ordinals.length) invalid('payments', 'Payment slots repeat');
  return {
    legacyCode: requiredText(input.legacyCode, 'legacyCode'),
    state: text(input.state, 'state'),
    ...(input.telesalesAgent === undefined
      ? {}
      : { telesalesAgent: text(input.telesalesAgent, 'telesalesAgent') }),
    ...(input.acquisitionSource === undefined
      ? {}
      : { acquisitionSource: text(input.acquisitionSource, 'acquisitionSource') }),
    ...(input.secondaryCode === undefined
      ? {}
      : { secondaryCode: text(input.secondaryCode, 'secondaryCode') }),
    name: requiredText(input.name, 'name'),
    phone: nullableText(input.phone, 'phone'),
    email: nullableText(input.email, 'email'),
    kind: text(input.kind, 'kind'),
    branch: requiredText(input.branch, 'branch'),
    deliveryMode: oneOf(input.deliveryMode, ['IN_PERSON', 'ONLINE', 'HYBRID'], 'deliveryMode'),
    programCode: requiredText(input.programCode, 'programCode'),
    cohortCode: requiredText(input.cohortCode, 'cohortCode'),
    subtotal: money(input.subtotal, 'subtotal'),
    discountAmount: money(input.discountAmount, 'discountAmount'),
    totalAmount: money(input.totalAmount, 'totalAmount'),
    paidAmount: money(input.paidAmount, 'paidAmount'),
    ...(input.workbookShouldPaid === undefined
      ? {}
      : { workbookShouldPaid: money(input.workbookShouldPaid, 'workbookShouldPaid') }),
    ...(input.workbookRemaining === undefined
      ? {}
      : { workbookRemaining: money(input.workbookRemaining, 'workbookRemaining') }),
    payments,
    paymentEvidenceIssues,
  };
}

function payment(value: unknown, index: number): PaymentValue {
  const input = object(value, `payments.${index}`);
  exactKeys(input, ['amount', 'method', 'receivedAt', 'sourceOrdinal'], `payments.${index}`);
  const receivedAt = requiredString(input.receivedAt, `payments.${index}.receivedAt`);
  if (Number.isNaN(Date.parse(receivedAt))) invalid(`payments.${index}.receivedAt`);
  return {
    amount: positiveMoney(input.amount, `payments.${index}.amount`),
    method: requiredText(input.method, `payments.${index}.method`),
    receivedAt: new Date(receivedAt).toISOString(),
    ...(input.sourceOrdinal === undefined
      ? {}
      : { sourceOrdinal: integer(input.sourceOrdinal, `payments.${index}.sourceOrdinal`, 1, 9) }),
  };
}

function paymentEvidence(value: unknown, index: number): PaymentEvidenceIssue {
  const input = object(value, `paymentEvidenceIssues.${index}`);
  exactKeys(
    input,
    ['ordinal', 'amount', 'method', 'receivedAt', 'codes'],
    `paymentEvidenceIssues.${index}`,
  );
  const codes: PaymentEvidenceIssue['codes'] = array(
    input.codes,
    `paymentEvidenceIssues.${index}.codes`,
  ).map((code) =>
    oneOf(
      code,
      ['PAYMENT_DATE_REQUIRED', 'PAYMENT_METHOD_REQUIRED'] as const,
      'paymentEvidenceIssues.code',
    ),
  );
  return {
    ordinal: integer(input.ordinal, `paymentEvidenceIssues.${index}.ordinal`, 1, 9),
    amount: positiveMoney(input.amount, `paymentEvidenceIssues.${index}.amount`),
    method: text(input.method, `paymentEvidenceIssues.${index}.method`),
    receivedAt: text(input.receivedAt, `paymentEvidenceIssues.${index}.receivedAt`),
    codes,
  };
}
