-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Africa/Cairo',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "capacity" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "public_id" VARCHAR(30) NOT NULL,
    "name_ar" TEXT,
    "name_en" TEXT,
    "birth_date" DATE,
    "gender" VARCHAR(30),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "raw_value" TEXT NOT NULL,
    "normalized_value" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "person_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "portal_status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "employee_code" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    "biography_ar" TEXT,
    "biography_en" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trainer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_branch_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_branch_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "password_hash" TEXT,
    "preferred_locale" VARCHAR(5) NOT NULL DEFAULT 'ar',
    "password_changed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_login_identifiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "normalized_value" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_login_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "csrf_secret_hash" VARCHAR(128) NOT NULL,
    "ip_hash" VARCHAR(128),
    "user_agent_hash" VARCHAR(128),
    "mfa_verified_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_factors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "label" TEXT,
    "secret_cipher" TEXT,
    "credential_data" JSONB,
    "verified_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "code" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_code" VARCHAR(100) NOT NULL,
    "scope" CHAR(1) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permission_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "registration_no" TEXT,
    "tax_id" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "business_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_account_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "business_account_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "role" VARCHAR(80),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_account_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "person_id" UUID,
    "business_account_id" UUID,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'EGP',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "billing_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_stages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lead_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "assigned_user_id" UUID,
    "person_id" UUID,
    "stage_id" UUID,
    "state" VARCHAR(30) NOT NULL DEFAULT 'NEW',
    "source" VARCHAR(80),
    "next_action_at" TIMESTAMPTZ(6),
    "lost_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "from_state" VARCHAR(30),
    "to_state" VARCHAR(30) NOT NULL,
    "reason" TEXT,
    "actor_user_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_conversions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "converted_by" UUID NOT NULL,
    "converted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "effective_from" DATE,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "program_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_version_modules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "program_version_id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_version_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cohorts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "program_version_id" UUID NOT NULL,
    "owning_branch_id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "starts_on" DATE,
    "ends_on" DATE,
    "capacity" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cohorts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cohort_modules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "cohort_id" UUID NOT NULL,
    "program_version_module_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cohort_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "cohort_module_id" UUID NOT NULL,
    "cohort_id" UUID NOT NULL,
    "room_id" UUID,
    "ordinal" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "delivery_mode" VARCHAR(30) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "attendance_window_state" VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED',
    "attendance_locked_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_trainers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "role" VARCHAR(30) NOT NULL DEFAULT 'PRIMARY',
    "booking_status" VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "session_trainers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "student_person_id" UUID NOT NULL,
    "program_version_id" UUID NOT NULL,
    "billing_account_id" UUID NOT NULL,
    "home_branch_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'INDIVIDUAL',
    "state" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "activated_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_cohort_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "cohort_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_cohort_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "from_state" VARCHAR(30),
    "to_state" VARCHAR(30),
    "reason" TEXT,
    "actor_user_id" UUID NOT NULL,
    "data" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_retakes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "program_version_module_id" UUID NOT NULL,
    "target_cohort_module_id" UUID,
    "status" VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "module_retakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_agreements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "currency_code" CHAR(3) NOT NULL DEFAULT 'EGP',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "proposed_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pricing_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_agreement_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "pricing_agreement_id" UUID NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "description_ar" TEXT NOT NULL,
    "description_en" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_amount" DECIMAL(14,2) NOT NULL,
    "line_amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_agreement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "pricing_agreement_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "installment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "debit_entry_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "billing_account_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "direction" VARCHAR(10) NOT NULL,
    "entry_type" VARCHAR(40) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'EGP',
    "reversal_of_id" UUID,
    "source_type" VARCHAR(50) NOT NULL,
    "source_id" UUID NOT NULL,
    "description" TEXT,
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "credit_entry_id" UUID NOT NULL,
    "debit_entry_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "allocated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "verification_required" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "billing_account_id" UUID NOT NULL,
    "enrollment_id" UUID,
    "ledger_entry_id" UUID,
    "method_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'EGP',
    "external_reference" TEXT,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "posted_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "from_status" VARCHAR(30),
    "to_status" VARCHAR(30) NOT NULL,
    "reason" TEXT,
    "actor_user_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "document_type" VARCHAR(30) NOT NULL,
    "next_value" BIGINT NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "billing_account_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "fiscal_year" INTEGER,
    "serial_number" BIGINT,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'EGP',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "customer_snapshot" JSONB,
    "issued_at" TIMESTAMPTZ(6),
    "voided_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "internal_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "ledger_entry_id" UUID,
    "description_ar" TEXT NOT NULL,
    "description_en" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_amount" DECIMAL(14,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "billing_account_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "serial_number" BIGINT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'EGP',
    "payer_snapshot" JSONB NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "ledger_entry_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "serial_number" BIGINT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "issued_by" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
    "requested_amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reversal_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_reversal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "refund_request_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "ledger_entry_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "processed_by" UUID NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "operation" VARCHAR(80) NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "request_hash" VARCHAR(128) NOT NULL,
    "status_code" INTEGER,
    "response_body" JSONB,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_policy_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "program_version_id" UUID NOT NULL,
    "cohort_id" UUID,
    "version" INTEGER NOT NULL,
    "minimum_ratio" DECIMAL(5,4) NOT NULL DEFAULT 0.75,
    "lock_after_minutes" INTEGER NOT NULL DEFAULT 1440,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "nonce_digest" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "current_status" VARCHAR(30) NOT NULL DEFAULT 'UNMARKED',
    "source" VARCHAR(30) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "recorded_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "attendance_record_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "from_status" VARCHAR(30),
    "to_status" VARCHAR(30) NOT NULL,
    "reason" TEXT,
    "actor_user_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "makeup_credits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "missed_record_id" UUID NOT NULL,
    "makeup_record_id" UUID NOT NULL,
    "approved_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "makeup_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_rule_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "program_version_id" UUID NOT NULL,
    "cohort_id" UUID,
    "version" INTEGER NOT NULL,
    "minimum_ratio" DECIMAL(5,4) NOT NULL DEFAULT 0.75,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_rule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eligibility_evaluations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "rule_version_id" UUID NOT NULL,
    "attendance_ratio" DECIMAL(5,4),
    "academic_result" VARCHAR(30) NOT NULL,
    "financial_hold" BOOLEAN NOT NULL,
    "evidence_snapshot" JSONB NOT NULL,
    "evaluated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eligibility_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "classification" VARCHAR(30) NOT NULL DEFAULT 'PRIVATE',
    "scan_status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "supersedes_id" UUID,
    "serial" VARCHAR(80) NOT NULL,
    "verification_digest" VARCHAR(128) NOT NULL,
    "validity_status" VARCHAR(30) NOT NULL DEFAULT 'ISSUED',
    "fulfillment_status" VARCHAR(30) NOT NULL DEFAULT 'NOT_PRINTED',
    "pdf_status" VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
    "file_asset_id" UUID,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by" UUID NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "revocation_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "certificate_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "from_value" TEXT,
    "to_value" TEXT,
    "reason" TEXT,
    "actor_user_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'UPLOADED',
    "source_sha256" CHAR(64) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by" UUID NOT NULL,
    "finalized_at" TIMESTAMPTZ(6),
    "finalized_by" UUID,
    "reconciliation" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_source_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "stored_path" TEXT,
    "workbook_meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_source_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "source_file_id" UUID NOT NULL,
    "sheet_name" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "row_hash" CHAR(64) NOT NULL,
    "raw_values" JSONB NOT NULL,
    "normalized_values" JSONB,
    "disposition" VARCHAR(30) NOT NULL DEFAULT 'STAGED',
    "target_type" VARCHAR(50),
    "target_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_match_candidates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "import_row_id" UUID NOT NULL,
    "candidate_person_id" UUID,
    "score" DECIMAL(5,4) NOT NULL,
    "reasons" JSONB NOT NULL,
    "decision" VARCHAR(30),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_match_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_issues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "import_row_id" UUID,
    "batch_id" UUID NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "status" VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_reconciliations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "metric" VARCHAR(80) NOT NULL,
    "dimension" JSONB,
    "source_value" DECIMAL(18,2),
    "target_value" DECIMAL(18,2),
    "difference" DECIMAL(18,2),
    "passed" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_references" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "import_row_id" UUID NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "source_field" VARCHAR(80) NOT NULL,
    "raw_value" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_archive_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "source_file_id" UUID NOT NULL,
    "sheet_name" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "encrypted_data" TEXT NOT NULL,
    "data_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_archive_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" UUID,
    "correlation_id" VARCHAR(128) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "aggregate_type" VARCHAR(80) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processed_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_id_code_key" ON "organizations"("id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "branches_organization_id_id_key" ON "branches"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_organization_id_code_key" ON "branches"("organization_id", "code");

