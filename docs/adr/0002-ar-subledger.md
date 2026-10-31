# ADR 0002 — Append-only Accounts Receivable Subledger

- Status: Accepted
- Date: 2026-08-09

## Decision

Student receivables use `ledger_entries` and `ledger_allocations`. Balances are computed as debits minus credits. Pricing agreements and installment schedules authorize future debits; invoices and receipts document entries. They are not competing balance sources.

Posted entries are immutable. Payment reversals, refunds, and corrections create explicit inverse entries. Allocation triggers lock both entries and reject over-allocation. Issued internal documents use serialized sequences and immutable payer snapshots.

## Boundary

This is an AR subledger, not a general ledger. V1 documents are labelled internal invoices and receipts and make no Egyptian Tax Authority compliance claim.
