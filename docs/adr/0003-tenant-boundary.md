# ADR 0003 — V1 Tenant and Branch Boundary

- Status: Accepted
- Date: 2026-08-09

## Decision

Every operational record is scoped by `organization_id`. Parent tables expose `UNIQUE (organization_id, id)` and child relationships use composite tenant foreign keys. NestJS creates an `AccessContext` from the opaque session and repositories require an organization plus O/B/A/S scope.

General RLS is not enabled in V1. The runtime database user must not be an owner, superuser, or `BYPASSRLS` role. Before onboarding a second organization, an ADR, `FORCE ROW LEVEL SECURITY` proof-of-concept, pool/transaction tests, and authorization regression suite are mandatory.
