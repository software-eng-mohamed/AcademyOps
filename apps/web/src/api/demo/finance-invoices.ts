import { financeAccount, invoiceView } from './finance-fixtures';
import {
  audit,
  baseRecord,
  bump,
  cents,
  type DemoContext,
  type DemoRecord,
  type DemoState,
  failure,
  find,
  invalid,
  json,
  money,
  nextId,
  notFound,
  object,
  ownerId,
  page,
  records,
  required,
  string,
  timestamp,
  versionConflict,
} from './shared';

function entries(state: DemoState) {
  const result = [...records(state, 'ledgerEntries')];
  for (const agreement of records(state, 'feeAgreements')) {
    if (
      agreement.status !== 'APPROVED' ||
      result.some((item) => item.enrollmentId === agreement.enrollmentId)
    )
      continue;
    const enrollment = find(state, 'enrollments', agreement.enrollmentId);
    if (enrollment)
      result.push(
        baseRecord(agreement.id, {
          enrollmentId: enrollment.id,
          billingAccountId: enrollment.billingAccountId,
          entryType: 'TUITION',
          direction: 'DEBIT',
          description: 'Synthetic course tuition',
          amount: agreement.totalAmount,
          currencyCode: 'EGP',
          postedAt: agreement.approvedAt,
        }),
      );
  }
  return result;
}
function availableEntries(state: DemoState, billingAccountId: string) {
  const used = new Set(
    records(state, 'invoices')
      .filter((invoice) => ['DRAFT', 'ISSUED'].includes(string(invoice.status)))
      .flatMap((invoice) =>
        Array.isArray(invoice.lines) ? invoice.lines.map((line) => object(line).ledgerEntryId) : [],
      ),
  );
  return entries(state).filter(
    (entry) => entry.billingAccountId === billingAccountId && !used.has(entry.id),
  );
}
function invoiceLines(ctx: DemoContext, invoiceId: string): DemoRecord[] | null {
  if (!Array.isArray(ctx.body.lines) || ctx.body.lines.length < 1 || ctx.body.lines.length > 20)
    return null;
  const eligible = availableEntries(ctx.state, string(ctx.body.billingAccountId));
  const result: DemoRecord[] = [];
  const seen = new Set<string>();
  for (const raw of ctx.body.lines) {
    const line = object(raw);
    const entry = eligible.find((item) => item.id === line.ledgerEntryId);
    const quantity = cents(line.quantity);
    const unit = cents(line.unitAmount);
    const tax = cents(line.taxAmount ?? '0');
    if (
      !entry ||
      seen.has(entry.id) ||
      quantity === null ||
      quantity <= 0 ||
      unit === null ||
      unit <= 0 ||
      tax === null ||
      !Number.isSafeInteger(quantity * unit) ||
      !required(line.descriptionEn, 500) ||
      !required(line.descriptionAr, 500)
    )
      return null;
    const lineTotal = Math.round((quantity * unit) / 100) + tax;
    if (lineTotal <= 0 || lineTotal !== cents(entry.amount)) return null;
    seen.add(entry.id);
    result.push(
      baseRecord(nextId(ctx.state), {
        invoiceId,
        ledgerEntryId: entry.id,
        descriptionAr: line.descriptionAr,
        descriptionEn: line.descriptionEn,
        quantity: money(quantity),
        unitAmount: money(unit),
        taxAmount: money(tax),
        lineTotal: money(lineTotal),
      }),
    );
  }
  return result;
}
export function handleInvoiceActions(ctx: DemoContext): Response | null {
  const { state, path, method, body, url } = ctx;
  if (path[0] !== 'invoices') return null;
  if (method === 'GET' && path[1] === 'eligible-ledger-entries') {
    const accountId = url.searchParams.get('billingAccountId') ?? '';
    return financeAccount(state, accountId)
      ? page(availableEntries(state, accountId), url)
      : notFound();
  }
  if (method !== 'POST') return null;
  if (path.length === 1) {
    const account = financeAccount(state, string(body.billingAccountId));
    if (!account) return invalid();
    const id = nextId(state);
    const lines = invoiceLines(ctx, id);
    if (!lines) return invalid();
    const total = lines.reduce((sum, item) => sum + (cents(item.lineTotal) ?? 0), 0);
    const tax = lines.reduce((sum, item) => sum + (cents(item.taxAmount) ?? 0), 0);
    const invoice = baseRecord(id, {
      billingAccountId: body.billingAccountId,
      lines,
      creditNotes: [],
      status: 'DRAFT',
      serialNumber: null,
      subtotal: money(total - tax),
      taxAmount: money(tax),
      totalAmount: money(total),
      settledAmount: '0.00',
      creditedAmount: '0.00',
      paymentStatus: 'UNPAID',
      currencyCode: 'EGP',
      fiscalYear: null,
      issuedAt: null,
      voidedAt: null,
      customerSnapshot: find(state, 'students', account.studentPersonId) ?? account,
      createdBy: ownerId,
    });
    records(state, 'invoices').unshift(invoice);
    audit(state, 'invoice.create', invoice, 'INVOICE');
    return json(invoice, 201);
  }
  const invoice = find(state, 'invoices', path[1]);
  if (!invoice) return notFound();
  const action = path[2];
  if (action === 'credit-notes') {
    const amount = cents(body.amount);
    const existing = records(state, 'creditNotes').filter((item) => item.invoiceId === invoice.id);
    const credited = existing.reduce((sum, item) => sum + (cents(item.amount) ?? 0), 0);
    if (
      invoice.status !== 'ISSUED' ||
      amount === null ||
      amount <= 0 ||
      !required(body.reason, 500)
    )
      return invalid();
    if (amount + credited > (cents(invoice.totalAmount) ?? 0))
      return failure('CREDIT_NOTE_EXCEEDS_INVOICE', 409);
    const ledgerIds = Array.isArray(invoice.lines)
      ? invoice.lines.map((line) => object(line).ledgerEntryId)
      : [];
    const entry = entries(state).find((item) => ledgerIds.includes(item.id));
    if (!entry) return failure('CREDIT_NOTE_DEBITS_MISSING', 409);
    const note = baseRecord(nextId(state), {
      invoiceId: invoice.id,
      enrollmentId: entry.enrollmentId,
      billingAccountId: invoice.billingAccountId,
      serialNumber: `AO-CN-${state.sequence}`,
      amount: money(amount),
      currencyCode: 'EGP',
      reason: body.reason,
      issuedBy: ownerId,
      fiscalYear: new Date().getUTCFullYear(),
    });
    records(state, 'creditNotes').push(note);
    bump(invoice, { creditedAmount: money(credited + amount), creditNotes: [...existing, note] });
    audit(state, 'credit_note.issue', note, 'CREDIT_NOTE');
    return json({ id: note.id, serialNumber: note.serialNumber, amount: note.amount }, 201);
  }
  if (!['issue', 'cancel', 'void'].includes(action ?? '')) return null;
  const conflict = versionConflict(ctx, invoice);
  if (conflict) return conflict;
  if (action === 'issue') {
    if (invoice.status !== 'DRAFT') return failure('INVOICE_ISSUE_INVALID', 409);
    bump(invoice, {
      status: 'ISSUED',
      serialNumber: `AO-INV-${state.sequence}-${invoice.id.slice(-4)}`,
      fiscalYear: new Date().getUTCFullYear(),
      issuedAt: timestamp(),
    });
  } else {
    if (!required(body.reason, 500)) return invalid();
    if (action === 'cancel' && invoice.status !== 'DRAFT')
      return failure('INVOICE_CANCEL_INVALID', 409);
    const view = invoiceView(state, invoice);
    if (
      action === 'void' &&
      (invoice.status !== 'ISSUED' ||
        Number(view.settledAmount) > 0 ||
        Number(view.creditedAmount) > 0)
    )
      return failure('INVOICE_VOID_SETTLED', 409);
    bump(invoice, {
      status: action === 'void' ? 'VOIDED' : 'CANCELLED',
      voidedAt: action === 'void' ? timestamp() : null,
    });
  }
  audit(state, `invoice.${action}`, invoice, 'INVOICE');
  return json(invoiceView(state, invoice), 201);
}
