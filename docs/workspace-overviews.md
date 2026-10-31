# Role workspace overviews

The Owner and Student pages are preserved. The other eight built-in roles now have
distinct, permission-scoped overviews in `apps/web`. An authenticated account without
an eligible role **and** its required grants sees an access message, no Overview
navigation entry, and makes no overview request.

## Presentation

All new workspaces reuse the existing welcome card, BoardUI overview stat cards,
Iconsax Bulk icon tiles, breadcrumbs, and notification menu. Three small cards keep
the shared welcome, while role-specific compositions add charts and useful context.
Student retains the personal view described below. No invented trends, demonstration
records, new gradients, or links to unfinished pages are added. Arabic and English
copy lives in i18n; names use bidi isolation.

| Workspace    | Cards                                                                                                      | Preview                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Operations   | Today's sessions; active enrollments; pending approvals                                                    | Today's sessions                                            |
| Academic     | Active cohorts; today's sessions; upcoming sessions                                                        | Upcoming sessions                                           |
| Reception    | Today's sessions; draft enrollments; pending approvals                                                     | Today's sessions                                            |
| Accounts     | Posted payments received today; posted payments received this month; reversed payments received this month | Latest payments received this month                         |
| Attendance   | Today's sessions; open attendance windows today; completed sessions today                                  | Today's sessions                                            |
| Trainer      | Assigned sessions today; upcoming assigned sessions; completed assigned sessions dated this month          | Upcoming assigned sessions                                  |
| Student      | Own active enrollments; upcoming sessions; own completed enrollments                                       | Sessions within the student's enrollment assignment windows |
| WhatsApp OTP | Connection state; delivery readiness; channel enabled state                                                | Masked number and connection timestamps                     |

## Data and access

### Role-specific additions

`staff` is an optional, discriminated projection on the workspace response. It is
never included for Student. Sales keeps its separate endpoint and gains `insights`.
Optionality supports old cached responses; production reads always return the
appropriate staff projection. No additional browser request or schema migration is needed.

| Role         | Composition and definitions                                                                                                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Operations   | Seven-day stacked session load (scheduled/completed), preparation checklist for future scheduled sessions (no room for non-online classes; no confirmed trainer), weekly delivery formats, current enrollment-state ranking and today's running order.                                                                                                 |
| Academic     | Current session-state donut over all visible sessions, six groups ranked active-first with completed/scheduled/draft/cancelled counts, and upcoming sessions. Group progress denominator excludes cancelled sessions; this is session delivery, not student attainment.                                                                                |
| Reception    | Daily registrations created during the last 28 Cairo dates (including partial today), current enrollment-state ranking, latest six registrations with program names and today's classes. No student names/contact fields are added.                                                                                                                    |
| Accounts     | Posted receipts by Cairo month (current partial month plus five earlier months), exact month collection amount, pending-verification count/value across all dates, top five payment methods by this month's posted amount, and recent payments. EGP values retain cents; pending/reversed/rejected payments never inflate collection charts.           |
| Attendance   | Raw recorded statuses for started sessions today, seven-date stacked attendance history, today's window states and session queue. Excused/unmarked are separate; a missing record never becomes absence. Catalog access is intersected with the attendance grant, so catalog O cannot expand attendance B.                                             |
| Trainer      | Featured next confirmed-assigned session (including beyond seven days), scheduled/completed teaching hours per Cairo date in the coming week, delivery formats, upcoming timetable and last four completed classes. Extra organization grants cannot broaden the personal view.                                                                        |
| WhatsApp OTP | Readiness checklist, masked channel metadata, seven-date phone sign-in request trend, all pending dispatches, previously attempted subset and last request timestamp. `processed_at` only means handed to the worker, **not delivered**. Only outbox metadata for `security.phone_otp_requested` is aggregated; no payload/recipient/code is selected. |
| Sales        | All six actual lead states (NEW/OPEN/QUALIFIED/WON/LOST/DISQUALIFIED), 28-date new-lead trend, top five sources in that period, open leads missing a next-action date, and the existing follow-up queue. State distribution is not a cohort conversion-rate funnel. All projections share the existing scoped SQL snapshot.                            |

Staff charts use installed Nivo bar/line/pie components with zero-based magnitude
scales, fixed semantic colors, numeric summaries and no animation. They load only
when there is something to plot. Empty datasets show an honest localized empty
state. CSS is scoped to staff views; chart cards contain their screen-reader-only
summaries so the document cannot acquire a second vertical scrollbar. Owner,
Student, sidebar, authentication, theme controls and global dashboard styles are
not redesigned.

`GET /api/v1/dashboard/workspaces/{role}` requires an authenticated session and
returns `Cache-Control: private, no-store`. The service enforces the complete
permission/scope matrix in `packages/contracts/src/workspace-overview.ts` before any query.
The route accepts only the eight workspace role names; Owner, Sales and no-grant
are not alternate paths to this endpoint. A role parameter selects presentation,
**not authority**. Client-supplied organization, branch or user IDs cannot expand
the session's scope.

- Academic data reuses `AcademicService.visibleSessionIds` and
  `CatalogAccessService.visibleCohortIds`. All reads additionally filter the
  authenticated organization.
- Enrollment counts reuse `EnrollmentQueryService.visibleEnrollmentIds` for
  `enrollments.read`. A missing student profile yields an empty personal view.
- Trainer and Student views explicitly narrow academic scope to A and S,
  respectively, even when the account has additional permissions.
- Payment data reuses `FinanceAccessService.visibleBillingAccountIds` for
  `payments.read` (O/B only). Student has a separate self-scoped financial projection;
  other workspaces never receive these payment amounts.
