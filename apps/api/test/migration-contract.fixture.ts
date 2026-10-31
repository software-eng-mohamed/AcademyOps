import { readFileSync } from 'node:fs';

function migrationSql(directory: string): string {
  return readFileSync(
    new URL(`../prisma/migrations/${directory}/migration.sql`, import.meta.url),
    'utf8',
  );
}

export const migrationContractSql = {
  initial: migrationSql('202608090001_initial'),
  financeGuards: migrationSql('202608090004_request_status_guards'),
  invoiceGuards: migrationSql('202608090005_invoice_credit_note_guards'),
  cancellationGuards: migrationSql('202608090006_enrollment_cancellation_requests'),
  mfaRecovery: migrationSql('202608090007_mfa_recovery_codes'),
  certificateGate: migrationSql('202608090008_certificate_80_paid_gate'),
  paymob: migrationSql('202608090009_paymob_installment_checkout'),
  iamAdministration: migrationSql('202608090010_iam_administration'),
  lastOwnerClockFix: migrationSql('202608090011_last_owner_clock_fix'),
  passwordReset: migrationSql('202608090012_password_reset_tokens'),
  academicCatalog: migrationSql('202608090013_academic_catalog_administration'),
  academicSessionGuards: migrationSql('202608090014_academic_session_guards'),
  programVersionStateGuard: migrationSql('202608090015_program_version_state_guard'),
  peopleBusinessGuards: migrationSql('202608090016_people_business_account_guards'),
  crmLeadGuards: migrationSql('202608090017_crm_lead_guards'),
  enrollmentLifecycleGuards: migrationSql('202608090018_enrollment_lifecycle_guards'),
  domainTransitionGuards: migrationSql('202608090019_domain_transition_guards'),
  pricingScheduleLifecycle: migrationSql('202608090020_pricing_schedule_lifecycle'),
  triggerReturnFix: migrationSql('202608090021_trigger_return_fix'),
  attendanceOperations: migrationSql('202608090022_attendance_operations'),
  certificateCompletion: migrationSql('202608090023_certificate_completion'),
  certificateResponsibleUpload: migrationSql('202608090024_certificate_responsible_upload'),
  reportingExports: migrationSql('202608090025_reporting_exports'),
  certificateUploadAttempts: migrationSql('202608150003_certificate_upload_attempts'),
  entityNamesEnglishOnly: migrationSql('202608310001_entity_names_english_only'),
} as const;
