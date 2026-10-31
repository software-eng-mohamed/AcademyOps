# Excel Migration Runbook

## Source custody

The source workbook is read-only. For each received file the importer records its SHA-256, original name, size, workbook/sheet metadata, raw cell values, normalized values, row number, and a stable row hash. Comments and broken author metadata are intentionally ignored; formulas and cell errors remain visible as source evidence.

Example local input path:

```text
data/legacy-academy.xlsx
```

Do not copy this workbook into the repository or mutate it.

## Pipeline

1. `POST /api/v1/imports/batches` stages values only.
2. `POST /api/v1/imports/batches/{id}/validate` normalizes known fields, encrypts archive-only sheets, and creates issues.
3. A Data Steward resolves person candidates and approved mappings. No row is merged because of Code, phone, email, or name alone.
4. Domain promotion uses approved, versioned mappings and records `legacy_references` back to the exact import row.
5. `reconcile` compares source and target counts and money.
6. `finalize` requires zero unresolved staging rows, zero open Critical/High issues, and zero failed reconciliation checks, plus current step-up MFA.

## Mandatory transformations

- Remove direction marks and invisible whitespace while retaining raw values.
- Normalize phones to E.164 only when defensible; never activate login before verification.
- Trim/lowercase email without using it as a person identity decision.
- Apply approved mapping tables for `Hypird → HYBRID` and payment method aliases.
- Resolve cohort year rollover explicitly; the sheet name alone is insufficient.
- Treat legacy Code as a non-unique reference.
- Rebuild attendance ratios from mapped session/attendance records.
- Create ABSENT only for an approved completed session and an enrollment on its effective roster.
- Represent overpayments as unapplied credits; quarantine corrupt financial rows.
- Archive B2B offers, Shipping, and Messaging rather than creating V1 workflows.

## Reconciliation and cutover

- Every source row ends as `IMPORTED`, `REJECTED`, `QUARANTINED`, or `ARCHIVED`.
- Financial difference across price, payments, credits, and outstanding must be exactly `0.00 EGP`.
- Re-run dry imports and compare source, row, and result hashes for determinism.
- Freeze Excel read-only, record final hash, take a database snapshot, run final import, and obtain Owner + Accounts + Academic sign-off.
- Before go-live, rollback may restore the snapshot. After operational writes start, retain the batch and use forward corrections only.

The generic staging/validation/archive guardrail is implemented. Production domain promotion and the exact workbook-specific mapping approval screens remain a cutover gate.
