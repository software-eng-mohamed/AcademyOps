import { describe, expect, it } from 'vitest';
import { migrationContractSql as migration } from './migration-contract.fixture';

const {
  initial: sql,
  financeGuards: financeGuardsSql,
  invoiceGuards: invoiceGuardsSql,
  cancellationGuards: cancellationGuardsSql,
  mfaRecovery: mfaRecoverySql,
  certificateGate: certificateGateSql,
  paymob: paymobSql,
  iamAdministration: iamAdministrationSql,
  lastOwnerClockFix: lastOwnerClockFixSql,
  passwordReset: passwordResetSql,
  academicCatalog: academicCatalogSql,
  academicSessionGuards: academicSessionGuardsSql,
  programVersionStateGuard: programVersionStateGuardSql,
  peopleBusinessGuards: peopleBusinessGuardsSql,
  crmLeadGuards: crmLeadGuardsSql,
  enrollmentLifecycleGuards: enrollmentLifecycleGuardsSql,
  domainTransitionGuards: domainTransitionGuardsSql,
  pricingScheduleLifecycle: pricingScheduleLifecycleSql,
  triggerReturnFix: triggerReturnFixSql,
  attendanceOperations: attendanceOperationsSql,
  certificateCompletion: certificateCompletionSql,
  certificateResponsibleUpload: certificateResponsibleUploadSql,
  reportingExports: reportingExportsSql,
  certificateUploadAttempts: certificateUploadAttemptsSql,
  entityNamesEnglishOnly: entityNamesEnglishOnlySql,
} = migration;

