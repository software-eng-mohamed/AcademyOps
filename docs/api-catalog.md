# API operation catalog

This file is generated from `packages/api-client/openapi.json` and `docs/api-operation-surfaces.json`. It is the implementation inventory for the frontend rebuild; edit the surface manifest, then regenerate this catalog.

Commands:

- `pnpm api:generate` regenerates OpenAPI, response contracts, clients, and this catalog.
- `pnpm api:catalog:sync` adds newly discovered operations as `unclassified`.
- `pnpm api:contract:check` rejects missing schemas, drift, or unclassified operations.

## Coverage

- Paths: 191
- Operations: 221
- Responses: 214 JSON, 6 no-content, 1 binary

| Surface               | Operations | Purpose                                                               |
| --------------------- | ---------: | --------------------------------------------------------------------- |
| `dashboard`           |        210 | Authenticated operations consumed by the dashboard application.       |
| `public-auth`         |          5 | Unauthenticated sign-in and account-recovery operations.              |
| `public-registration` |          1 | Unauthenticated student registration entry point.                     |
| `public-verification` |          1 | Unauthenticated certificate verification.                             |
| `asset-delivery`      |          1 | Token-protected browser asset delivery.                               |
| `integration`         |          1 | Server-to-server integration callbacks; never called by dashboard UI. |
| `infrastructure`      |          2 | Liveness and readiness probes; never rendered as dashboard features.  |

## Operations

