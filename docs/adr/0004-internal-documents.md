# ADR 0004 — Internal Financial Documents Only

- Status: Accepted
- Date: 2026-08-09

## Decision

V1 issues internal invoices and receipts. Tax defaults to zero until the academy approves rates and document rules. Historical documents are migrated only when a real number or artifact exists; otherwise the ledger source carries `legacy_document_missing=true`.

No template, route, or UI copy may claim ETA eInvoice/eReceipt compliance without a separate integration scope and legal/accounting sign-off.