describe('PostgreSQL migration contract', () => {
  it.each([
    'sessions_room_no_overlap',
    'session_trainers_no_overlap',
    'enrollment_active_cohort_key',
    'ledger_allocation_guard',
    'refund_total_guard',
    'ledger_entries_append_only',
    'certificates_active_enrollment_key',
    'user_login_identifiers_active_key',
  ])('contains %s', (constraint) => {
    expect(sql).toContain(constraint);
  });

  it('enforces composite tenant foreign keys', () => {
    expect(sql).toContain('FOREIGN KEY ("organization_id", "student_person_id")');
    expect(sql).toContain('REFERENCES "persons"("organization_id", "id")');
  });

  it('keeps the English entity name and removes both legacy localized columns', () => {
    for (const table of [
      'organizations',
      'branches',
      'rooms',
      'persons',
      'programs',
      'modules',
      'lead_stages',
      'payment_methods',
    ]) {
      expect(entityNamesEnglishOnlySql).toContain(
        `ALTER TABLE "${table}" RENAME COLUMN "name_${'en'}" TO "name"`,
      );
      expect(entityNamesEnglishOnlySql).toContain(
        `ALTER TABLE "${table}" DROP COLUMN "name_${'ar'}"`,
      );
    }
  });

  it('allows only one open reversal or refund request per payment', () => {
    expect(financeGuardsSql).toContain('payment_reversal_requests_one_open_per_payment');
    expect(financeGuardsSql).toContain('refund_requests_one_open_per_payment');
    expect(financeGuardsSql.match(/WHERE status = 'REQUESTED'/g)).toHaveLength(2);
  });

  it('makes issued invoice lines immutable and guards credit-note totals', () => {
    expect(invoiceGuardsSql).toContain('invoice_lines_issued_guard');
    expect(invoiceGuardsSql).toContain('credit_note_total_guard');
    expect(invoiceGuardsSql).toContain('Credit notes exceed invoice total');
  });

  it('enforces one open cancellation request and maker-checker approval', () => {
    expect(cancellationGuardsSql).toContain('enrollment_cancellation_requests_one_open');
    expect(cancellationGuardsSql).toContain("status = 'REQUESTED'");
    expect(cancellationGuardsSql).toContain('decided_by <> requested_by');
  });

  it('stores only unique recovery-code hashes behind a composite tenant FK', () => {
    expect(mfaRecoverySql).toContain('mfa_recovery_codes_code_hash_key');
    expect(mfaRecoverySql).toContain('FOREIGN KEY (organization_id, user_id)');
    expect(mfaRecoverySql).toContain('REFERENCES users (organization_id, id)');
  });

  it('enforces the approved 80 percent certificate threshold', () => {
    expect(certificateGateSql).toContain('certificate_rules_minimum_80_check');
    expect(certificateGateSql).toContain('minimum_ratio >= 0.8000');
  });

  it('protects Paymob installment attempts with tenant FKs and idempotency constraints', () => {
    expect(paymobSql).toContain('payment_gateway_attempts_one_active_installment');
    expect(paymobSql).toContain('payment_gateway_attempts_idempotency_key');
    expect(paymobSql).toContain('payment_gateway_events_provider_event_key');
    expect(paymobSql).toContain('plg_validate_gateway_attempt');
    expect(paymobSql).toContain('payment_gateway_events_append_only');
  });

  it('protects IAM versions, active assignments, and the last Owner', () => {
    expect(iamAdministrationSql).toContain('user_role_assignments_active_key');
    expect(iamAdministrationSql).toContain('role_permission_grants_scope_check');
    expect(iamAdministrationSql).toContain('protect_last_active_owner');
    expect(iamAdministrationSql).toContain('last_active_owner_required');
    expect(iamAdministrationSql).toContain('must_change_password');
    expect(lastOwnerClockFixSql).toContain('clock_timestamp()');
    expect(lastOwnerClockFixSql).toContain('last_active_owner_required');
  });

  it('stores one live hashed reset token and keeps its identity immutable', () => {
    expect(passwordResetSql).toContain('password_reset_tokens_token_hash_key');
    expect(passwordResetSql).toContain('password_reset_tokens_one_live_user');
    expect(passwordResetSql).toContain('password_reset_tokens_immutable_identity');
    expect(passwordResetSql).toContain('FOREIGN KEY (organization_id, user_id)');
  });

  it('protects published curricula and requires published versions for active cohorts', () => {
    expect(academicCatalogSql).toContain('program_versions_one_draft');
    expect(academicCatalogSql).toContain('program_version_modules_draft_only_guard');
    expect(academicCatalogSql).toContain('Published program curriculum is immutable');
    expect(academicCatalogSql).toContain('cohorts_published_program_guard');
    expect(academicCatalogSql).toContain('cohort_published_program_required');
  });

  it('keeps sessions, cohort modules, rooms, and trainer timeslots consistent', () => {
    expect(academicSessionGuardsSql).toContain('session_cohort_module_match');
    expect(academicSessionGuardsSql).toContain('session_room_branch_match');
    expect(academicSessionGuardsSql).toContain('session_trainer_active');
    expect(academicSessionGuardsSql).toContain('session_trainer_timeslot_match');
    expect(academicSessionGuardsSql).toContain('sessions_sync_trainer_timeslots');
  });

  it('prevents published or archived program versions from regressing state', () => {
    expect(programVersionStateGuardSql).toContain('program_version_state_transition');
    expect(programVersionStateGuardSql).toContain('cannot return to draft');
    expect(programVersionStateGuardSql).toContain('cannot change state');
  });

  it('protects person contacts and gives each payer one billing account', () => {
    expect(peopleBusinessGuardsSql).toContain('person_contacts_one_primary');
    expect(peopleBusinessGuardsSql).toContain('person_contacts_value_per_person');
    expect(peopleBusinessGuardsSql).toContain('billing_accounts_individual_owner_key');
    expect(peopleBusinessGuardsSql).toContain('billing_accounts_corporate_owner_key');
    expect(peopleBusinessGuardsSql).toContain('business_accounts_branch_fk');
  });

  it('constrains lead states and keeps CRM history append-only', () => {
    expect(crmLeadGuardsSql).toContain('leads_state_check');
    expect(crmLeadGuardsSql).toContain('lead_activities_append_only');
    expect(crmLeadGuardsSql).toContain('lead_status_history_append_only');
    expect(crmLeadGuardsSql).toContain('lead_conversions_append_only');
  });

  it('guards enrollment ownership, assignment history, transitions, and retakes', () => {
    expect(enrollmentLifecycleGuardsSql).toContain('enrollment_individual_billing_owner');
    expect(enrollmentLifecycleGuardsSql).toContain('enrollment_assignment_program_match');
    expect(enrollmentLifecycleGuardsSql).toContain('enrollment_state_transition');
    expect(enrollmentLifecycleGuardsSql).toContain('enrollment_cohort_assignments_history_guard');
    expect(enrollmentLifecycleGuardsSql).toContain('module_retakes_one_open');
    expect(enrollmentLifecycleGuardsSql).toContain('module_retake_target_match');
  });

  it('enforces initial states and legal lifecycle transitions in PostgreSQL', () => {
    expect(domainTransitionGuardsSql).toContain('program_version_initial_state');
    expect(domainTransitionGuardsSql).toContain('program_version_curriculum_required');
    expect(domainTransitionGuardsSql).toContain('cohort_state_transition');
    expect(domainTransitionGuardsSql).toContain('lead_state_transition');
    expect(domainTransitionGuardsSql).toContain('module_retake_state_transition');
    expect(domainTransitionGuardsSql).toContain('business_account_active_enrollment');
  });

  it('locks submitted pricing and approved installment schedules', () => {
    expect(pricingScheduleLifecycleSql).toContain('pricing_agreement_lifecycle_guard');
    expect(pricingScheduleLifecycleSql).toContain('pricing_line_draft_guard');
    expect(pricingScheduleLifecycleSql).toContain('installment_schedule_lifecycle_guard');
    expect(pricingScheduleLifecycleSql).toContain('pricing agreement must be approved first');
    expect(pricingScheduleLifecycleSql).toContain(
      'installments are immutable after schedule approval',
    );
    expect(triggerReturnFixSql).toContain('target_schedule_id');
    expect(triggerReturnFixSql).toContain('RETURN NULL');
  });

  it('enforces roster attendance, versioned policies, anomalies, and makeup integrity', () => {
    expect(attendanceOperationsSql).toContain('attendance_policy_versions_no_overlap');
    expect(attendanceOperationsSql).toContain('attendance_policy_versions_scope_version_key');
    expect(attendanceOperationsSql).toContain('attendance_roster_membership');
    expect(attendanceOperationsSql).toContain('attendance_record_event_required');
    expect(attendanceOperationsSql).toContain('makeup_credit_valid');
    expect(attendanceOperationsSql).toContain('attendance_anomalies_append_only');
    expect(attendanceOperationsSql).toContain('sessions_attendance_maintenance_idx');
  });

  it('hard-gates certificate issue and protects rules, PDFs, and lifecycle transitions', () => {
    expect(certificateCompletionSql).toContain('certificate_rule_versions_no_overlap');
    expect(certificateCompletionSql).toContain('eligibility_evaluations_append_only');
    expect(certificateCompletionSql).toContain('certificate_issue_gate');
    expect(certificateCompletionSql).toContain('attendance_numerator');
    expect(certificateCompletionSql).toContain('outstanding > 0');
    expect(certificateCompletionSql).toContain('certificate_fulfillment_transition');
    expect(certificateCompletionSql).toContain('certificate_pdf_transition');
    expect(certificateCompletionSql).toContain('file_assets_append_only');
    expect(certificateResponsibleUploadSql).toContain(
      "pdf_status IN ('PENDING_UPLOAD', 'AVAILABLE')",
    );
    expect(certificateResponsibleUploadSql).toContain('certificate_file_replacement_guard');
    expect(certificateResponsibleUploadSql).toContain('certificate_file_required_for_print');
    expect(certificateResponsibleUploadSql).toContain("'PDF_UPLOADED'");
    expect(certificateResponsibleUploadSql).toContain("'PDF_REPLACED'");
    expect(certificateUploadAttemptsSql).toContain('certificate_upload_attempt_identity_immutable');
    expect(certificateUploadAttemptsSql).toContain('certificate_upload_attempt_transition');
    expect(certificateUploadAttemptsSql).toContain("OLD.status <> 'PENDING'");
    expect(certificateUploadAttemptsSql).toContain("WHERE status = 'PENDING'");
    expect(certificateUploadAttemptsSql).not.toContain(
      'DROP TRIGGER IF EXISTS file_assets_append_only',
    );
  });

  it('keeps report exports scoped, versioned, private, and state constrained', () => {
    expect(reportingExportsSql).toContain('report_export_jobs_requested_by_fk');
    expect(reportingExportsSql).toContain('report_export_jobs_file_asset_fk');
    expect(reportingExportsSql).toContain('report_export_jobs_state_fields_check');
    expect(reportingExportsSql).toContain('report_export_jobs_state_transition');
    expect(reportingExportsSql).toContain('report_export_jobs_no_delete');
    expect(reportingExportsSql).toContain('report_export_jobs_queue_idx');
  });
});
