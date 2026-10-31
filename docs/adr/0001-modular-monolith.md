# ADR 0001 — NestJS Modular Monolith

- Status: Accepted
- Date: 2026-08-09

## Decision

V1 is one NestJS modular monolith. `apps/api` and `apps/worker` are separately scaled processes built from the same repository, domain modules, Prisma schema, migrations, and PostgreSQL database. BullMQ is an execution mechanism, not a data boundary.

## Consequences

- Cross-domain invariants may be enforced with one PostgreSQL transaction.
- Deployment and observability remain simple for the initial team and load.
- Modules expose commands and domain services, not direct table access to the web app.
- A future extraction requires a new ADR with measured contention, isolation, scale, or ownership evidence. Team preference alone is insufficient.