- WhatsApp uses the existing channel availability service and an allowlisted
  projection. No OTP codes, QR payload, credentials, raw errors or provider
  internals are returned. This overview performs no connect/reset/send operation.

## Metric definitions

Counts come from database `count` queries, not the size of a paginated preview.
Previews contain at most six rows, with deterministic date/id ordering. Related
cohort, room and payment method labels are batch-loaded. No roster, student contact
information or full payment details are fetched for a preview.

- All day and month boundaries use `Africa/Cairo`, including daylight saving.
- Today means local midnight through the next midnight, exclusive. Only
  `SCHEDULED` and `COMPLETED` sessions count; drafts and cancellations do not.
- Upcoming means scheduled sessions starting at or after the request time and
  before local midnight seven dates after today: the remainder of today and the
  following six calendar days. Ongoing sessions remain in today's count but not
  the upcoming preview.
- Completed sessions this month means sessions with current state `COMPLETED`
  whose scheduled start is between month start and the request time. It is not
  a count of status-change events.
- Payment month means `receivedAt` between month start and the request time.
  Posted and reversed cards describe the **current state** of these payments;
  the reversal card does not imply reversals happened this month. Amounts in the
  six-row preview retain two decimal places in EGP.
- These are operational reads, not financial reconciliation snapshots; concurrent
  updates can occur between count and preview queries.

## Expanded Student view

Only `STUDENT` responses include the optional `student` read model. It adds:

- Next scheduled session at or after the request time, including dates beyond
  the timetable week. Module, cohort, room, start/end time and delivery mode are
  projected; no attendee lists or meeting secrets are returned.
- A seven-day timetable starting at today's Cairo midnight, with BoardUI day
  tabs. Scheduled/completed sessions use the same enrollment assignment windows
  as the academic API. At most 28 rows are returned with an exact total; a limited
  preview never claims an omitted day has no sessions.
- Latest six enrollments with course names and current state, plus exact total.
- Attendance composition across own enrollment records using the contracts'
  canonical `calculateAttendanceRatio`: PRESENT/LATE and valid make-up credits
  contribute to the numerator; EXCUSED/UNMARKED do not enter the denominator.
  Raw status counts remain separately labelled. No records means no percentage.
- Financial ledger charges, credits and signed net balance, using Decimal sums.
  Negative balance is labelled credit, not debt. These are not inferred tuition
  prices or payment-only totals. Own enrollment entries plus unassigned entries
  on own individual accounts are included; other students' entries on shared
  accounts are excluded.
- Unpaid installments from each enrollment's latest approved pricing agreement
  and its latest approved schedule. Allocations reduce remaining amounts. Dates
  compare as calendar dates in Cairo; due today is not overdue. Shows the first
  six ordered by due date, exact unpaid count and total overdue remainder.
- Posted payments by Cairo receipt month for the current partial month and five
  preceding months; pending/rejected/reversed payments are excluded. Amounts
  retain cents. Zero-payment months remain zero rather than missing observations.

Attendance requires `attendance.read:S`, finance requires `finance.balance.read:S`,
and payment history requires `payments.read:S`. Missing optional permissions yield
`null` and a localized unavailable state, not fabricated zeroes. Extra staff grants
never broaden this read model. Student detail reads share a repeatable-read
transaction; header counters are the existing independent operational snapshot.

Charts use installed [Nivo](https://nivo.rocks/) components, lazy-loaded only when
Student has chart data, with motion disabled and visible/accessible numerical
summaries. No separate analytics runtime or new chart dependency is installed.

### Student verification

`student-overview-postgres.integration.test.ts` covers partial settlements,
personal/organization isolation, missing permissions and profiles, the next
session beyond seven days, attendance ownership, and posted-payment month buckets.
`apps/web/test/student-overview.test.tsx` covers AR/EN, keyboard timetable selection,
money precision, credit balances, empty/unavailable states and Cairo dates.
Development accounts and business data remain unchanged.

## Loading and failure behavior

The server supplies initial data for immediate render. The generated Orval hook
refreshes through TanStack Query with a user-and-role-specific cache key, 30-second
stale time, zero retention after unmount and a 60-second active refresh interval.
It uses the existing transient-only, one-retry policy. The transport does not retry.
Failed refreshes stop polling, preserve the last result with a stale warning, and
provide retry. A 401/403 hides old data. Missing data never becomes a zero count.

## Verification

- `workspace-insights-postgres.integration.test.ts`: nonzero staff aggregates,
  empty scopes, organization/branch isolation, Cairo buckets, Decimal amounts,
  session preparation, raw attendance and OTP metadata privacy.
- `apps/web/test/staff-overview*.test.tsx`: distinct AR/EN compositions, mismatch
  protection, six sales states, honest empty charts, money precision, zero-based
  chart scales and motion-free rendering.

- `apps/api/test/workspace-overview.test.ts`: grant matrix, pre-query denials,
  personal scope narrowing, Cairo boundaries and WhatsApp field allowlist.
- `apps/api/test/workspace-overview-postgres.integration.test.ts`: real PostgreSQL
  counts, six-row limits, branch/organization isolation, active trainer assignment
  and student assignment dates, all in rolled-back fixtures.
- `apps/api/test/http/workspace-overview-http.integration.test.ts`: all eight
  workspaces twice through real sessions, invalid role, no-grant and anonymous
  access, and no-store headers.
- `apps/web/test/workspace-overview*.test.tsx`: all roles in both languages,
  route/grant selection, zero and error states, retry, stale data, permission
  revocation, cache identity and payment precision.

No existing development account, password, role assignment or business record is
changed by these tests.