-- CreateIndex
CREATE INDEX "rooms_organization_id_branch_id_idx" ON "rooms"("organization_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_organization_id_id_key" ON "rooms"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_organization_id_branch_id_code_key" ON "rooms"("organization_id", "branch_id", "code");

-- CreateIndex
CREATE INDEX "persons_organization_id_name_ar_idx" ON "persons"("organization_id", "name_ar");

-- CreateIndex
CREATE INDEX "persons_organization_id_name_en_idx" ON "persons"("organization_id", "name_en");

-- CreateIndex
CREATE UNIQUE INDEX "persons_organization_id_id_key" ON "persons"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "persons_organization_id_public_id_key" ON "persons"("organization_id", "public_id");

-- CreateIndex
CREATE INDEX "person_contacts_organization_id_person_id_type_idx" ON "person_contacts"("organization_id", "person_id", "type");

-- CreateIndex
CREATE INDEX "person_contacts_organization_id_type_normalized_value_idx" ON "person_contacts"("organization_id", "type", "normalized_value");

-- CreateIndex
CREATE UNIQUE INDEX "person_contacts_organization_id_id_key" ON "person_contacts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_organization_id_id_key" ON "student_profiles"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_organization_id_person_id_key" ON "student_profiles"("organization_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_organization_id_id_key" ON "staff_profiles"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_organization_id_person_id_key" ON "staff_profiles"("organization_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_organization_id_employee_code_key" ON "staff_profiles"("organization_id", "employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "trainer_profiles_organization_id_id_key" ON "trainer_profiles"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "trainer_profiles_organization_id_person_id_key" ON "trainer_profiles"("organization_id", "person_id");

-- CreateIndex
CREATE INDEX "staff_branch_assignments_organization_id_staff_profile_id_e_idx" ON "staff_branch_assignments"("organization_id", "staff_profile_id", "ends_at");

-- CreateIndex
CREATE INDEX "staff_branch_assignments_organization_id_branch_id_ends_at_idx" ON "staff_branch_assignments"("organization_id", "branch_id", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "staff_branch_assignments_organization_id_id_key" ON "staff_branch_assignments"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_id_id_key" ON "users"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_id_person_id_key" ON "users"("organization_id", "person_id");

-- CreateIndex
CREATE INDEX "user_login_identifiers_organization_id_user_id_idx" ON "user_login_identifiers"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_login_identifiers_organization_id_id_key" ON "user_login_identifiers"("organization_id", "id");

-- CreateIndex
CREATE INDEX "user_sessions_organization_id_user_id_revoked_at_expires_at_idx" ON "user_sessions"("organization_id", "user_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_organization_id_id_key" ON "user_sessions"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "mfa_factors_organization_id_user_id_revoked_at_idx" ON "mfa_factors"("organization_id", "user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_factors_organization_id_id_key" ON "mfa_factors"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organization_id_id_key" ON "roles"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organization_id_code_key" ON "roles"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "role_permission_grants_organization_id_id_key" ON "role_permission_grants"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permission_grants_organization_id_role_id_permission_c_key" ON "role_permission_grants"("organization_id", "role_id", "permission_code", "scope");

-- CreateIndex
CREATE INDEX "user_role_assignments_organization_id_user_id_ends_at_idx" ON "user_role_assignments"("organization_id", "user_id", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_assignments_organization_id_id_key" ON "user_role_assignments"("organization_id", "id");

-- CreateIndex
CREATE INDEX "business_accounts_organization_id_display_name_idx" ON "business_accounts"("organization_id", "display_name");

-- CreateIndex
CREATE UNIQUE INDEX "business_accounts_organization_id_id_key" ON "business_accounts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "business_account_contacts_organization_id_id_key" ON "business_account_contacts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "business_account_contacts_organization_id_business_account__key" ON "business_account_contacts"("organization_id", "business_account_id", "person_id");

-- CreateIndex
CREATE INDEX "billing_accounts_organization_id_person_id_idx" ON "billing_accounts"("organization_id", "person_id");

-- CreateIndex
CREATE INDEX "billing_accounts_organization_id_business_account_id_idx" ON "billing_accounts"("organization_id", "business_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_accounts_organization_id_id_key" ON "billing_accounts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_stages_organization_id_id_key" ON "lead_stages"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_stages_organization_id_code_key" ON "lead_stages"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "lead_stages_organization_id_ordinal_key" ON "lead_stages"("organization_id", "ordinal");

-- CreateIndex
CREATE INDEX "leads_organization_id_branch_id_state_created_at_idx" ON "leads"("organization_id", "branch_id", "state", "created_at" DESC);

-- CreateIndex
CREATE INDEX "leads_organization_id_assigned_user_id_state_next_action_at_idx" ON "leads"("organization_id", "assigned_user_id", "state", "next_action_at");

-- CreateIndex
CREATE UNIQUE INDEX "leads_organization_id_id_key" ON "leads"("organization_id", "id");

-- CreateIndex
CREATE INDEX "lead_activities_organization_id_lead_id_occurred_at_idx" ON "lead_activities"("organization_id", "lead_id", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "lead_activities_organization_id_id_key" ON "lead_activities"("organization_id", "id");

-- CreateIndex
CREATE INDEX "lead_status_history_organization_id_lead_id_occurred_at_idx" ON "lead_status_history"("organization_id", "lead_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "lead_status_history_organization_id_id_key" ON "lead_status_history"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_conversions_organization_id_id_key" ON "lead_conversions"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_conversions_organization_id_lead_id_key" ON "lead_conversions"("organization_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "programs_organization_id_id_key" ON "programs"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "programs_organization_id_code_key" ON "programs"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "program_versions_organization_id_id_key" ON "program_versions"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "program_versions_organization_id_program_id_version_key" ON "program_versions"("organization_id", "program_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "modules_organization_id_id_key" ON "modules"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "modules_organization_id_code_key" ON "modules"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "program_version_modules_organization_id_id_key" ON "program_version_modules"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "program_version_modules_ordinal_key" ON "program_version_modules"("organization_id", "program_version_id", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "program_version_modules_module_key" ON "program_version_modules"("organization_id", "program_version_id", "module_id");

-- CreateIndex
CREATE INDEX "cohorts_organization_id_owning_branch_id_status_idx" ON "cohorts"("organization_id", "owning_branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cohorts_organization_id_id_key" ON "cohorts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cohorts_organization_id_code_key" ON "cohorts"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "cohort_modules_organization_id_id_key" ON "cohort_modules"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cohort_modules_organization_id_cohort_id_ordinal_key" ON "cohort_modules"("organization_id", "cohort_id", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "cohort_modules_organization_id_cohort_id_program_version_mo_key" ON "cohort_modules"("organization_id", "cohort_id", "program_version_module_id");

-- CreateIndex
CREATE INDEX "sessions_organization_id_cohort_id_starts_at_idx" ON "sessions"("organization_id", "cohort_id", "starts_at");

-- CreateIndex
CREATE INDEX "sessions_organization_id_room_id_starts_at_idx" ON "sessions"("organization_id", "room_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_organization_id_id_key" ON "sessions"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_organization_id_cohort_id_ordinal_key" ON "sessions"("organization_id", "cohort_id", "ordinal");

-- CreateIndex
CREATE INDEX "session_trainers_organization_id_trainer_id_starts_at_idx" ON "session_trainers"("organization_id", "trainer_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "session_trainers_organization_id_id_key" ON "session_trainers"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "session_trainers_organization_id_session_id_trainer_id_role_key" ON "session_trainers"("organization_id", "session_id", "trainer_id", "role");

-- CreateIndex
CREATE INDEX "enrollments_organization_id_home_branch_id_state_created_at_idx" ON "enrollments"("organization_id", "home_branch_id", "state", "created_at" DESC);

-- CreateIndex
CREATE INDEX "enrollments_organization_id_student_person_id_state_idx" ON "enrollments"("organization_id", "student_person_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_organization_id_id_key" ON "enrollments"("organization_id", "id");

-- CreateIndex
CREATE INDEX "enrollment_cohort_assignments_organization_id_enrollment_id_idx" ON "enrollment_cohort_assignments"("organization_id", "enrollment_id", "starts_at");

-- CreateIndex
CREATE INDEX "enrollment_cohort_assignments_organization_id_cohort_id_sta_idx" ON "enrollment_cohort_assignments"("organization_id", "cohort_id", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_cohort_assignments_organization_id_id_key" ON "enrollment_cohort_assignments"("organization_id", "id");

-- CreateIndex
CREATE INDEX "enrollment_events_organization_id_enrollment_id_occurred_at_idx" ON "enrollment_events"("organization_id", "enrollment_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_events_organization_id_id_key" ON "enrollment_events"("organization_id", "id");

-- CreateIndex
CREATE INDEX "module_retakes_organization_id_enrollment_id_status_idx" ON "module_retakes"("organization_id", "enrollment_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "module_retakes_organization_id_id_key" ON "module_retakes"("organization_id", "id");

-- CreateIndex
CREATE INDEX "pricing_agreements_organization_id_enrollment_id_status_idx" ON "pricing_agreements"("organization_id", "enrollment_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_agreements_organization_id_id_key" ON "pricing_agreements"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_agreements_organization_id_enrollment_id_version_key" ON "pricing_agreements"("organization_id", "enrollment_id", "version");

-- CreateIndex
CREATE INDEX "pricing_agreement_lines_organization_id_pricing_agreement_i_idx" ON "pricing_agreement_lines"("organization_id", "pricing_agreement_id");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_agreement_lines_organization_id_id_key" ON "pricing_agreement_lines"("organization_id", "id");

-- CreateIndex
CREATE INDEX "installment_schedules_organization_id_enrollment_id_status_idx" ON "installment_schedules"("organization_id", "enrollment_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "installment_schedules_organization_id_id_key" ON "installment_schedules"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "installment_schedules_organization_id_pricing_agreement_id__key" ON "installment_schedules"("organization_id", "pricing_agreement_id", "version");

-- CreateIndex
CREATE INDEX "installments_organization_id_due_date_idx" ON "installments"("organization_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "installments_organization_id_id_key" ON "installments"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "installments_organization_id_schedule_id_ordinal_key" ON "installments"("organization_id", "schedule_id", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "installments_organization_id_debit_entry_id_key" ON "installments"("organization_id", "debit_entry_id");

-- CreateIndex
CREATE INDEX "ledger_entries_organization_id_billing_account_id_posted_at_idx" ON "ledger_entries"("organization_id", "billing_account_id", "posted_at", "id");

-- CreateIndex
CREATE INDEX "ledger_entries_organization_id_enrollment_id_posted_at_idx" ON "ledger_entries"("organization_id", "enrollment_id", "posted_at");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_organization_id_id_key" ON "ledger_entries"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_organization_id_reversal_of_id_key" ON "ledger_entries"("organization_id", "reversal_of_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_organization_id_source_type_source_id_key" ON "ledger_entries"("organization_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "ledger_allocations_organization_id_credit_entry_id_idx" ON "ledger_allocations"("organization_id", "credit_entry_id");

-- CreateIndex
CREATE INDEX "ledger_allocations_organization_id_debit_entry_id_idx" ON "ledger_allocations"("organization_id", "debit_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_allocations_organization_id_id_key" ON "ledger_allocations"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_allocations_organization_id_credit_entry_id_debit_en_key" ON "ledger_allocations"("organization_id", "credit_entry_id", "debit_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_organization_id_id_key" ON "payment_methods"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_organization_id_code_key" ON "payment_methods"("organization_id", "code");

-- CreateIndex
CREATE INDEX "payments_organization_id_status_received_at_idx" ON "payments"("organization_id", "status", "received_at" DESC);

-- CreateIndex
CREATE INDEX "payments_organization_id_billing_account_id_received_at_idx" ON "payments"("organization_id", "billing_account_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_organization_id_id_key" ON "payments"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_organization_id_idempotency_key_key" ON "payments"("organization_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payments_organization_id_ledger_entry_id_key" ON "payments"("organization_id", "ledger_entry_id");

-- CreateIndex
CREATE INDEX "payment_events_organization_id_payment_id_occurred_at_idx" ON "payment_events"("organization_id", "payment_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_organization_id_id_key" ON "payment_events"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_organization_id_id_key" ON "document_sequences"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_organization_id_fiscal_year_document_typ_key" ON "document_sequences"("organization_id", "fiscal_year", "document_type");

-- CreateIndex
CREATE INDEX "internal_invoices_organization_id_billing_account_id_issued_idx" ON "internal_invoices"("organization_id", "billing_account_id", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "internal_invoices_organization_id_id_key" ON "internal_invoices"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "internal_invoices_organization_id_fiscal_year_serial_number_key" ON "internal_invoices"("organization_id", "fiscal_year", "serial_number");

-- CreateIndex
CREATE INDEX "invoice_lines_organization_id_invoice_id_idx" ON "invoice_lines"("organization_id", "invoice_id");

-- CreateIndex
CREATE INDEX "invoice_lines_organization_id_ledger_entry_id_idx" ON "invoice_lines"("organization_id", "ledger_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_organization_id_id_key" ON "invoice_lines"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "internal_receipts_organization_id_id_key" ON "internal_receipts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "internal_receipts_organization_id_payment_id_key" ON "internal_receipts"("organization_id", "payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "internal_receipts_organization_id_fiscal_year_serial_number_key" ON "internal_receipts"("organization_id", "fiscal_year", "serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_organization_id_id_key" ON "credit_notes"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_organization_id_ledger_entry_id_key" ON "credit_notes"("organization_id", "ledger_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_organization_id_fiscal_year_serial_number_key" ON "credit_notes"("organization_id", "fiscal_year", "serial_number");

-- CreateIndex
CREATE INDEX "refund_requests_organization_id_payment_id_status_idx" ON "refund_requests"("organization_id", "payment_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "refund_requests_organization_id_id_key" ON "refund_requests"("organization_id", "id");

-- CreateIndex
CREATE INDEX "payment_reversal_requests_organization_id_payment_id_status_idx" ON "payment_reversal_requests"("organization_id", "payment_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reversal_requests_organization_id_id_key" ON "payment_reversal_requests"("organization_id", "id");

-- CreateIndex
CREATE INDEX "refunds_organization_id_payment_id_idx" ON "refunds"("organization_id", "payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_organization_id_id_key" ON "refunds"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_organization_id_refund_request_id_key" ON "refunds"("organization_id", "refund_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_organization_id_ledger_entry_id_key" ON "refunds"("organization_id", "ledger_entry_id");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_organization_id_id_key" ON "idempotency_records"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_organization_id_operation_key_key" ON "idempotency_records"("organization_id", "operation", "key");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_policy_versions_organization_id_id_key" ON "attendance_policy_versions"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_policy_versions_organization_id_program_version__key" ON "attendance_policy_versions"("organization_id", "program_version_id", "cohort_id", "version");

-- CreateIndex
CREATE INDEX "qr_challenges_organization_id_session_id_expires_at_idx" ON "qr_challenges"("organization_id", "session_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "qr_challenges_organization_id_id_key" ON "qr_challenges"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "qr_challenges_nonce_digest_key" ON "qr_challenges"("nonce_digest");

-- CreateIndex
CREATE INDEX "attendance_records_organization_id_session_id_current_statu_idx" ON "attendance_records"("organization_id", "session_id", "current_status");

-- CreateIndex
CREATE INDEX "attendance_records_organization_id_enrollment_id_session_id_idx" ON "attendance_records"("organization_id", "enrollment_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_organization_id_id_key" ON "attendance_records"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_organization_id_session_id_enrollment_id_key" ON "attendance_records"("organization_id", "session_id", "enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_events_organization_id_id_key" ON "attendance_events"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_events_organization_id_attendance_record_id_vers_key" ON "attendance_events"("organization_id", "attendance_record_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "makeup_credits_organization_id_id_key" ON "makeup_credits"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "makeup_credits_organization_id_missed_record_id_key" ON "makeup_credits"("organization_id", "missed_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "makeup_credits_organization_id_makeup_record_id_key" ON "makeup_credits"("organization_id", "makeup_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_rule_versions_organization_id_id_key" ON "certificate_rule_versions"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_rule_versions_organization_id_program_version_i_key" ON "certificate_rule_versions"("organization_id", "program_version_id", "cohort_id", "version");

-- CreateIndex
CREATE INDEX "eligibility_evaluations_organization_id_enrollment_id_evalu_idx" ON "eligibility_evaluations"("organization_id", "enrollment_id", "evaluated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "eligibility_evaluations_organization_id_id_key" ON "eligibility_evaluations"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "file_assets_organization_id_id_key" ON "file_assets"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "file_assets_organization_id_storage_key_key" ON "file_assets"("organization_id", "storage_key");

-- CreateIndex
CREATE INDEX "certificates_organization_id_enrollment_id_issued_at_idx" ON "certificates"("organization_id", "enrollment_id", "issued_at" DESC);

-- CreateIndex
CREATE INDEX "certificates_organization_id_validity_status_issued_at_idx" ON "certificates"("organization_id", "validity_status", "issued_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "certificates_organization_id_id_key" ON "certificates"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_serial_key" ON "certificates"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_verification_digest_key" ON "certificates"("verification_digest");

-- CreateIndex
CREATE INDEX "certificate_events_organization_id_certificate_id_occurred__idx" ON "certificate_events"("organization_id", "certificate_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_events_organization_id_id_key" ON "certificate_events"("organization_id", "id");

-- CreateIndex
CREATE INDEX "import_batches_organization_id_status_created_at_idx" ON "import_batches"("organization_id", "status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_organization_id_id_key" ON "import_batches"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_organization_id_source_sha256_key" ON "import_batches"("organization_id", "source_sha256");

-- CreateIndex
CREATE UNIQUE INDEX "import_source_files_organization_id_id_key" ON "import_source_files"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "import_source_files_organization_id_batch_id_sha256_key" ON "import_source_files"("organization_id", "batch_id", "sha256");

-- CreateIndex
CREATE INDEX "import_rows_organization_id_source_file_id_disposition_idx" ON "import_rows"("organization_id", "source_file_id", "disposition");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_organization_id_id_key" ON "import_rows"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_organization_id_source_file_id_sheet_name_row_n_key" ON "import_rows"("organization_id", "source_file_id", "sheet_name", "row_number");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_organization_id_source_file_id_sheet_name_row_h_key" ON "import_rows"("organization_id", "source_file_id", "sheet_name", "row_hash");

-- CreateIndex
CREATE INDEX "person_match_candidates_organization_id_import_row_id_score_idx" ON "person_match_candidates"("organization_id", "import_row_id", "score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "person_match_candidates_organization_id_id_key" ON "person_match_candidates"("organization_id", "id");

-- CreateIndex
CREATE INDEX "import_issues_organization_id_batch_id_status_severity_idx" ON "import_issues"("organization_id", "batch_id", "status", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "import_issues_organization_id_id_key" ON "import_issues"("organization_id", "id");

-- CreateIndex
CREATE INDEX "import_reconciliations_organization_id_batch_id_passed_idx" ON "import_reconciliations"("organization_id", "batch_id", "passed");

-- CreateIndex
CREATE UNIQUE INDEX "import_reconciliations_organization_id_id_key" ON "import_reconciliations"("organization_id", "id");

-- CreateIndex
CREATE INDEX "legacy_references_organization_id_entity_type_entity_id_idx" ON "legacy_references"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "legacy_references_organization_id_source_field_raw_value_idx" ON "legacy_references"("organization_id", "source_field", "raw_value");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_references_organization_id_id_key" ON "legacy_references"("organization_id", "id");

-- CreateIndex
CREATE INDEX "legacy_archive_records_organization_id_batch_id_category_idx" ON "legacy_archive_records"("organization_id", "batch_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_archive_records_organization_id_id_key" ON "legacy_archive_records"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_archive_records_organization_id_source_file_id_sheet_key" ON "legacy_archive_records"("organization_id", "source_file_id", "sheet_name", "row_number");

-- CreateIndex
CREATE INDEX "audit_events_organization_id_entity_type_entity_id_created__idx" ON "audit_events"("organization_id", "entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_organization_id_actor_user_id_created_at_idx" ON "audit_events"("organization_id", "actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_organization_id_id_key" ON "audit_events"("organization_id", "id");

-- CreateIndex
CREATE INDEX "outbox_events_processed_at_available_at_created_at_idx" ON "outbox_events"("processed_at", "available_at", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_organization_id_aggregate_type_aggregate_id_o_idx" ON "outbox_events"("organization_id", "aggregate_type", "aggregate_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_organization_id_id_key" ON "outbox_events"("organization_id", "id");

-- PostgreSQL is the enforcement boundary for tenant isolation and invariants
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Organization ownership and composite tenant foreign keys
ALTER TABLE "branches" ADD CONSTRAINT "branches_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_branch_fk" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "persons" ADD CONSTRAINT "persons_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "person_contacts" ADD CONSTRAINT "person_contacts_person_fk" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_person_fk" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_person_fk" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "trainer_profiles" ADD CONSTRAINT "trainer_profiles_person_fk" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "staff_branch_assignments" ADD CONSTRAINT "staff_branch_assignments_staff_fk" FOREIGN KEY ("organization_id", "staff_profile_id") REFERENCES "staff_profiles"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "staff_branch_assignments" ADD CONSTRAINT "staff_branch_assignments_branch_fk" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "users" ADD CONSTRAINT "users_person_fk" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "user_login_identifiers" ADD CONSTRAINT "user_login_identifiers_user_fk" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE;
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_fk" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE;
ALTER TABLE "mfa_factors" ADD CONSTRAINT "mfa_factors_user_fk" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE;
ALTER TABLE "roles" ADD CONSTRAINT "roles_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "role_permission_grants" ADD CONSTRAINT "role_permission_grants_role_fk" FOREIGN KEY ("organization_id", "role_id") REFERENCES "roles"("organization_id", "id") ON DELETE CASCADE;
ALTER TABLE "role_permission_grants" ADD CONSTRAINT "role_permission_grants_permission_fk" FOREIGN KEY ("permission_code") REFERENCES "permissions"("code") ON DELETE RESTRICT;
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_fk" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_role_fk" FOREIGN KEY ("organization_id", "role_id") REFERENCES "roles"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "business_accounts" ADD CONSTRAINT "business_accounts_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "business_account_contacts" ADD CONSTRAINT "business_account_contacts_account_fk" FOREIGN KEY ("organization_id", "business_account_id") REFERENCES "business_accounts"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "business_account_contacts" ADD CONSTRAINT "business_account_contacts_person_fk" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_person_fk" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_business_fk" FOREIGN KEY ("organization_id", "business_account_id") REFERENCES "business_accounts"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "lead_stages" ADD CONSTRAINT "lead_stages_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "leads" ADD CONSTRAINT "leads_branch_fk" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignee_fk" FOREIGN KEY ("organization_id", "assigned_user_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "leads" ADD CONSTRAINT "leads_person_fk" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_fk" FOREIGN KEY ("organization_id", "stage_id") REFERENCES "lead_stages"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_fk" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "leads"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actor_fk" FOREIGN KEY ("organization_id", "actor_user_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_lead_fk" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "leads"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_actor_fk" FOREIGN KEY ("organization_id", "actor_user_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "programs" ADD CONSTRAINT "programs_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "program_versions" ADD CONSTRAINT "program_versions_program_fk" FOREIGN KEY ("organization_id", "program_id") REFERENCES "programs"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "modules" ADD CONSTRAINT "modules_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "program_version_modules" ADD CONSTRAINT "pvm_version_fk" FOREIGN KEY ("organization_id", "program_version_id") REFERENCES "program_versions"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "program_version_modules" ADD CONSTRAINT "pvm_module_fk" FOREIGN KEY ("organization_id", "module_id") REFERENCES "modules"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_version_fk" FOREIGN KEY ("organization_id", "program_version_id") REFERENCES "program_versions"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_branch_fk" FOREIGN KEY ("organization_id", "owning_branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "cohort_modules" ADD CONSTRAINT "cohort_modules_cohort_fk" FOREIGN KEY ("organization_id", "cohort_id") REFERENCES "cohorts"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "cohort_modules" ADD CONSTRAINT "cohort_modules_pvm_fk" FOREIGN KEY ("organization_id", "program_version_module_id") REFERENCES "program_version_modules"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_cohort_module_fk" FOREIGN KEY ("organization_id", "cohort_module_id") REFERENCES "cohort_modules"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_cohort_fk" FOREIGN KEY ("organization_id", "cohort_id") REFERENCES "cohorts"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_room_fk" FOREIGN KEY ("organization_id", "room_id") REFERENCES "rooms"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "session_trainers" ADD CONSTRAINT "session_trainers_session_fk" FOREIGN KEY ("organization_id", "session_id") REFERENCES "sessions"("organization_id", "id") ON DELETE CASCADE;
ALTER TABLE "session_trainers" ADD CONSTRAINT "session_trainers_trainer_fk" FOREIGN KEY ("organization_id", "trainer_id") REFERENCES "trainer_profiles"("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_fk" FOREIGN KEY ("organization_id", "student_person_id") REFERENCES "persons"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_version_fk" FOREIGN KEY ("organization_id", "program_version_id") REFERENCES "program_versions"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_billing_fk" FOREIGN KEY ("organization_id", "billing_account_id") REFERENCES "billing_accounts"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_branch_fk" FOREIGN KEY ("organization_id", "home_branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "enrollment_cohort_assignments" ADD CONSTRAINT "eca_enrollment_fk" FOREIGN KEY ("organization_id", "enrollment_id") REFERENCES "enrollments"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "enrollment_cohort_assignments" ADD CONSTRAINT "eca_cohort_fk" FOREIGN KEY ("organization_id", "cohort_id") REFERENCES "cohorts"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "enrollment_cohort_assignments" ADD CONSTRAINT "eca_creator_fk" FOREIGN KEY ("organization_id", "created_by") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "enrollment_events" ADD CONSTRAINT "enrollment_events_enrollment_fk" FOREIGN KEY ("organization_id", "enrollment_id") REFERENCES "enrollments"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "enrollment_events" ADD CONSTRAINT "enrollment_events_actor_fk" FOREIGN KEY ("organization_id", "actor_user_id") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "module_retakes" ADD CONSTRAINT "module_retakes_enrollment_fk" FOREIGN KEY ("organization_id", "enrollment_id") REFERENCES "enrollments"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "module_retakes" ADD CONSTRAINT "module_retakes_pvm_fk" FOREIGN KEY ("organization_id", "program_version_module_id") REFERENCES "program_version_modules"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "module_retakes" ADD CONSTRAINT "module_retakes_cohort_module_fk" FOREIGN KEY ("organization_id", "target_cohort_module_id") REFERENCES "cohort_modules"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "lead_conversions" ADD CONSTRAINT "lead_conversions_lead_fk" FOREIGN KEY ("organization_id", "lead_id") REFERENCES "leads"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "lead_conversions" ADD CONSTRAINT "lead_conversions_person_fk" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "lead_conversions" ADD CONSTRAINT "lead_conversions_enrollment_fk" FOREIGN KEY ("organization_id", "enrollment_id") REFERENCES "enrollments"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "lead_conversions" ADD CONSTRAINT "lead_conversions_actor_fk" FOREIGN KEY ("organization_id", "converted_by") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "pricing_agreements" ADD CONSTRAINT "pricing_agreements_enrollment_fk" FOREIGN KEY ("organization_id", "enrollment_id") REFERENCES "enrollments"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "pricing_agreements" ADD CONSTRAINT "pricing_agreements_proposer_fk" FOREIGN KEY ("organization_id", "proposed_by") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "pricing_agreements" ADD CONSTRAINT "pricing_agreements_approver_fk" FOREIGN KEY ("organization_id", "approved_by") REFERENCES "users"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "pricing_agreement_lines" ADD CONSTRAINT "pricing_lines_agreement_fk" FOREIGN KEY ("organization_id", "pricing_agreement_id") REFERENCES "pricing_agreements"("organization_id", "id") ON DELETE CASCADE;
ALTER TABLE "installment_schedules" ADD CONSTRAINT "schedules_enrollment_fk" FOREIGN KEY ("organization_id", "enrollment_id") REFERENCES "enrollments"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "installment_schedules" ADD CONSTRAINT "schedules_agreement_fk" FOREIGN KEY ("organization_id", "pricing_agreement_id") REFERENCES "pricing_agreements"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "installments" ADD CONSTRAINT "installments_schedule_fk" FOREIGN KEY ("organization_id", "schedule_id") REFERENCES "installment_schedules"("organization_id", "id") ON DELETE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_billing_fk" FOREIGN KEY ("organization_id", "billing_account_id") REFERENCES "billing_accounts"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_enrollment_fk" FOREIGN KEY ("organization_id", "enrollment_id") REFERENCES "enrollments"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_reversal_fk" FOREIGN KEY ("organization_id", "reversal_of_id") REFERENCES "ledger_entries"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "installments" ADD CONSTRAINT "installments_debit_fk" FOREIGN KEY ("organization_id", "debit_entry_id") REFERENCES "ledger_entries"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "ledger_allocations" ADD CONSTRAINT "allocations_credit_fk" FOREIGN KEY ("organization_id", "credit_entry_id") REFERENCES "ledger_entries"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "ledger_allocations" ADD CONSTRAINT "allocations_debit_fk" FOREIGN KEY ("organization_id", "debit_entry_id") REFERENCES "ledger_entries"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "payments" ADD CONSTRAINT "payments_billing_fk" FOREIGN KEY ("organization_id", "billing_account_id") REFERENCES "billing_accounts"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "payments" ADD CONSTRAINT "payments_enrollment_fk" FOREIGN KEY ("organization_id", "enrollment_id") REFERENCES "enrollments"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_fk" FOREIGN KEY ("organization_id", "method_id") REFERENCES "payment_methods"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "payments" ADD CONSTRAINT "payments_ledger_fk" FOREIGN KEY ("organization_id", "ledger_entry_id") REFERENCES "ledger_entries"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_fk" FOREIGN KEY ("organization_id", "payment_id") REFERENCES "payments"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "internal_invoices" ADD CONSTRAINT "invoices_billing_fk" FOREIGN KEY ("organization_id", "billing_account_id") REFERENCES "billing_accounts"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_fk" FOREIGN KEY ("organization_id", "invoice_id") REFERENCES "internal_invoices"("organization_id", "id") ON DELETE CASCADE;
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_ledger_fk" FOREIGN KEY ("organization_id", "ledger_entry_id") REFERENCES "ledger_entries"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "internal_receipts" ADD CONSTRAINT "receipts_payment_fk" FOREIGN KEY ("organization_id", "payment_id") REFERENCES "payments"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "internal_receipts" ADD CONSTRAINT "receipts_billing_fk" FOREIGN KEY ("organization_id", "billing_account_id") REFERENCES "billing_accounts"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_fk" FOREIGN KEY ("organization_id", "invoice_id") REFERENCES "internal_invoices"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_ledger_fk" FOREIGN KEY ("organization_id", "ledger_entry_id") REFERENCES "ledger_entries"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_payment_fk" FOREIGN KEY ("organization_id", "payment_id") REFERENCES "payments"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "payment_reversal_requests" ADD CONSTRAINT "reversal_requests_payment_fk" FOREIGN KEY ("organization_id", "payment_id") REFERENCES "payments"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_request_fk" FOREIGN KEY ("organization_id", "refund_request_id") REFERENCES "refund_requests"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_fk" FOREIGN KEY ("organization_id", "payment_id") REFERENCES "payments"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_ledger_fk" FOREIGN KEY ("organization_id", "ledger_entry_id") REFERENCES "ledger_entries"("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "attendance_policy_versions" ADD CONSTRAINT "attendance_policies_version_fk" FOREIGN KEY ("organization_id", "program_version_id") REFERENCES "program_versions"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "attendance_policy_versions" ADD CONSTRAINT "attendance_policies_cohort_fk" FOREIGN KEY ("organization_id", "cohort_id") REFERENCES "cohorts"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "qr_challenges" ADD CONSTRAINT "qr_challenges_session_fk" FOREIGN KEY ("organization_id", "session_id") REFERENCES "sessions"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_fk" FOREIGN KEY ("organization_id", "session_id") REFERENCES "sessions"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_enrollment_fk" FOREIGN KEY ("organization_id", "enrollment_id") REFERENCES "enrollments"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_record_fk" FOREIGN KEY ("organization_id", "attendance_record_id") REFERENCES "attendance_records"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "makeup_credits" ADD CONSTRAINT "makeup_missed_fk" FOREIGN KEY ("organization_id", "missed_record_id") REFERENCES "attendance_records"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "makeup_credits" ADD CONSTRAINT "makeup_attended_fk" FOREIGN KEY ("organization_id", "makeup_record_id") REFERENCES "attendance_records"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "certificate_rule_versions" ADD CONSTRAINT "certificate_rules_version_fk" FOREIGN KEY ("organization_id", "program_version_id") REFERENCES "program_versions"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "certificate_rule_versions" ADD CONSTRAINT "certificate_rules_cohort_fk" FOREIGN KEY ("organization_id", "cohort_id") REFERENCES "cohorts"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "eligibility_evaluations" ADD CONSTRAINT "evaluations_enrollment_fk" FOREIGN KEY ("organization_id", "enrollment_id") REFERENCES "enrollments"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "eligibility_evaluations" ADD CONSTRAINT "evaluations_rule_fk" FOREIGN KEY ("organization_id", "rule_version_id") REFERENCES "certificate_rule_versions"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_enrollment_fk" FOREIGN KEY ("organization_id", "enrollment_id") REFERENCES "enrollments"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_evaluation_fk" FOREIGN KEY ("organization_id", "evaluation_id") REFERENCES "eligibility_evaluations"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_supersedes_fk" FOREIGN KEY ("organization_id", "supersedes_id") REFERENCES "certificates"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_file_fk" FOREIGN KEY ("organization_id", "file_asset_id") REFERENCES "file_assets"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "certificate_events" ADD CONSTRAINT "certificate_events_certificate_fk" FOREIGN KEY ("organization_id", "certificate_id") REFERENCES "certificates"("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "import_source_files" ADD CONSTRAINT "import_files_batch_fk" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "import_batches"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_file_fk" FOREIGN KEY ("organization_id", "source_file_id") REFERENCES "import_source_files"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "person_match_candidates" ADD CONSTRAINT "match_candidates_row_fk" FOREIGN KEY ("organization_id", "import_row_id") REFERENCES "import_rows"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "person_match_candidates" ADD CONSTRAINT "match_candidates_person_fk" FOREIGN KEY ("organization_id", "candidate_person_id") REFERENCES "persons"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "import_issues" ADD CONSTRAINT "import_issues_batch_fk" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "import_batches"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "import_issues" ADD CONSTRAINT "import_issues_row_fk" FOREIGN KEY ("organization_id", "import_row_id") REFERENCES "import_rows"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "import_reconciliations" ADD CONSTRAINT "import_reconciliations_batch_fk" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "import_batches"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "legacy_references" ADD CONSTRAINT "legacy_references_row_fk" FOREIGN KEY ("organization_id", "import_row_id") REFERENCES "import_rows"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "legacy_archive_records" ADD CONSTRAINT "legacy_archive_batch_fk" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "import_batches"("organization_id", "id") ON DELETE RESTRICT;
ALTER TABLE "legacy_archive_records" ADD CONSTRAINT "legacy_archive_file_fk" FOREIGN KEY ("organization_id", "source_file_id") REFERENCES "import_source_files"("organization_id", "id") ON DELETE RESTRICT;

-- Domain checks
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_capacity_check" CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_owner_check" CHECK (
  ("kind" = 'INDIVIDUAL' AND "person_id" IS NOT NULL AND "business_account_id" IS NULL) OR
  ("kind" = 'CORPORATE' AND "person_id" IS NULL AND "business_account_id" IS NOT NULL)
);
ALTER TABLE "role_permission_grants" ADD CONSTRAINT "role_permission_scope_check" CHECK ("scope" IN ('O', 'B', 'A', 'S'));
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_time_check" CHECK (("starts_at" IS NULL AND "ends_at" IS NULL) OR ("starts_at" IS NOT NULL AND "ends_at" > "starts_at"));
ALTER TABLE "session_trainers" ADD CONSTRAINT "session_trainers_time_check" CHECK (("starts_at" IS NULL AND "ends_at" IS NULL) OR ("starts_at" IS NOT NULL AND "ends_at" > "starts_at"));
ALTER TABLE "enrollment_cohort_assignments" ADD CONSTRAINT "eca_time_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");
ALTER TABLE "pricing_agreements" ADD CONSTRAINT "pricing_amounts_check" CHECK ("subtotal" >= 0 AND "discount_amount" >= 0 AND "discount_amount" <= "subtotal" AND "total_amount" = "subtotal" - "discount_amount" AND "currency_code" = 'EGP');
ALTER TABLE "pricing_agreement_lines" ADD CONSTRAINT "pricing_lines_amount_check" CHECK ("quantity" > 0 AND "unit_amount" >= 0 AND "line_amount" = ROUND("quantity" * "unit_amount", 2));
ALTER TABLE "installments" ADD CONSTRAINT "installments_amount_check" CHECK ("amount" > 0);
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_check" CHECK ("amount" > 0 AND "currency_code" = 'EGP' AND "direction" IN ('DEBIT', 'CREDIT'));
ALTER TABLE "ledger_allocations" ADD CONSTRAINT "ledger_allocations_amount_check" CHECK ("amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount" > 0 AND "currency_code" = 'EGP');
ALTER TABLE "internal_invoices" ADD CONSTRAINT "invoices_amount_check" CHECK ("subtotal" >= 0 AND "tax_amount" >= 0 AND "total_amount" = "subtotal" + "tax_amount" AND "currency_code" = 'EGP');
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_amount_check" CHECK ("quantity" > 0 AND "unit_amount" >= 0 AND "tax_amount" >= 0 AND "line_total" = ROUND("quantity" * "unit_amount", 2) + "tax_amount");
ALTER TABLE "internal_receipts" ADD CONSTRAINT "receipts_amount_check" CHECK ("amount" > 0 AND "currency_code" = 'EGP');
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_amount_check" CHECK ("amount" > 0);
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_request_amount_check" CHECK ("requested_amount" > 0 AND ("approved_by" IS NULL OR "approved_by" <> "requested_by"));
ALTER TABLE "payment_reversal_requests" ADD CONSTRAINT "reversal_maker_checker" CHECK ("approved_by" IS NULL OR "approved_by" <> "requested_by");
ALTER TABLE "refunds" ADD CONSTRAINT "refund_amount_check" CHECK ("amount" > 0);
ALTER TABLE "attendance_policy_versions" ADD CONSTRAINT "attendance_policy_ratio_check" CHECK ("minimum_ratio" BETWEEN 0 AND 1 AND "lock_after_minutes" > 0 AND ("effective_to" IS NULL OR "effective_to" > "effective_from"));
ALTER TABLE "certificate_rule_versions" ADD CONSTRAINT "certificate_rule_ratio_check" CHECK ("minimum_ratio" BETWEEN 0 AND 1 AND ("effective_to" IS NULL OR "effective_to" > "effective_from"));
ALTER TABLE "eligibility_evaluations" ADD CONSTRAINT "evaluation_ratio_check" CHECK ("attendance_ratio" IS NULL OR "attendance_ratio" BETWEEN 0 AND 1);
ALTER TABLE "file_assets" ADD CONSTRAINT "file_size_check" CHECK ("size_bytes" > 0);
ALTER TABLE "import_rows" ADD CONSTRAINT "import_row_number_check" CHECK ("row_number" > 0);

-- Partial uniques and conflict prevention
CREATE UNIQUE INDEX "user_login_identifiers_active_key" ON "user_login_identifiers" ("organization_id", "type", "normalized_value") WHERE "revoked_at" IS NULL;
CREATE UNIQUE INDEX "staff_branch_assignments_active_key" ON "staff_branch_assignments" ("organization_id", "staff_profile_id", "branch_id") WHERE "ends_at" IS NULL;
CREATE UNIQUE INDEX "enrollment_active_cohort_key" ON "enrollment_cohort_assignments" ("organization_id", "enrollment_id") WHERE "ends_at" IS NULL;
CREATE UNIQUE INDEX "pricing_agreements_approved_key" ON "pricing_agreements" ("organization_id", "enrollment_id") WHERE "status" = 'APPROVED';
CREATE UNIQUE INDEX "installment_schedules_approved_key" ON "installment_schedules" ("organization_id", "pricing_agreement_id") WHERE "status" = 'APPROVED';
CREATE UNIQUE INDEX "qr_challenges_active_key" ON "qr_challenges" ("organization_id", "session_id") WHERE "is_active";
CREATE UNIQUE INDEX "certificates_active_enrollment_key" ON "certificates" ("organization_id", "enrollment_id") WHERE "validity_status" = 'ISSUED';

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_room_no_overlap" EXCLUDE USING gist (
  "organization_id" WITH =,
  "room_id" WITH =,
  tstzrange("starts_at", "ends_at", '[)') WITH &&
) WHERE ("room_id" IS NOT NULL AND "starts_at" IS NOT NULL AND "status" NOT IN ('DRAFT', 'CANCELLED'));

ALTER TABLE "session_trainers" ADD CONSTRAINT "session_trainers_no_overlap" EXCLUDE USING gist (
  "organization_id" WITH =,
  "trainer_id" WITH =,
  tstzrange("starts_at", "ends_at", '[)') WITH &&
) WHERE ("starts_at" IS NOT NULL AND "booking_status" = 'CONFIRMED');

-- Search, queue, and append-heavy indexes
CREATE INDEX "persons_name_ar_trgm_idx" ON "persons" USING gin ("name_ar" gin_trgm_ops);
CREATE INDEX "persons_name_en_trgm_idx" ON "persons" USING gin ("name_en" gin_trgm_ops);
CREATE INDEX "audit_events_created_at_brin_idx" ON "audit_events" USING brin ("created_at");
CREATE INDEX "outbox_events_created_at_brin_idx" ON "outbox_events" USING brin ("created_at");
CREATE INDEX "import_rows_created_at_brin_idx" ON "import_rows" USING brin ("created_at");

-- Deferred schedule total invariant
CREATE FUNCTION plg_check_installment_schedule_total() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  schedule_id uuid;
  schedule_status text;
  agreement_total numeric(14,2);
  installment_total numeric(14,2);
BEGIN
  schedule_id := CASE WHEN TG_TABLE_NAME = 'installment_schedules' THEN NEW.id ELSE COALESCE(NEW.schedule_id, OLD.schedule_id) END;
  SELECT s.status, p.total_amount
    INTO schedule_status, agreement_total
    FROM installment_schedules s
    JOIN pricing_agreements p ON p.organization_id = s.organization_id AND p.id = s.pricing_agreement_id
    WHERE s.id = schedule_id;
  IF schedule_status = 'APPROVED' THEN
    SELECT COALESCE(SUM(i.amount), 0) INTO installment_total FROM installments i WHERE i.schedule_id = schedule_id;
    IF installment_total <> agreement_total THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Approved installment total must equal pricing agreement total';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE CONSTRAINT TRIGGER "installments_total_guard"
AFTER INSERT OR UPDATE OR DELETE ON "installments"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION plg_check_installment_schedule_total();

CREATE CONSTRAINT TRIGGER "schedule_approval_total_guard"
AFTER INSERT OR UPDATE ON "installment_schedules"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION plg_check_installment_schedule_total();

-- Allocation and refund overrun protection uses row locks in the database
CREATE FUNCTION plg_guard_ledger_allocation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  credit_amount numeric(14,2);
  debit_amount numeric(14,2);
  credit_direction text;
  debit_direction text;
  credit_allocated numeric(14,2);
  debit_allocated numeric(14,2);
BEGIN
  SELECT amount, direction INTO credit_amount, credit_direction FROM ledger_entries
    WHERE organization_id = NEW.organization_id AND id = NEW.credit_entry_id FOR UPDATE;
  SELECT amount, direction INTO debit_amount, debit_direction FROM ledger_entries
    WHERE organization_id = NEW.organization_id AND id = NEW.debit_entry_id FOR UPDATE;
  IF credit_direction <> 'CREDIT' OR debit_direction <> 'DEBIT' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Allocations require a CREDIT entry and a DEBIT entry';
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO credit_allocated FROM ledger_allocations
    WHERE organization_id = NEW.organization_id AND credit_entry_id = NEW.credit_entry_id;
  SELECT COALESCE(SUM(amount), 0) INTO debit_allocated FROM ledger_allocations
    WHERE organization_id = NEW.organization_id AND debit_entry_id = NEW.debit_entry_id;
  IF credit_allocated + NEW.amount > credit_amount OR debit_allocated + NEW.amount > debit_amount THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Ledger allocation exceeds entry amount';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ledger_allocation_guard" BEFORE INSERT ON "ledger_allocations"
FOR EACH ROW EXECUTE FUNCTION plg_guard_ledger_allocation();

CREATE FUNCTION plg_guard_refund_total() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  payment_amount numeric(14,2);
  refunded_amount numeric(14,2);
BEGIN
  SELECT amount INTO payment_amount FROM payments
    WHERE organization_id = NEW.organization_id AND id = NEW.payment_id AND status IN ('POSTED', 'REVERSED') FOR UPDATE;
  IF payment_amount IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Refund requires a posted payment';
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO refunded_amount FROM refunds
    WHERE organization_id = NEW.organization_id AND payment_id = NEW.payment_id;
  IF refunded_amount + NEW.amount > payment_amount THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Refund total exceeds payment amount';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "refund_total_guard" BEFORE INSERT ON "refunds"
FOR EACH ROW EXECUTE FUNCTION plg_guard_refund_total();

-- Append-only and issued-document immutability
CREATE FUNCTION plg_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = TG_TABLE_NAME || ' is append-only';
END;
$$;

CREATE TRIGGER "ledger_entries_append_only" BEFORE UPDATE OR DELETE ON "ledger_entries" FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();
CREATE TRIGGER "ledger_allocations_append_only" BEFORE UPDATE OR DELETE ON "ledger_allocations" FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();
CREATE TRIGGER "internal_receipts_append_only" BEFORE UPDATE OR DELETE ON "internal_receipts" FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();
CREATE TRIGGER "credit_notes_append_only" BEFORE UPDATE OR DELETE ON "credit_notes" FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();
CREATE TRIGGER "refunds_append_only" BEFORE UPDATE OR DELETE ON "refunds" FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();
CREATE TRIGGER "audit_events_append_only" BEFORE UPDATE OR DELETE ON "audit_events" FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();
CREATE TRIGGER "attendance_events_append_only" BEFORE UPDATE OR DELETE ON "attendance_events" FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();
CREATE TRIGGER "certificate_events_append_only" BEFORE UPDATE OR DELETE ON "certificate_events" FOR EACH ROW EXECUTE FUNCTION plg_reject_mutation();

CREATE FUNCTION plg_guard_issued_invoice() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status <> 'DRAFT' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Issued invoices cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'DRAFT' AND (
    NEW.organization_id, NEW.billing_account_id, NEW.fiscal_year, NEW.serial_number,
    NEW.currency_code, NEW.subtotal, NEW.tax_amount, NEW.total_amount, NEW.customer_snapshot, NEW.issued_at
  ) IS DISTINCT FROM (
    OLD.organization_id, OLD.billing_account_id, OLD.fiscal_year, OLD.serial_number,
    OLD.currency_code, OLD.subtotal, OLD.tax_amount, OLD.total_amount, OLD.customer_snapshot, OLD.issued_at
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Issued invoice snapshot is immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "issued_invoice_guard" BEFORE UPDATE OR DELETE ON "internal_invoices"
FOR EACH ROW EXECUTE FUNCTION plg_guard_issued_invoice();

CREATE FUNCTION plg_reject_certificate_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Certificates must be revoked or superseded, never deleted';
END;
$$;

CREATE TRIGGER "certificate_delete_guard" BEFORE DELETE ON "certificates"
FOR EACH ROW EXECUTE FUNCTION plg_reject_certificate_delete();