| Surface               | Domain             | Method  | Path                                                    | Operation ID                                            | Response     |
| --------------------- | ------------------ | ------- | ------------------------------------------------------- | ------------------------------------------------------- | ------------ |
| `asset-delivery`      | files              | `GET`   | `/api/v1/files/{id}/content`                            | `FilesController_content_v1`                            | `binary`     |
| `dashboard`           | academic           | `GET`   | `/api/v1/sessions`                                      | `AcademicController_list_v1`                            | `json`       |
| `dashboard`           | academic           | `POST`  | `/api/v1/sessions`                                      | `AcademicController_create_v1`                          | `json`       |
| `dashboard`           | academic           | `GET`   | `/api/v1/sessions/{id}`                                 | `AcademicController_read_v1`                            | `json`       |
| `dashboard`           | academic           | `POST`  | `/api/v1/sessions/{id}/cancel`                          | `AcademicController_cancel_v1`                          | `json`       |
| `dashboard`           | academic           | `POST`  | `/api/v1/sessions/{id}/complete`                        | `AcademicController_complete_v1`                        | `json`       |
| `dashboard`           | academic           | `POST`  | `/api/v1/sessions/{id}/reschedule`                      | `AcademicController_reschedule_v1`                      | `json`       |
| `dashboard`           | academic-calendar  | `GET`   | `/api/v1/calendar`                                      | `CalendarController_read_v1`                            | `json`       |
| `dashboard`           | academic-catalog   | `GET`   | `/api/v1/modules`                                       | `ModulesController_list_v1`                             | `json`       |
| `dashboard`           | academic-catalog   | `POST`  | `/api/v1/modules`                                       | `ModulesController_create_v1`                           | `json`       |
| `dashboard`           | academic-catalog   | `PATCH` | `/api/v1/modules/{id}`                                  | `ModulesController_update_v1`                           | `json`       |
| `dashboard`           | academic-catalog   | `GET`   | `/api/v1/program-versions/{id}`                         | `ProgramVersionsController_read_v1`                     | `json`       |
| `dashboard`           | academic-catalog   | `POST`  | `/api/v1/program-versions/{id}/archive`                 | `ProgramVersionsController_archive_v1`                  | `json`       |
| `dashboard`           | academic-catalog   | `PUT`   | `/api/v1/program-versions/{id}/curriculum`              | `ProgramVersionsController_replaceCurriculum_v1`        | `json`       |
| `dashboard`           | academic-catalog   | `POST`  | `/api/v1/program-versions/{id}/publish`                 | `ProgramVersionsController_publish_v1`                  | `json`       |
| `dashboard`           | academic-catalog   | `GET`   | `/api/v1/programs`                                      | `ProgramsController_list_v1`                            | `json`       |
| `dashboard`           | academic-catalog   | `POST`  | `/api/v1/programs`                                      | `ProgramsController_create_v1`                          | `json`       |
| `dashboard`           | academic-catalog   | `GET`   | `/api/v1/programs/{id}`                                 | `ProgramsController_read_v1`                            | `json`       |
| `dashboard`           | academic-catalog   | `PATCH` | `/api/v1/programs/{id}`                                 | `ProgramsController_update_v1`                          | `json`       |
| `dashboard`           | academic-catalog   | `POST`  | `/api/v1/programs/{id}/versions`                        | `ProgramsController_createVersion_v1`                   | `json`       |
| `dashboard`           | academic-cohorts   | `GET`   | `/api/v1/cohorts`                                       | `CohortsController_list_v1`                             | `json`       |
| `dashboard`           | academic-cohorts   | `POST`  | `/api/v1/cohorts`                                       | `CohortsController_create_v1`                           | `json`       |
| `dashboard`           | academic-cohorts   | `GET`   | `/api/v1/cohorts/{id}`                                  | `CohortsController_read_v1`                             | `json`       |
| `dashboard`           | academic-cohorts   | `PATCH` | `/api/v1/cohorts/{id}`                                  | `CohortsController_update_v1`                           | `json`       |
| `dashboard`           | academic-cohorts   | `POST`  | `/api/v1/cohorts/{id}/{command}`                        | `CohortsController_transition_v1`                       | `json`       |
| `dashboard`           | academic-resources | `GET`   | `/api/v1/rooms`                                         | `RoomsController_list_v1`                               | `json`       |
| `dashboard`           | academic-resources | `POST`  | `/api/v1/rooms`                                         | `RoomsController_create_v1`                             | `json`       |
| `dashboard`           | academic-resources | `PATCH` | `/api/v1/rooms/{id}`                                    | `RoomsController_update_v1`                             | `json`       |
| `dashboard`           | academic-resources | `GET`   | `/api/v1/trainers`                                      | `TrainersController_list_v1`                            | `json`       |
| `dashboard`           | academic-resources | `POST`  | `/api/v1/trainers`                                      | `TrainersController_create_v1`                          | `json`       |
| `dashboard`           | academic-resources | `GET`   | `/api/v1/trainers/{id}`                                 | `TrainersController_read_v1`                            | `json`       |
| `dashboard`           | academic-resources | `PATCH` | `/api/v1/trainers/{id}`                                 | `TrainersController_update_v1`                          | `json`       |
| `dashboard`           | attendance         | `GET`   | `/api/v1/attendance-policies`                           | `AttendanceController_listPolicies_v1`                  | `json`       |
| `dashboard`           | attendance         | `POST`  | `/api/v1/attendance-policies`                           | `AttendanceController_createPolicy_v1`                  | `json`       |
| `dashboard`           | attendance         | `GET`   | `/api/v1/attendance/{id}`                               | `AttendanceController_readRecord_v1`                    | `json`       |
| `dashboard`           | attendance         | `POST`  | `/api/v1/attendance/{id}/corrections`                   | `AttendanceController_correct_v1`                       | `json`       |
| `dashboard`           | attendance         | `POST`  | `/api/v1/attendance/check-in`                           | `AttendanceController_checkIn_v1`                       | `json`       |
| `dashboard`           | attendance         | `POST`  | `/api/v1/attendance/makeup-credits`                     | `AttendanceController_makeup_v1`                        | `json`       |
| `dashboard`           | attendance         | `GET`   | `/api/v1/attendance/self-token`                         | `AttendanceController_getSelfToken_v1`                  | `json`       |
| `dashboard`           | attendance         | `GET`   | `/api/v1/enrollments/{id}/attendance-summary`           | `AttendanceController_summary_v1`                       | `json`       |
| `dashboard`           | attendance         | `GET`   | `/api/v1/sessions/{id}/attendance`                      | `AttendanceController_roster_v1`                        | `json`       |
| `dashboard`           | attendance         | `GET`   | `/api/v1/sessions/{id}/attendance-anomalies`            | `AttendanceController_anomalies_v1`                     | `json`       |
| `dashboard`           | attendance         | `POST`  | `/api/v1/sessions/{id}/attendance-window/close`         | `AttendanceController_closeWindow_v1`                   | `json`       |
| `dashboard`           | attendance         | `POST`  | `/api/v1/sessions/{id}/attendance-window/open`          | `AttendanceController_openWindow_v1`                    | `json`       |
| `dashboard`           | attendance         | `POST`  | `/api/v1/sessions/{id}/attendance/manual`               | `AttendanceController_recordManual_v1`                  | `json`       |
| `dashboard`           | attendance         | `POST`  | `/api/v1/sessions/{id}/attendance/scan`                 | `AttendanceController_scan_v1`                          | `json`       |
| `dashboard`           | attendance         | `POST`  | `/api/v1/sessions/{id}/qr-challenges`                   | `AttendanceController_openChallenge_v1`                 | `json`       |
| `dashboard`           | audit              | `GET`   | `/api/v1/audit-events`                                  | `AuditController_list_v1`                               | `json`       |
| `dashboard`           | audit              | `GET`   | `/api/v1/audit-events/{id}`                             | `AuditController_read_v1`                               | `json`       |
| `dashboard`           | branches           | `GET`   | `/api/v1/branches`                                      | `BranchesController_list_v1`                            | `json`       |
| `dashboard`           | branches           | `POST`  | `/api/v1/branches`                                      | `BranchesController_create_v1`                          | `json`       |
| `dashboard`           | branches           | `GET`   | `/api/v1/branches/{id}`                                 | `BranchesController_read_v1`                            | `json`       |
| `dashboard`           | branches           | `PATCH` | `/api/v1/branches/{id}`                                 | `BranchesController_update_v1`                          | `json`       |
| `dashboard`           | business-accounts  | `GET`   | `/api/v1/business-accounts`                             | `BusinessAccountsController_list_v1`                    | `json`       |
| `dashboard`           | business-accounts  | `POST`  | `/api/v1/business-accounts`                             | `BusinessAccountsController_create_v1`                  | `json`       |
| `dashboard`           | business-accounts  | `GET`   | `/api/v1/business-accounts/{id}`                        | `BusinessAccountsController_read_v1`                    | `json`       |
| `dashboard`           | business-accounts  | `PATCH` | `/api/v1/business-accounts/{id}`                        | `BusinessAccountsController_update_v1`                  | `json`       |
| `dashboard`           | business-accounts  | `PUT`   | `/api/v1/business-accounts/{id}/contacts`               | `BusinessAccountsController_replaceContacts_v1`         | `json`       |
| `dashboard`           | business-accounts  | `GET`   | `/api/v1/business-accounts/contact-candidates`          | `BusinessAccountsController_contactCandidates_v1`       | `json`       |
| `dashboard`           | certificate-rules  | `GET`   | `/api/v1/certificate-rules`                             | `CertificateRulesController_list_v1`                    | `json`       |
| `dashboard`           | certificate-rules  | `POST`  | `/api/v1/certificate-rules`                             | `CertificateRulesController_create_v1`                  | `json`       |
| `dashboard`           | certificates       | `GET`   | `/api/v1/certificates`                                  | `CertificatesController_list_v1`                        | `json`       |
| `dashboard`           | certificates       | `GET`   | `/api/v1/certificates/{id}`                             | `CertificatesController_read_v1`                        | `json`       |
| `dashboard`           | certificates       | `POST`  | `/api/v1/certificates/{id}/collect`                     | `CertificatesController_collect_v1`                     | `json`       |
| `dashboard`           | certificates       | `GET`   | `/api/v1/certificates/{id}/download`                    | `CertificatesController_download_v1`                    | `json`       |
| `dashboard`           | certificates       | `POST`  | `/api/v1/certificates/{id}/file`                        | `CertificatesController_upload_v1`                      | `json`       |
| `dashboard`           | certificates       | `POST`  | `/api/v1/certificates/{id}/print`                       | `CertificatesController_print_v1`                       | `json`       |
| `dashboard`           | certificates       | `POST`  | `/api/v1/certificates/{id}/ready`                       | `CertificatesController_ready_v1`                       | `json`       |
| `dashboard`           | certificates       | `POST`  | `/api/v1/certificates/{id}/reissue`                     | `CertificatesController_reissue_v1`                     | `json`       |
| `dashboard`           | certificates       | `POST`  | `/api/v1/certificates/{id}/revoke`                      | `CertificatesController_revoke_v1`                      | `json`       |
| `dashboard`           | certificates       | `GET`   | `/api/v1/certificates/enrollments/{id}/eligibility`     | `CertificatesController_eligibility_v1`                 | `json`       |
| `dashboard`           | certificates       | `GET`   | `/api/v1/certificates/enrollments/{id}/evaluations`     | `CertificatesController_evaluations_v1`                 | `json`       |
| `dashboard`           | certificates       | `POST`  | `/api/v1/certificates/evaluate`                         | `CertificatesController_evaluate_v1`                    | `json`       |
| `dashboard`           | certificates       | `POST`  | `/api/v1/certificates/issue`                            | `CertificatesController_issue_v1`                       | `json`       |
| `dashboard`           | crm                | `GET`   | `/api/v1/lead-stages`                                   | `LeadStagesController_list_v1`                          | `json`       |
| `dashboard`           | crm                | `POST`  | `/api/v1/lead-stages`                                   | `LeadStagesController_create_v1`                        | `json`       |
| `dashboard`           | crm                | `PATCH` | `/api/v1/lead-stages/{id}`                              | `LeadStagesController_update_v1`                        | `json`       |
| `dashboard`           | crm                | `GET`   | `/api/v1/leads`                                         | `LeadsController_list_v1`                               | `json`       |
| `dashboard`           | crm                | `POST`  | `/api/v1/leads`                                         | `LeadsController_create_v1`                             | `json`       |
| `dashboard`           | crm                | `GET`   | `/api/v1/leads/{id}`                                    | `LeadsController_read_v1`                               | `json`       |
| `dashboard`           | crm                | `PATCH` | `/api/v1/leads/{id}`                                    | `LeadsController_update_v1`                             | `json`       |
| `dashboard`           | crm                | `POST`  | `/api/v1/leads/{id}/activities`                         | `LeadsController_addActivity_v1`                        | `json`       |
| `dashboard`           | crm                | `POST`  | `/api/v1/leads/{id}/assign`                             | `LeadsController_assign_v1`                             | `json`       |
| `dashboard`           | crm                | `POST`  | `/api/v1/leads/{id}/claim`                              | `LeadsController_claim_v1`                              | `json`       |
| `dashboard`           | crm                | `POST`  | `/api/v1/leads/{id}/disqualify`                         | `LeadsController_disqualify_v1`                         | `json`       |
| `dashboard`           | crm                | `POST`  | `/api/v1/leads/{id}/lose`                               | `LeadsController_lose_v1`                               | `json`       |
| `dashboard`           | crm                | `POST`  | `/api/v1/leads/{id}/open`                               | `LeadsController_open_v1`                               | `json`       |
| `dashboard`           | crm                | `POST`  | `/api/v1/leads/{id}/qualify`                            | `LeadsController_qualify_v1`                            | `json`       |
| `dashboard`           | crm                | `POST`  | `/api/v1/leads/{id}/reopen`                             | `LeadsController_reopen_v1`                             | `json`       |
| `dashboard`           | crm                | `POST`  | `/api/v1/leads/{id}/win`                                | `LeadsController_win_v1`                                | `json`       |
| `dashboard`           | crm                | `GET`   | `/api/v1/leads/assignees`                               | `LeadsController_assignees_v1`                          | `json`       |
| `dashboard`           | dashboard          | `GET`   | `/api/v1/dashboard/overview`                            | `DashboardController_overview_v1`                       | `json`       |
| `dashboard`           | dashboard          | `GET`   | `/api/v1/dashboard/sales`                               | `SalesDashboardController_overview_v1`                  | `json`       |
| `dashboard`           | dashboard          | `GET`   | `/api/v1/dashboard/workspaces/{role}`                   | `WorkspaceOverviewController_overview_v1`               | `json`       |
| `dashboard`           | enrollment         | `POST`  | `/api/v1/enrollment-cancellation-requests/{id}/approve` | `EnrollmentCancellationController_approve_v1`           | `json`       |
| `dashboard`           | enrollment         | `POST`  | `/api/v1/enrollment-cancellation-requests/{id}/reject`  | `EnrollmentCancellationController_reject_v1`            | `json`       |
| `dashboard`           | enrollment         | `GET`   | `/api/v1/enrollments`                                   | `EnrollmentController_list_v1`                          | `json`       |
| `dashboard`           | enrollment         | `POST`  | `/api/v1/enrollments`                                   | `EnrollmentController_create_v1`                        | `json`       |
| `dashboard`           | enrollment         | `GET`   | `/api/v1/enrollments/{id}`                              | `EnrollmentController_read_v1`                          | `json`       |
| `dashboard`           | enrollment         | `POST`  | `/api/v1/enrollments/{id}/activate`                     | `EnrollmentController_activate_v1`                      | `json`       |
| `dashboard`           | enrollment         | `POST`  | `/api/v1/enrollments/{id}/cancellation-requests`        | `EnrollmentController_requestCancellation_v1`           | `json`       |
| `dashboard`           | enrollment         | `POST`  | `/api/v1/enrollments/{id}/complete`                     | `EnrollmentController_complete_v1`                      | `json`       |
| `dashboard`           | enrollment         | `POST`  | `/api/v1/enrollments/{id}/postpone`                     | `EnrollmentController_postpone_v1`                      | `json`       |
| `dashboard`           | enrollment         | `POST`  | `/api/v1/enrollments/{id}/reject`                       | `EnrollmentController_reject_v1`                        | `json`       |
| `dashboard`           | enrollment         | `POST`  | `/api/v1/enrollments/{id}/resume`                       | `EnrollmentController_resume_v1`                        | `json`       |
| `dashboard`           | enrollment         | `POST`  | `/api/v1/enrollments/{id}/retakes`                      | `EnrollmentController_requestRetake_v1`                 | `json`       |
| `dashboard`           | enrollment         | `POST`  | `/api/v1/enrollments/{id}/submit`                       | `EnrollmentController_submit_v1`                        | `json`       |
| `dashboard`           | enrollment         | `POST`  | `/api/v1/enrollments/{id}/transfer`                     | `EnrollmentController_transfer_v1`                      | `json`       |
| `dashboard`           | enrollment         | `POST`  | `/api/v1/module-retakes/{id}/approve`                   | `ModuleRetakesController_approve_v1`                    | `json`       |
| `dashboard`           | enrollment         | `POST`  | `/api/v1/module-retakes/{id}/reject`                    | `ModuleRetakesController_reject_v1`                     | `json`       |
| `dashboard`           | finance            | `GET`   | `/api/v1/billing-accounts/{id}/finance-summary`         | `FinanceController_billingSummary_v1`                   | `json`       |
| `dashboard`           | finance            | `GET`   | `/api/v1/enrollments/{id}/finance-summary`              | `FinanceController_enrollmentSummary_v1`                | `json`       |
| `dashboard`           | finance            | `GET`   | `/api/v1/enrollments/{id}/installments`                 | `FinanceInstallmentController_list_v1`                  | `json`       |
| `dashboard`           | finance            | `GET`   | `/api/v1/finance/reports/aging`                         | `FinanceController_aging_v1`                            | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/installments/{id}/paymob-checkout`             | `FinanceController_createPaymobCheckout_v1`             | `json`       |
| `dashboard`           | finance            | `GET`   | `/api/v1/invoices`                                      | `FinanceController_invoices_v1`                         | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/invoices`                                      | `FinanceController_createInvoice_v1`                    | `json`       |
| `dashboard`           | finance            | `GET`   | `/api/v1/invoices/{id}`                                 | `FinanceController_invoice_v1`                          | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/invoices/{id}/cancel`                          | `FinanceController_cancelInvoice_v1`                    | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/invoices/{id}/credit-notes`                    | `FinanceController_createCreditNote_v1`                 | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/invoices/{id}/issue`                           | `FinanceController_issueInvoice_v1`                     | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/invoices/{id}/void`                            | `FinanceController_voidInvoice_v1`                      | `json`       |
| `dashboard`           | finance            | `GET`   | `/api/v1/invoices/eligible-ledger-entries`              | `FinanceController_eligibleInvoiceEntries_v1`           | `json`       |
| `dashboard`           | finance            | `GET`   | `/api/v1/payment-gateway-attempts/{id}`                 | `FinanceController_paymobCheckoutStatus_v1`             | `json`       |
| `dashboard`           | finance            | `GET`   | `/api/v1/payment-methods`                               | `FinanceController_paymentMethods_v1`                   | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/payment-reversal-requests/{id}/approve`        | `FinanceController_approveReversal_v1`                  | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/payment-reversal-requests/{id}/reject`         | `FinanceRequestDecisionController_rejectReversal_v1`    | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/payment-reversal-requests/{id}/withdraw`       | `FinanceRequestDecisionController_withdrawReversal_v1`  | `json`       |
| `dashboard`           | finance            | `GET`   | `/api/v1/payments`                                      | `FinanceController_payments_v1`                         | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/payments`                                      | `FinanceController_createPayment_v1`                    | `json`       |
| `dashboard`           | finance            | `GET`   | `/api/v1/payments/{id}`                                 | `FinanceController_payment_v1`                          | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/payments/{id}/post`                            | `FinanceController_postPayment_v1`                      | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/payments/{id}/receipt`                         | `FinanceController_issueReceipt_v1`                     | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/payments/{id}/refund-requests`                 | `FinanceController_requestRefund_v1`                    | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/payments/{id}/reject`                          | `FinanceController_rejectPayment_v1`                    | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/payments/{id}/reversal-requests`               | `FinanceController_requestReversal_v1`                  | `json`       |
| `dashboard`           | finance            | `GET`   | `/api/v1/payments/method-mix`                           | `FinanceController_paymentMethodMix_v1`                 | `json`       |
| `dashboard`           | finance            | `GET`   | `/api/v1/receipts`                                      | `FinanceController_receipts_v1`                         | `json`       |
| `dashboard`           | finance            | `GET`   | `/api/v1/receipts/{id}`                                 | `FinanceController_receipt_v1`                          | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/refund-requests/{id}/approve`                  | `FinanceController_approveRefund_v1`                    | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/refund-requests/{id}/reject`                   | `FinanceRequestDecisionController_rejectRefund_v1`      | `json`       |
| `dashboard`           | finance            | `POST`  | `/api/v1/refund-requests/{id}/withdraw`                 | `FinanceRequestDecisionController_withdrawRefund_v1`    | `json`       |
| `dashboard`           | identity           | `POST`  | `/api/v1/auth/logout`                                   | `AuthController_logout_v1`                              | `no-content` |
| `dashboard`           | identity           | `GET`   | `/api/v1/auth/me`                                       | `AuthController_me_v1`                                  | `json`       |
| `dashboard`           | identity           | `POST`  | `/api/v1/auth/me/onboarding/complete`                   | `AuthController_completeOnboarding_v1`                  | `json`       |
| `dashboard`           | identity           | `PATCH` | `/api/v1/auth/me/preferences`                           | `AuthController_updatePreferences_v1`                   | `json`       |
| `dashboard`           | identity           | `POST`  | `/api/v1/auth/mfa/recovery-codes/regenerate`            | `MfaController_regenerateRecoveryCodes_v1`              | `json`       |
| `dashboard`           | identity           | `POST`  | `/api/v1/auth/mfa/step-up`                              | `MfaController_stepUp_v1`                               | `json`       |
| `dashboard`           | identity           | `POST`  | `/api/v1/auth/mfa/totp/{factorId}/verify`               | `MfaController_verify_v1`                               | `json`       |
| `dashboard`           | identity           | `POST`  | `/api/v1/auth/mfa/totp/enroll`                          | `MfaController_enroll_v1`                               | `json`       |
| `dashboard`           | identity           | `POST`  | `/api/v1/auth/password/change`                          | `AuthController_changePassword_v1`                      | `no-content` |
| `dashboard`           | imports            | `GET`   | `/api/v1/imports/batches`                               | `ImportsController_list_v1`                             | `json`       |
| `dashboard`           | imports            | `POST`  | `/api/v1/imports/batches`                               | `ImportsController_stage_v1`                            | `json`       |
| `dashboard`           | imports            | `GET`   | `/api/v1/imports/batches/{id}`                          | `ImportsController_detail_v1`                           | `json`       |
| `dashboard`           | imports            | `POST`  | `/api/v1/imports/batches/{id}/archive-quarantined`      | `ImportsController_archiveQuarantined_v1`               | `json`       |
| `dashboard`           | imports            | `POST`  | `/api/v1/imports/batches/{id}/finalize`                 | `ImportsController_finalize_v1`                         | `json`       |
| `dashboard`           | imports            | `GET`   | `/api/v1/imports/batches/{id}/issues`                   | `ImportsController_issues_v1`                           | `json`       |
| `dashboard`           | imports            | `PATCH` | `/api/v1/imports/batches/{id}/issues/{issueId}`         | `ImportsController_resolveIssue_v1`                     | `json`       |
| `dashboard`           | imports            | `POST`  | `/api/v1/imports/batches/{id}/promote-ready`            | `ImportsController_promote_v1`                          | `json`       |
| `dashboard`           | imports            | `POST`  | `/api/v1/imports/batches/{id}/reconcile`                | `ImportsController_reconcile_v1`                        | `json`       |
| `dashboard`           | imports            | `POST`  | `/api/v1/imports/batches/{id}/validate`                 | `ImportsController_validate_v1`                         | `json`       |
| `dashboard`           | imports            | `GET`   | `/api/v1/legacy-archive`                                | `LegacyArchiveController_list_v1`                       | `json`       |
| `dashboard`           | imports            | `GET`   | `/api/v1/legacy-archive/{id}`                           | `LegacyArchiveController_read_v1`                       | `json`       |
| `dashboard`           | messaging          | `GET`   | `/api/v1/messaging/otp-channel`                         | `OtpChannelController_read_v1`                          | `json`       |
| `dashboard`           | messaging          | `POST`  | `/api/v1/messaging/otp-channel/connect`                 | `OtpChannelController_connect_v1`                       | `json`       |
| `dashboard`           | messaging          | `POST`  | `/api/v1/messaging/otp-channel/disable`                 | `OtpChannelController_disable_v1`                       | `json`       |
| `dashboard`           | messaging          | `GET`   | `/api/v1/messaging/otp-channel/pairing-code`            | `OtpChannelController_pairingCode_v1`                   | `json`       |
| `dashboard`           | messaging          | `POST`  | `/api/v1/messaging/otp-channel/reset`                   | `OtpChannelController_reset_v1`                         | `json`       |
| `dashboard`           | pricing            | `PUT`   | `/api/v1/installment-schedules/{id}`                    | `PricingController_updateSchedule_v1`                   | `json`       |
| `dashboard`           | pricing            | `POST`  | `/api/v1/installment-schedules/{id}/approve`            | `PricingController_approveSchedule_v1`                  | `json`       |
| `dashboard`           | pricing            | `GET`   | `/api/v1/pricing-agreements`                            | `PricingController_list_v1`                             | `json`       |
| `dashboard`           | pricing            | `POST`  | `/api/v1/pricing-agreements`                            | `PricingController_create_v1`                           | `json`       |
| `dashboard`           | pricing            | `GET`   | `/api/v1/pricing-agreements/{id}`                       | `PricingController_read_v1`                             | `json`       |
| `dashboard`           | pricing            | `PUT`   | `/api/v1/pricing-agreements/{id}`                       | `PricingController_update_v1`                           | `json`       |
| `dashboard`           | pricing            | `POST`  | `/api/v1/pricing-agreements/{id}/approve`               | `PricingController_approve_v1`                          | `json`       |
| `dashboard`           | pricing            | `POST`  | `/api/v1/pricing-agreements/{id}/installment-schedules` | `PricingController_createSchedule_v1`                   | `json`       |
| `dashboard`           | pricing            | `POST`  | `/api/v1/pricing-agreements/{id}/reject`                | `PricingController_reject_v1`                           | `json`       |
| `dashboard`           | pricing            | `POST`  | `/api/v1/pricing-agreements/{id}/submit`                | `PricingController_submit_v1`                           | `json`       |
| `dashboard`           | realtime           | `POST`  | `/api/v1/realtime/ticket`                               | `RealtimeTicketController_issue_v1`                     | `json`       |
| `dashboard`           | reports            | `GET`   | `/api/v1/reports/exports`                               | `ReportingController_listExports_v1`                    | `json`       |
| `dashboard`           | reports            | `GET`   | `/api/v1/reports/exports/{id}/download`                 | `ReportingController_downloadExport_v1`                 | `json`       |
| `dashboard`           | reports            | `GET`   | `/api/v1/reports/finance/receivables`                   | `ReportingController_financeReceivables_v1`             | `json`       |
| `dashboard`           | reports            | `POST`  | `/api/v1/reports/finance/receivables/exports`           | `ReportingController_createFinanceReceivablesExport_v1` | `json`       |
| `dashboard`           | reports            | `GET`   | `/api/v1/reports/operations/overview`                   | `ReportingController_operationsOverview_v1`             | `json`       |
| `dashboard`           | roles              | `GET`   | `/api/v1/roles`                                         | `RolesController_list_v1`                               | `json`       |
| `dashboard`           | roles              | `POST`  | `/api/v1/roles`                                         | `RolesController_create_v1`                             | `json`       |
| `dashboard`           | roles              | `GET`   | `/api/v1/roles/{id}`                                    | `RolesController_read_v1`                               | `json`       |
| `dashboard`           | roles              | `PATCH` | `/api/v1/roles/{id}`                                    | `RolesController_update_v1`                             | `json`       |
| `dashboard`           | roles              | `PUT`   | `/api/v1/roles/{id}/grants`                             | `RolesController_replaceGrants_v1`                      | `json`       |
| `dashboard`           | students           | `GET`   | `/api/v1/student-registrations`                         | `StudentRegistrationController_list_v1`                 | `json`       |
| `dashboard`           | students           | `GET`   | `/api/v1/student-registrations/{id}`                    | `StudentRegistrationController_getOne_v1`               | `json`       |
| `dashboard`           | students           | `POST`  | `/api/v1/student-registrations/{id}/approve`            | `StudentRegistrationController_approve_v1`              | `json`       |
| `dashboard`           | students           | `POST`  | `/api/v1/student-registrations/{id}/reject`             | `StudentRegistrationController_reject_v1`               | `json`       |
| `dashboard`           | students           | `GET`   | `/api/v1/students`                                      | `StudentsController_list_v1`                            | `json`       |
| `dashboard`           | students           | `POST`  | `/api/v1/students`                                      | `StudentsController_create_v1`                          | `json`       |
| `dashboard`           | students           | `GET`   | `/api/v1/students/{id}`                                 | `StudentsController_read_v1`                            | `json`       |
| `dashboard`           | students           | `PATCH` | `/api/v1/students/{id}`                                 | `StudentsController_update_v1`                          | `json`       |
| `dashboard`           | students           | `PUT`   | `/api/v1/students/{id}/contacts`                        | `StudentsController_replaceContacts_v1`                 | `json`       |
| `dashboard`           | students           | `POST`  | `/api/v1/students/{id}/merge`                           | `StudentsController_merge_v1`                           | `json`       |
| `dashboard`           | students           | `POST`  | `/api/v1/students/match-candidates`                     | `StudentsController_match_v1`                           | `json`       |
| `dashboard`           | users              | `GET`   | `/api/v1/users`                                         | `UsersController_list_v1`                               | `json`       |
| `dashboard`           | users              | `POST`  | `/api/v1/users`                                         | `UsersController_create_v1`                             | `json`       |
| `dashboard`           | users              | `GET`   | `/api/v1/users/{id}`                                    | `UsersController_read_v1`                               | `json`       |
| `dashboard`           | users              | `PUT`   | `/api/v1/users/{id}/branches`                           | `UsersController_replaceBranches_v1`                    | `json`       |
| `dashboard`           | users              | `PUT`   | `/api/v1/users/{id}/roles`                              | `UsersController_replaceRoles_v1`                       | `json`       |
| `dashboard`           | users              | `PATCH` | `/api/v1/users/{id}/status`                             | `UsersController_updateStatus_v1`                       | `json`       |
| `dashboard`           | workspace          | `GET`   | `/api/v1/notifications`                                 | `NotificationsController_list_v1`                       | `json`       |
| `dashboard`           | workspace          | `POST`  | `/api/v1/notifications/{id}/read`                       | `NotificationsController_markRead_v1`                   | `no-content` |
| `dashboard`           | workspace          | `POST`  | `/api/v1/notifications/read-all`                        | `NotificationsController_markAllRead_v1`                | `no-content` |
| `dashboard`           | workspace          | `GET`   | `/api/v1/search`                                        | `SearchController_list_v1`                              | `json`       |
| `dashboard`           | workspace          | `POST`  | `/api/v1/search/recent`                                 | `SearchController_recordRecent_v1`                      | `no-content` |
| `infrastructure`      | platform           | `GET`   | `/api/v1/health/live`                                   | `HealthController_live_v1`                              | `json`       |
| `infrastructure`      | platform           | `GET`   | `/api/v1/health/ready`                                  | `HealthController_ready_v1`                             | `json`       |
| `integration`         | finance            | `POST`  | `/api/v1/webhooks/paymob/transaction`                   | `FinanceController_handlePaymobWebhook_v1`              | `json`       |
| `public-auth`         | identity           | `POST`  | `/api/v1/auth/login`                                    | `AuthController_login_v1`                               | `json`       |
| `public-auth`         | identity           | `POST`  | `/api/v1/auth/password/reset/complete`                  | `AuthController_completePasswordReset_v1`               | `no-content` |
| `public-auth`         | identity           | `POST`  | `/api/v1/auth/password/reset/request`                   | `AuthController_requestPasswordReset_v1`                | `json`       |
| `public-auth`         | identity           | `POST`  | `/api/v1/auth/phone-otp/request`                        | `PhoneOtpController_request_v1`                         | `json`       |
| `public-auth`         | identity           | `POST`  | `/api/v1/auth/phone-otp/verify`                         | `PhoneOtpController_verify_v1`                          | `json`       |
| `public-registration` | students           | `POST`  | `/api/v1/student-registrations`                         | `StudentRegistrationController_register_v1`             | `json`       |
| `public-verification` | certificates       | `GET`   | `/api/v1/certificates/verify/{token}`                   | `CertificatesController_verify_v1`                      | `json`       |
