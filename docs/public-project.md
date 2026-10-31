# AcademyOps — project overview

AcademyOps is a full-stack training-academy operations platform. It connects the student journey
with the work of reception, sales, academic, attendance, accounts, and operations teams.

## Engineering highlights

- Next.js/React interface with Arabic/English, RTL, responsive layouts, and role-based workspaces.
- NestJS modular backend with typed OpenAPI contracts and shared domain rules.
- PostgreSQL-backed enrollment, scheduling, attendance, payment, and certificate workflows.
- Append-only financial records with explicit approvals, reversals, and audit trails.
- Transactional outbox and Redis/BullMQ workers for retryable asynchronous processing.
- Unit, contract, database integration, browser, accessibility, and load-test tooling.
- Docker deployment templates for one-host and three-host environments.

## Portfolio description

**Title:** AcademyOps | Full-Stack Training Management Platform

**Role:** Full-Stack Developer

**Description:** Built a bilingual academy management platform with Next.js, NestJS, PostgreSQL,
and Redis. It brings student enrollment, scheduling, QR attendance, payments, certificates, and
reporting into role-based workspaces. The backend uses explicit domain workflows, an append-only
financial ledger, audit trails, and background jobs. Includes typed API contracts, automated
tests, and Docker deployment templates. Payment, email, and WhatsApp integrations are configurable
and require separate live validation.

**Skills:** Full-Stack Development, Next.js, NestJS, PostgreSQL, API Development.

## Presentation notes

Use screenshots generated with synthetic fixtures. Label the images as demo data and avoid
presenting fixture figures as real users, revenue, or operational results. The README includes
current Owner dashboard captures in light/dark themes, Arabic RTL, and a mobile viewport.

Configurable integration code does not establish that a provider account is configured, a real
payment has settled, or a message has reached a production recipient. Report validation results
with their date, environment, and any skipped suites. A successful build or unit test run alone
does not establish production acceptance.
