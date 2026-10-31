# Domain Contracts

The executable sources of truth are:

- Prisma schema root: `apps/api/prisma/schema.prisma` and model fragments in `apps/api/prisma/models/`
- PostgreSQL invariants: `apps/api/prisma/migrations/`
- State machines: `packages/contracts/src/states.ts`
- Permission matrix and scopes: `packages/contracts/src/permissions.ts`
- Command API: NestJS controllers under `apps/api/src/`

## State command coverage

| Aggregate         | Commands implemented                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Lead              | open, qualify, win, lose, disqualify, reopen                                                                |
| Enrollment        | submit, activate, reject, transfer, postpone, resume, complete, cancellation request/approve/reject         |
| Payment           | create, post, reject, Paymob installment checkout/webhook, reversal request/approve, refund request/approve |
| Invoice           | create draft, issue, cancel, void, credit note                                                              |
| Attendance window | open, close, automatic close/lock                                                                           |
| Attendance record | QR check-in, manual record, correction, makeup credit                                                       |
| Certificate       | evaluate, issue, revoke, print, ready, collect, public verify                                               |

All state-changing endpoints use explicit commands. Finance, lead conversion, attendance check-in/correction, certificate issue/revoke, cancellation decisions, and final import also use stored idempotency replay.

## Permission clarification

The approved state machine contains `ACTIVE/POSTPONED -> COMPLETED`, but the supplied matrix did not name a permission for that command. Implementation adds `enrollments.complete` with default scope `O` for Owner and `B` for Academic. No other default role receives it.

## Financial truth

The AR balance is derived from posted ledger debits minus credits. Allocations settle entries but do not mutate them. Issued invoice lines and posted ledger entries are immutable; reversals and credit notes create new entries. Invoice settlement labels remain derived read-model concepts rather than legal states.

Paymob checkout redirects never post money. Only a valid signed webhook creates the posted payment, ledger credit, installment-first allocation, and receipt in one serializable transaction.

## Certificate gate

A certificate requires both a recomputed attendance ratio of at least `0.8000` and an enrollment AR balance less than or equal to `0.00 EGP`. Issuance creates the immutable certificate record in `PENDING_UPLOAD`; an Academic/Owner user with `certificates.upload` then uploads an academy-approved PDF, moving it to `AVAILABLE`. There is no generated certificate artwork. Replacement is audited and is only allowed while the active certificate is still `NOT_PRINTED`; after printing, correction requires revoke/reissue. The same live academic and financial gate runs again before download, print, ready-for-collection, and collection transitions.

Finance exports are background jobs, not synchronous request payloads. The request stores the authorized enrollment scope at creation, writes audit/outbox in the same transaction, and transitions `QUEUED → RUNNING → AVAILABLE/FAILED`. Downloads require the original requester or organization-wide authority, a fresh step-up MFA, an unexpired job, and a private clean file asset. CSV values that can trigger spreadsheet formulas are escaped before storage.

## Tenant boundary

Every operational lookup is organization-scoped and resource-scoped through `AccessContext`. Composite `(organization_id, id)` foreign keys reject cross-tenant relationships in PostgreSQL. RLS remains the mandatory gate before adding a second organization.
