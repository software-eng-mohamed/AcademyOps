# Cohort intake: fill first, then start

The academy opens a group when its required number of **confirmed, approved enrollments** is reached. Roughly monthly intake is an operational expectation, not a fixed calendar recurrence.

## Staff workflow

1. Create a cohort for a published program version and specify its required number of students. The existing `capacity` field is both the target and the maximum seat reservation limit. No fixed number is assumed for every course.
2. Choose **Open for enrollment / فتح التسجيل للمجموعة**. Dates are optional at this stage.
3. Collect registrations and finish the existing enrollment approval workflow. An enrollment counts only while its state is `ACTIVE` and its current assignment belongs to this exact cohort.
4. When the confirmed count reaches the target, the cohort displays **Required number complete / العدد مكتمل**. It does not start automatically.
5. Set the start/end dates, schedule at least one session and explicitly choose **Start cohort / بدء المجموعة**.

Activation still requires approved pricing and an approved installment schedule. This change does **not** require an actual payment, post a payment, send WhatsApp messages, or bypass existing financial approvals.

## Count semantics

| Field                      | Meaning                                                                   |
| -------------------------- | ------------------------------------------------------------------------- |
| `confirmedEnrollmentCount` | Distinct `ACTIVE` enrollments with an open assignment to this cohort ID   |
| `pendingEnrollmentCount`   | `DRAFT` and `PENDING_APPROVAL` enrollments with an open assignment        |
| `postponedEnrollmentCount` | `POSTPONED` enrollments with an open assignment                           |
| `reservedEnrollmentCount`  | All open seat assignments under the existing reservation policy           |
| `remainingEnrollmentCount` | `max(0, capacity - confirmedEnrollmentCount)`, or `null` without a target |
| `intakeStatus`             | Derived presentation state; does not replace the persisted lifecycle      |

For `PLANNED` cohorts the derived status is `TARGET_REQUIRED`, `COLLECTING` or `READY_TO_START`. Existing `DRAFT`, `ACTIVE`, `COMPLETED` and `CANCELLED` lifecycle states are retained. Imported source aliases and the historical `learnerCount` remain available for reconciliation but do not count toward another group's intake.

Pending reservations still occupy seats and prevent overbooking. Staff should review, transfer or cancel reservations instead of treating unapproved reservations as confirmed students. An enrollment rejection returns it to draft under the existing workflow; it does not cancel the reservation.

## Safeguards

- Start eligibility is re-read inside a serializable backend transaction, not trusted from a cached UI count.
- Before start, postponement, transfer or an approved cancellation reduces the confirmed count; resuming or replacing the enrollment can complete it again. A cancellation request alone does not remove a confirmed enrollment.
- Changing the target recalculates readiness. It cannot be reduced below existing reservations.
- Attendance cannot be opened for a group that has not been explicitly started. Scheduling sessions while collecting enrollments is still allowed.
- After a group starts, later enrollment changes do not automatically revert the group's lifecycle.
- No monthly job, automatic activation, schema migration or rewrite of existing groups is introduced.
- The UI reuses the shared HeroUI meter/cards and status components in both languages. Room capacity labels and other resources are unchanged.

## Verification

Automated coverage lives in `apps/api/test/cohort-intake.test.ts`, `apps/api/test/http/cohort-intake-http.integration.test.ts` and the academy frontend tests. The authenticated HTTP scenario covers approvals, alias isolation, pending/confirmed counts, capacity edits, postponement/resume, transfers, maker-checker cancellation, replacement enrollment, full seats, required dates/sessions, attendance gating and explicit version-checked start.

Database-backed verification uses disposable synthetic PostgreSQL/Redis services, not the normal local academy database.

### Final verification (September 8, 2026)

| Boundary                | Result | Evidence                                                                                                                                                                                                                                                    |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web regression suite    | Passed | 773 tests across 59 files                                                                                                                                                                                                                                   |
| API regression suite    | Passed | 655 cases; 649 completed in the full run and the six trainer cases that exceeded the original five-second timeout passed on their 30-second confirmation run                                                                                                |
| Focused intake coverage | Passed | 18 tests across the intake unit, source-data, policy and authenticated HTTP flows; the final null-target policy check also passed                                                                                                                           |
| Production build        | Passed | All 6 workspace build tasks succeeded; the API was rebuilt once more after the final target guard                                                                                                                                                           |
| Browser to API to data  | Passed | In a disposable signed-in owner environment, a cohort was created without dates, opened for enrollment, and showed `COLLECTING`; transferring one approved `ACTIVE` enrollment changed it to `READY_TO_START`, remaining count to zero and progress to 100% |
| Start safeguards        | Passed | The browser exposed **Start cohort** only after the target filled, and the API rejected the early start until dates were set; authenticated HTTP coverage additionally verifies the scheduled-session gate and explicit successful start                    |
| Local compiled runtime  | Passed | Web health on `http://localhost:3130/health` and API readiness on port 3001 return HTTP 200; the API allows origin `http://localhost:3130`. Web, API and worker run from compiled `start` commands, not watch/dev commands                                  |

The disposable QA database/cache were removed when their temporary containers stopped. The normal local PostgreSQL, Redis and Mailpit services remain intact and healthy.
