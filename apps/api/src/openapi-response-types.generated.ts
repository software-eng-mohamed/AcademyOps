/* eslint-disable */
/**
 * Generated from the inferred return types of the NestJS controllers.
 * Do not edit manually. Run `pnpm --filter @academyops/api openapi:responses`.
 */

import type * as ResponseType0 from './academic/cohort-source-data';
import type * as ResponseType1 from './crm/sales-dashboard/sales-dashboard.types';
import type * as ResponseType2 from './finance/pricing/pricing-helper.service';
import type * as ResponseType3 from './iam/administration/iam-administration.dto';
import type * as ResponseType4 from './iam/auth/auth-response.dto';
import type * as ResponseType5 from './iam/auth/phone-otp.dto';
import type * as ResponseType6 from './imports/import-reconciliation';
import type * as ResponseType7 from './messaging/otp-channel.dto';
import type * as ResponseType8 from './reporting/dashboard-approvals.service';
import type * as ResponseType9 from './reporting/dashboard-attention.service';
import type * as ResponseType10 from './reporting/dashboard-commercial.service';
import type * as ResponseType11 from './reporting/dashboard-utils';
import type * as ResponseType12 from './reporting/report-exports.service';
import type * as ResponseType13 from './students/student-contacts.service';
import type * as ResponseType14 from './students/student-query.service';
import type * as ResponseType15 from './students/student-registration.dto';
import type * as ResponseType16 from './workspace/search-contract';
import type * as ResponseType17 from '@prisma/client/runtime/library';
import type * as ResponseType18 from '../../../packages/contracts/dist/staff-overview';
import type * as ResponseType19 from '../../../packages/contracts/dist/workspace-overview';

export type HealthController_liveResponse = { status: "ok"; };

export type HealthController_readyResponse = { status: "ok"; };

export type AuditController_listResponse = { items: Array<{ actor: { id: string; name: string | null; publicId: string; } | null; id: string; organizationId: string; actorUserId: string | null; action: string; entityType: string; entityId: string | null; correlationId: string; before: unknown; after: unknown; metadata: unknown; createdAt: Date; }>; nextCursor: string | null; };

export type AuditController_readResponse = { actor: { name: string | null; publicId: string; } | null; id: string; organizationId: string; actorUserId: string | null; action: string; entityType: string; entityId: string | null; correlationId: string; before: unknown; after: unknown; metadata: unknown; createdAt: Date; };

export type AuthController_loginResponse = { expiresAt: string; mfaSetupRequired: boolean; passwordChangeRequired: boolean; };

export type AuthController_meResponse = { id: string; version: number; organization: { id: string; code: string; name: string; }; name: string; preferredLocale: "ar" | "en" | null; localePreferenceSet: boolean; onboardingCompleted: boolean; branches: Array<{ id: string; code: string; name: string; }>; roles: Array<{ code: string; name: string; }>; permissions: Array<{ code: "students.read_basic" | "students.read_contact" | "students.create" | "students.update" | "students.update_sensitive" | "students.merge" | "students.registration.manage" | "me.profile.update" | "leads.read" | "leads.create" | "leads.update" | "leads.claim" | "leads.assign" | "leads.convert" | "business_accounts.read" | "business_accounts.manage" | "academic.catalog.read" | "academic.programs.manage" | "academic.cohorts.manage" | "academic.sessions.manage" | "enrollments.read" | "enrollments.create" | "enrollments.submit" | "enrollments.activate" | "enrollments.transfer" | "enrollments.postpone" | "enrollments.resume" | "enrollments.complete" | "enrollments.retake" | "enrollments.cancel.request" | "enrollments.cancel.approve" | "pricing.read" | "pricing.propose" | "finance.balance.read" | "discounts.approve_tier1" | "discounts.approve_tier2" | "payments.read" | "payments.record" | "payments.checkout" | "payments.verify" | "payments.reverse.request" | "payments.reverse.approve" | "invoices.read" | "invoices.issue" | "receipts.read" | "receipts.issue" | "refunds.request" | "refunds.approve" | "attendance.read" | "attendance.check_in_self" | "attendance.qr.open" | "attendance.record_manual" | "attendance.correct" | "attendance.correct_after_lock" | "certificates.read" | "certificates.issue" | "certificates.upload" | "certificates.collect" | "certificates.revoke" | "certificate_rules.manage" | "finance.reports.read" | "finance.reports.export" | "reports.operations.read" | "users.manage" | "roles.manage" | "branches.manage" | "audit.read" | "exports.sensitive" | "imports.preview" | "imports.execute" | "imports.finalize" | "legacy_archive.read" | "messaging.otp.read" | "messaging.otp.manage"; scopes: Array<"O" | "B" | "A" | "S">; }>; mfaRequired: boolean; mfaVerified: boolean; mfaSetupRequired: boolean; passwordChangeRequired: boolean; };

export type AuthController_updatePreferencesResponse = { id: string; version: number; organization: { id: string; code: string; name: string; }; name: string; preferredLocale: "ar" | "en" | null; localePreferenceSet: boolean; onboardingCompleted: boolean; branches: Array<{ id: string; code: string; name: string; }>; roles: Array<{ code: string; name: string; }>; permissions: Array<{ code: "students.read_basic" | "students.read_contact" | "students.create" | "students.update" | "students.update_sensitive" | "students.merge" | "students.registration.manage" | "me.profile.update" | "leads.read" | "leads.create" | "leads.update" | "leads.claim" | "leads.assign" | "leads.convert" | "business_accounts.read" | "business_accounts.manage" | "academic.catalog.read" | "academic.programs.manage" | "academic.cohorts.manage" | "academic.sessions.manage" | "enrollments.read" | "enrollments.create" | "enrollments.submit" | "enrollments.activate" | "enrollments.transfer" | "enrollments.postpone" | "enrollments.resume" | "enrollments.complete" | "enrollments.retake" | "enrollments.cancel.request" | "enrollments.cancel.approve" | "pricing.read" | "pricing.propose" | "finance.balance.read" | "discounts.approve_tier1" | "discounts.approve_tier2" | "payments.read" | "payments.record" | "payments.checkout" | "payments.verify" | "payments.reverse.request" | "payments.reverse.approve" | "invoices.read" | "invoices.issue" | "receipts.read" | "receipts.issue" | "refunds.request" | "refunds.approve" | "attendance.read" | "attendance.check_in_self" | "attendance.qr.open" | "attendance.record_manual" | "attendance.correct" | "attendance.correct_after_lock" | "certificates.read" | "certificates.issue" | "certificates.upload" | "certificates.collect" | "certificates.revoke" | "certificate_rules.manage" | "finance.reports.read" | "finance.reports.export" | "reports.operations.read" | "users.manage" | "roles.manage" | "branches.manage" | "audit.read" | "exports.sensitive" | "imports.preview" | "imports.execute" | "imports.finalize" | "legacy_archive.read" | "messaging.otp.read" | "messaging.otp.manage"; scopes: Array<"O" | "B" | "A" | "S">; }>; mfaRequired: boolean; mfaVerified: boolean; mfaSetupRequired: boolean; passwordChangeRequired: boolean; };

export type AuthController_completeOnboardingResponse = { id: string; version: number; organization: { id: string; code: string; name: string; }; name: string; preferredLocale: "ar" | "en" | null; localePreferenceSet: boolean; onboardingCompleted: boolean; branches: Array<{ id: string; code: string; name: string; }>; roles: Array<{ code: string; name: string; }>; permissions: Array<{ code: "students.read_basic" | "students.read_contact" | "students.create" | "students.update" | "students.update_sensitive" | "students.merge" | "students.registration.manage" | "me.profile.update" | "leads.read" | "leads.create" | "leads.update" | "leads.claim" | "leads.assign" | "leads.convert" | "business_accounts.read" | "business_accounts.manage" | "academic.catalog.read" | "academic.programs.manage" | "academic.cohorts.manage" | "academic.sessions.manage" | "enrollments.read" | "enrollments.create" | "enrollments.submit" | "enrollments.activate" | "enrollments.transfer" | "enrollments.postpone" | "enrollments.resume" | "enrollments.complete" | "enrollments.retake" | "enrollments.cancel.request" | "enrollments.cancel.approve" | "pricing.read" | "pricing.propose" | "finance.balance.read" | "discounts.approve_tier1" | "discounts.approve_tier2" | "payments.read" | "payments.record" | "payments.checkout" | "payments.verify" | "payments.reverse.request" | "payments.reverse.approve" | "invoices.read" | "invoices.issue" | "receipts.read" | "receipts.issue" | "refunds.request" | "refunds.approve" | "attendance.read" | "attendance.check_in_self" | "attendance.qr.open" | "attendance.record_manual" | "attendance.correct" | "attendance.correct_after_lock" | "certificates.read" | "certificates.issue" | "certificates.upload" | "certificates.collect" | "certificates.revoke" | "certificate_rules.manage" | "finance.reports.read" | "finance.reports.export" | "reports.operations.read" | "users.manage" | "roles.manage" | "branches.manage" | "audit.read" | "exports.sensitive" | "imports.preview" | "imports.execute" | "imports.finalize" | "legacy_archive.read" | "messaging.otp.read" | "messaging.otp.manage"; scopes: Array<"O" | "B" | "A" | "S">; }>; mfaRequired: boolean; mfaVerified: boolean; mfaSetupRequired: boolean; passwordChangeRequired: boolean; };

export type AuthController_requestPasswordResetResponse = { accepted: true; };

export type MfaController_enrollResponse = { factorId: string; secret: string; otpauthUri: string; };

export type MfaController_verifyResponse = { verifiedAt: string; recoveryCodes: Array<string>; };

export type MfaController_stepUpResponse = { verifiedAt: string; validForSeconds: number; };

export type MfaController_regenerateRecoveryCodesResponse = { recoveryCodes: Array<string>; };

export type PhoneOtpController_requestResponse = ResponseType5.RequestPhoneOtpResponseDto;

export type PhoneOtpController_verifyResponse = ResponseType4.LoginResponseDto;

export type BranchesController_listResponse = { items: Array<{ id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; isActive: boolean; code: string; }>; nextCursor: string | null; };

export type BranchesController_createResponse = { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; isActive: boolean; code: string; };

export type BranchesController_readResponse = { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; isActive: boolean; code: string; };

export type BranchesController_updateResponse = { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; isActive: boolean; code: string; };

export type RolesController_listResponse = { items: Array<{ grants: Array<{ permissionCode: string; scope: string; }>; id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; code: string; isSystem: boolean; }>; nextCursor: string | null; };

export type RolesController_createResponse = { grants: Array<ResponseType3.PermissionGrantDto>; id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; code: string; isSystem: boolean; };

export type RolesController_readResponse = { grants: Array<{ permissionCode: string; scope: string; }>; id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; code: string; isSystem: boolean; };

export type RolesController_updateResponse = { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; code: string; isSystem: boolean; };

export type RolesController_replaceGrantsResponse = { id: string; version: number; grants: Array<ResponseType3.PermissionGrantDto>; };

export type UsersController_listResponse = { items: Array<{ id: string; publicId: string; name: string | null; status: string; preferredLocale: string | null; mustChangePassword: boolean; version: number; employeeCode: string | null; identifiers: Array<{ type: string; normalizedValue: string; verifiedAt: Date | null; }>; roles: Array<{ id: string; name: string; code: string; }>; branches: Array<{ id: string; name: string; isActive: boolean; code: string; }>; createdAt: Date; updatedAt: Date; }>; nextCursor: string | null; };

export type UsersController_createResponse = { id: string; publicId: string; name: string | null; status: string; preferredLocale: string | null; mustChangePassword: boolean; version: number; employeeCode: string | null; identifiers: Array<{ type: string; normalizedValue: string; verifiedAt: Date | null; }>; roles: Array<{ id: string; name: string; code: string; }>; branches: Array<{ id: string; name: string; isActive: boolean; code: string; }>; createdAt: Date; updatedAt: Date; };

export type UsersController_readResponse = { id: string; publicId: string; name: string | null; status: string; preferredLocale: string | null; mustChangePassword: boolean; version: number; employeeCode: string | null; identifiers: Array<{ type: string; normalizedValue: string; verifiedAt: Date | null; }>; roles: Array<{ id: string; name: string; code: string; }>; branches: Array<{ id: string; name: string; isActive: boolean; code: string; }>; createdAt: Date; updatedAt: Date; };

export type UsersController_updateStatusResponse = { id: string; publicId: string; name: string | null; status: string; preferredLocale: string | null; mustChangePassword: boolean; version: number; employeeCode: string | null; identifiers: Array<{ type: string; normalizedValue: string; verifiedAt: Date | null; }>; roles: Array<{ id: string; name: string; code: string; }>; branches: Array<{ id: string; name: string; isActive: boolean; code: string; }>; createdAt: Date; updatedAt: Date; };

export type UsersController_replaceRolesResponse = { id: string; publicId: string; name: string | null; status: string; preferredLocale: string | null; mustChangePassword: boolean; version: number; employeeCode: string | null; identifiers: Array<{ type: string; normalizedValue: string; verifiedAt: Date | null; }>; roles: Array<{ id: string; name: string; code: string; }>; branches: Array<{ id: string; name: string; isActive: boolean; code: string; }>; createdAt: Date; updatedAt: Date; };

export type UsersController_replaceBranchesResponse = { id: string; publicId: string; name: string | null; status: string; preferredLocale: string | null; mustChangePassword: boolean; version: number; employeeCode: string | null; identifiers: Array<{ type: string; normalizedValue: string; verifiedAt: Date | null; }>; roles: Array<{ id: string; name: string; code: string; }>; branches: Array<{ id: string; name: string; isActive: boolean; code: string; }>; createdAt: Date; updatedAt: Date; };

export type LeadsController_listResponse = { items: Array<{ id: string; organizationId: string; createdAt: Date; personId: string | null; version: number; updatedAt: Date; state: string; branchId: string; assignedUserId: string | null; stageId: string | null; source: string | null; nextActionAt: Date | null; lostReason: string | null; } & { activities?: Array<{ id: string; organizationId: string; actorUserId: string; createdAt: Date; data: unknown; type: string; leadId: string; occurredAt: Date; }>; history?: Array<{ id: string; organizationId: string; actorUserId: string; leadId: string; occurredAt: Date; fromState: string | null; toState: string; reason: string | null; }>; person: { id: string; name: string | null; publicId: string; } | null; contacts: Array<{ id: string; organizationId: string; createdAt: Date; personId: string; updatedAt: Date; type: string; isPrimary: boolean; rawValue: string; normalizedValue: string | null; verifiedAt: Date | null; }>; stage: { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; isActive: boolean; code: string; ordinal: number; } | null; }>; nextCursor: string | null; };

export type LeadsController_createResponse = { id: string; organizationId: string; createdAt: Date; personId: string | null; version: number; updatedAt: Date; state: string; branchId: string; assignedUserId: string | null; stageId: string | null; source: string | null; nextActionAt: Date | null; lostReason: string | null; };

export type LeadsController_assigneesResponse = { items: Array<{ userId: string; personId: string; publicId: string; name: string | null; employeeCode: string | null; }>; };

export type LeadsController_readResponse = ({ id: string; organizationId: string; createdAt: Date; personId: string | null; version: number; updatedAt: Date; state: string; branchId: string; assignedUserId: string | null; stageId: string | null; source: string | null; nextActionAt: Date | null; lostReason: string | null; } & { activities?: Array<{ id: string; organizationId: string; actorUserId: string; createdAt: Date; data: unknown; type: string; leadId: string; occurredAt: Date; }>; history?: Array<{ id: string; organizationId: string; actorUserId: string; leadId: string; occurredAt: Date; fromState: string | null; toState: string; reason: string | null; }>; person: { id: string; name: string | null; publicId: string; } | null; contacts: Array<{ id: string; organizationId: string; createdAt: Date; personId: string; updatedAt: Date; type: string; isPrimary: boolean; rawValue: string; normalizedValue: string | null; verifiedAt: Date | null; }>; stage: { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; isActive: boolean; code: string; ordinal: number; } | null; }) | undefined;

export type LeadsController_updateResponse = { id: string; organizationId: string; createdAt: Date; personId: string | null; version: number; updatedAt: Date; state: string; branchId: string; assignedUserId: string | null; stageId: string | null; source: string | null; nextActionAt: Date | null; lostReason: string | null; };

export type LeadsController_claimResponse = { id: string; organizationId: string; createdAt: Date; personId: string | null; version: number; updatedAt: Date; state: string; branchId: string; assignedUserId: string | null; stageId: string | null; source: string | null; nextActionAt: Date | null; lostReason: string | null; };

export type LeadsController_assignResponse = { id: string; organizationId: string; createdAt: Date; personId: string | null; version: number; updatedAt: Date; state: string; branchId: string; assignedUserId: string | null; stageId: string | null; source: string | null; nextActionAt: Date | null; lostReason: string | null; };

export type LeadsController_addActivityResponse = { id: string; organizationId: string; actorUserId: string; createdAt: Date; data: unknown; type: string; leadId: string; occurredAt: Date; };

export type LeadsController_openResponse = { id: string; state: "OPEN" | "NEW" | "QUALIFIED" | "WON" | "LOST" | "DISQUALIFIED"; version: number; };

export type LeadsController_qualifyResponse = { id: string; state: "OPEN" | "NEW" | "QUALIFIED" | "WON" | "LOST" | "DISQUALIFIED"; version: number; };

export type LeadsController_loseResponse = { id: string; state: "OPEN" | "NEW" | "QUALIFIED" | "WON" | "LOST" | "DISQUALIFIED"; version: number; };

export type LeadsController_disqualifyResponse = { id: string; state: "OPEN" | "NEW" | "QUALIFIED" | "WON" | "LOST" | "DISQUALIFIED"; version: number; };

export type LeadsController_reopenResponse = { id: string; state: "OPEN" | "NEW" | "QUALIFIED" | "WON" | "LOST" | "DISQUALIFIED"; version: number; };

export type LeadsController_winResponse = { leadId: string; personId: string; enrollmentId: string; version: number; };

export type LeadStagesController_listResponse = Array<{ id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; isActive: boolean; code: string; ordinal: number; }>;

export type LeadStagesController_createResponse = { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; isActive: boolean; code: string; ordinal: number; };

export type LeadStagesController_updateResponse = { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; isActive: boolean; code: string; ordinal: number; };

export type BusinessAccountsController_listResponse = { items: Array<{ id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; owningBranchId: string; legalName: string; displayName: string; registrationNo: string | null; taxId: string | null; }>; nextCursor: string | null; };

export type BusinessAccountsController_createResponse = { billingAccountId: string; id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; owningBranchId: string; legalName: string; displayName: string; registrationNo: string | null; taxId: string | null; };

export type BusinessAccountsController_contactCandidatesResponse = { items: Array<{ personId: string; publicId: string; name: string | null; contacts: Array<{ personId: string; type: string; isPrimary: boolean; rawValue: string; }>; }>; };

export type BusinessAccountsController_readResponse = { billingAccount: { id: string; organizationId: string; createdAt: Date; personId: string | null; version: number; updatedAt: Date; kind: string; businessAccountId: string | null; currencyCode: string; } | null; contacts: Array<{ person: { id: string; name: string | null; publicId: string; } | null; id: string; organizationId: string; createdAt: Date; personId: string; businessAccountId: string; role: string | null; isPrimary: boolean; }>; id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; owningBranchId: string; legalName: string; displayName: string; registrationNo: string | null; taxId: string | null; };

export type BusinessAccountsController_updateResponse = { id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; owningBranchId: string; legalName: string; displayName: string; registrationNo: string | null; taxId: string | null; };

export type BusinessAccountsController_replaceContactsResponse = { id: string; version: number; contacts: Array<{ personId: string; role: string | null; isPrimary: boolean; }>; };

export type SalesDashboardController_overviewResponse = { insights?: { states: Array<{ key: string; value: number; }>; days: Array<{ date: string; count: number; }>; sources: Array<{ source: string | null; count: number; }>; withoutNextAction: number; }; generatedAt: string; timezone: "Africa/Cairo"; scope: "ASSIGNED" | "ACCESSIBLE"; period: { monthStart: string; todayStart: string; tomorrowStart: string; }; metrics: { openLeads: number; newLeadsThisMonth: number; convertedLeadsThisMonth: number; followUpsToday: number; overdueFollowUps: number; }; followUps: { total: number; items: Array<ResponseType1.SalesFollowUp>; }; };

export type EnrollmentController_listResponse = { items: Array<{ id: string; organizationId: string; createdAt: Date; version: number; updatedAt: Date; studentPersonId: string; programVersionId: string; billingAccountId: string; homeBranchId: string; kind: string; state: string; activatedAt: Date | null; completedAt: Date | null; cancelledAt: Date | null; } & { student: { id: string; name: string | null; publicId: string; } | null; programVersion: { id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; programId: string; effectiveFrom: Date | null; effectiveTo: Date | null; recordVersion: number; } | null; program: { id: string; organizationId: string; createdAt: Date; name: string; status: string; version: number; updatedAt: Date; code: string; } | null; activeCohortAssignment: { id: string; organizationId: string; createdAt: Date; createdBy: string; startsAt: Date; endsAt: Date | null; reason: string | null; enrollmentId: string; cohortId: string; } | null; cohort: { id: string; organizationId: string; createdAt: Date; name: string | null; status: string; version: number; updatedAt: Date; owningBranchId: string; programVersionId: string; code: string; startsOn: Date | null; endsOn: Date | null; capacity: number | null; } | null; }>; nextCursor: string | null; };

export type EnrollmentController_createResponse = { billingAccountId: string; id: string; organizationId: string; createdAt: Date; version: number; updatedAt: Date; studentPersonId: string; programVersionId: string; homeBranchId: string; kind: string; state: string; activatedAt: Date | null; completedAt: Date | null; cancelledAt: Date | null; };

export type EnrollmentController_readResponse = { finance?: unknown; assignments: Array<{ id: string; organizationId: string; createdAt: Date; createdBy: string; startsAt: Date; endsAt: Date | null; reason: string | null; enrollmentId: string; cohortId: string; }>; events: Array<{ id: string; organizationId: string; actorUserId: string; data: unknown; type: string; occurredAt: Date; fromState: string | null; toState: string | null; reason: string | null; enrollmentId: string; }>; retakes: Array<{ id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; reason: string | null; enrollmentId: string; programVersionModuleId: string; targetCohortModuleId: string | null; requestedBy: string; decidedBy: string | null; decidedAt: Date | null; }>; cancellationRequests: Array<never> | Array<{ id: string; organizationId: string; createdAt: Date; status: string; updatedAt: Date; reason: string; enrollmentId: string; requestedBy: string; decidedBy: string | null; decidedAt: Date | null; enrollmentVersion: number; decisionReason: string | null; }>; id?: string; organizationId?: string; createdAt?: Date; version?: number; updatedAt?: Date; studentPersonId?: string; programVersionId?: string; billingAccountId?: string; homeBranchId?: string; kind?: string; state?: string; activatedAt?: Date | null; completedAt?: Date | null; cancelledAt?: Date | null; student?: { id: string; name: string | null; publicId: string; } | null; programVersion?: { id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; programId: string; effectiveFrom: Date | null; effectiveTo: Date | null; recordVersion: number; } | null; program?: { id: string; organizationId: string; createdAt: Date; name: string; status: string; version: number; updatedAt: Date; code: string; } | null; activeCohortAssignment?: { id: string; organizationId: string; createdAt: Date; createdBy: string; startsAt: Date; endsAt: Date | null; reason: string | null; enrollmentId: string; cohortId: string; } | null; cohort?: { id: string; organizationId: string; createdAt: Date; name: string | null; status: string; version: number; updatedAt: Date; owningBranchId: string; programVersionId: string; code: string; startsOn: Date | null; endsOn: Date | null; capacity: number | null; } | null; };

export type EnrollmentController_submitResponse = { id: string; state: "ACTIVE" | "DRAFT" | "COMPLETED" | "CANCELLED" | "PENDING_APPROVAL" | "POSTPONED"; version: number; };

export type EnrollmentController_activateResponse = { id: string; state: "ACTIVE"; version: number; };

export type EnrollmentController_rejectResponse = { id: string; state: "ACTIVE" | "DRAFT" | "COMPLETED" | "CANCELLED" | "PENDING_APPROVAL" | "POSTPONED"; version: number; };

export type EnrollmentController_transferResponse = { id: string; cohortId: string; version: number; };

export type EnrollmentController_postponeResponse = { id: string; state: "ACTIVE" | "DRAFT" | "COMPLETED" | "CANCELLED" | "PENDING_APPROVAL" | "POSTPONED"; version: number; };

export type EnrollmentController_resumeResponse = { id: string; state: "ACTIVE" | "DRAFT" | "COMPLETED" | "CANCELLED" | "PENDING_APPROVAL" | "POSTPONED"; version: number; };

export type EnrollmentController_completeResponse = { id: string; state: "ACTIVE" | "DRAFT" | "COMPLETED" | "CANCELLED" | "PENDING_APPROVAL" | "POSTPONED"; version: number; };

export type EnrollmentController_requestCancellationResponse = { id: string; enrollmentId: string; status: string; };

export type EnrollmentController_requestRetakeResponse = { id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; reason: string | null; enrollmentId: string; programVersionModuleId: string; targetCohortModuleId: string | null; requestedBy: string; decidedBy: string | null; decidedAt: Date | null; };

export type EnrollmentCancellationController_approveResponse = { id: string; enrollmentId: string; status: string; };

export type EnrollmentCancellationController_rejectResponse = { id: string; enrollmentId: string; status: string; };

export type ModuleRetakesController_approveResponse = { id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; reason: string | null; enrollmentId: string; programVersionModuleId: string; targetCohortModuleId: string | null; requestedBy: string; decidedBy: string | null; decidedAt: Date | null; };

export type ModuleRetakesController_rejectResponse = { id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; reason: string | null; enrollmentId: string; programVersionModuleId: string; targetCohortModuleId: string | null; requestedBy: string; decidedBy: string | null; decidedAt: Date | null; };

export type FinanceController_paymentMethodsResponse = Array<{ id: string; organizationId: string; createdAt: Date; name: string; updatedAt: Date; isActive: boolean; code: string; verificationRequired: boolean; }>;

export type FinanceController_paymentsResponse = { items: Array<{ method: { id: string; name: string; code: string; } | null; receiptIssued: boolean; amount: string; refundedAmount: string; refundStatus: string; id: string; status: string; currencyCode: string; billingAccountId: string; enrollmentId: string | null; methodId: string; externalReference: string | null; receivedAt: Date; postedAt: Date | null; version: number; createdAt: Date; updatedAt: Date; }>; nextCursor: string | null; };

export type FinanceController_createPaymentResponse = { id: string; status: string; version: number; receiptSerial: string | null; };

export type FinanceController_paymentMethodMixResponse = { asOf: Date; range: { from: string; toExclusive: string; fromMonth: string; toMonth: string; timeZone: "Africa/Cairo"; }; currencyCode: "EGP"; totalAmount: string; totalPayments: number; items: Array<{ method: { id: string; name: string; code: string; }; amount: string; paymentCount: number; percentage: number; }>; };

export type FinanceController_paymentResponse = { method: { id: string; name: string; code: string; } | null; pendingApprovals: Array<{ kind: "REFUND"; requestedAmount: string; id: string; createdAt: Date; status: string; reason: string; requestedBy: string; } | { kind: "REVERSAL"; requestedAmount: null; id: string; createdAt: Date; status: string; reason: string; requestedBy: string; }>; events: Array<{ id: string; organizationId: string; actorUserId: string; occurredAt: Date; reason: string | null; paymentId: string; fromStatus: string | null; toStatus: string; }>; receipt: { serialNumber: string; amount: string; documentLabel: string; id: string; paymentId: string; billingAccountId: string; fiscalYear: number; currencyCode: string; payerSnapshot: unknown; issuedAt: Date; createdBy: string; createdAt: Date; } | null; refunds: Array<{ amount: string; id: string; organizationId: string; createdAt: Date; ledgerEntryId: string; refundRequestId: string; paymentId: string; processedBy: string; processedAt: Date; }>; gatewayAttempts: Array<{ id: string; provider: string; status: string; amount: string; currencyCode: string; createdAt: Date; }>; amount: string; refundedAmount: string; refundStatus: string; id: string; status: string; currencyCode: string; billingAccountId: string; enrollmentId: string | null; methodId: string; externalReference: string | null; receivedAt: Date; postedAt: Date | null; version: number; createdAt: Date; updatedAt: Date; };

export type FinanceController_invoicesResponse = { items: Array<{ lines?: Array<{ quantity: string; unitAmount: string; taxAmount: string; lineTotal: string; id: string; organizationId: string; createdAt: Date; ledgerEntryId: string | null; invoiceId: string; descriptionAr: string; descriptionEn: string; }>; creditNotes?: Array<{ serialNumber: string; amount: string; id: string; organizationId: string; createdAt: Date; reason: string; ledgerEntryId: string; fiscalYear: number; issuedAt: Date; invoiceId: string; issuedBy: string; }>; serialNumber: string | null; subtotal: string; taxAmount: string; totalAmount: string; settledAmount: string; creditedAmount: string; paymentStatus: string; id: string; status: string; fiscalYear: number | null; currencyCode: string; billingAccountId: string; version: number; customerSnapshot: unknown; issuedAt: Date | null; voidedAt: Date | null; createdBy: string; createdAt: Date; updatedAt: Date; }>; nextCursor: string | null; };

export type FinanceController_createInvoiceResponse = { id: string; status: string; version: number; };

export type FinanceController_eligibleInvoiceEntriesResponse = { items: Array<{ id: string; enrollmentId: string | null; entryType: string; description: string | null; amount: string; currencyCode: string; postedAt: Date; }>; nextCursor: string | null; };

export type FinanceController_invoiceResponse = { lines?: Array<{ quantity: string; unitAmount: string; taxAmount: string; lineTotal: string; id: string; organizationId: string; createdAt: Date; ledgerEntryId: string | null; invoiceId: string; descriptionAr: string; descriptionEn: string; }>; creditNotes?: Array<{ serialNumber: string; amount: string; id: string; organizationId: string; createdAt: Date; reason: string; ledgerEntryId: string; fiscalYear: number; issuedAt: Date; invoiceId: string; issuedBy: string; }>; serialNumber: string | null; subtotal: string; taxAmount: string; totalAmount: string; settledAmount: string; creditedAmount: string; paymentStatus: string; id: string; status: string; fiscalYear: number | null; currencyCode: string; billingAccountId: string; version: number; customerSnapshot: unknown; issuedAt: Date | null; voidedAt: Date | null; createdBy: string; createdAt: Date; updatedAt: Date; };

export type FinanceController_receiptsResponse = { items: Array<{ serialNumber: string; amount: string; documentLabel: string; id: string; paymentId: string; billingAccountId: string; fiscalYear: number; currencyCode: string; payerSnapshot: unknown; issuedAt: Date; createdBy: string; createdAt: Date; }>; nextCursor: string | null; };

export type FinanceController_receiptResponse = { serialNumber: string; amount: string; documentLabel: string; id: string; paymentId: string; billingAccountId: string; fiscalYear: number; currencyCode: string; payerSnapshot: unknown; issuedAt: Date; createdBy: string; createdAt: Date; };

export type FinanceController_billingSummaryResponse = { billingAccountId: string; enrollmentId: string | null; currencyCode: string; totalDebits: string; totalCredits: string; balance: string; outstandingDebits: string; unappliedCredits: string; };

export type FinanceController_enrollmentSummaryResponse = { billingAccountId: string; enrollmentId: string | null; currencyCode: string; totalDebits: string; totalCredits: string; balance: string; outstandingDebits: string; unappliedCredits: string; };

export type FinanceController_agingResponse = { asOf: string; currencyCode: string; totals: { [k: string]: string; }; rows: Array<{ installmentId: string; enrollmentId: string | null; dueDate: Date; ageDays: number; bucket: string; outstanding: string; }>; };

export type FinanceController_createPaymobCheckoutResponse = { attemptId: string; status: string; amount: string; currencyCode: "EGP"; checkoutUrl: string | null; paymentId: string | null; };

export type FinanceController_paymobCheckoutStatusResponse = { attemptId: string; status: string; amount: string; currencyCode: "EGP"; paymentId: string | null; updatedAt: Date; };

export type FinanceController_handlePaymobWebhookResponse = { accepted: boolean; duplicate: boolean; status: string; paymentId?: never; } | { accepted: boolean; duplicate: boolean; status: string; paymentId: string | null; };

export type FinanceController_issueReceiptResponse = { serialNumber: string; amount: string; documentLabel: string; id: string; paymentId: string; billingAccountId: string; fiscalYear: number; currencyCode: string; payerSnapshot: unknown; issuedAt: Date; createdBy: string; createdAt: Date; };

export type FinanceController_postPaymentResponse = { id: string; status: string; version: number; receiptSerial: string | null; };

export type FinanceController_rejectPaymentResponse = { id: string; status: string; version: number; receiptSerial: string | null; };

export type FinanceController_requestReversalResponse = { id: string; status: string; };

export type FinanceController_approveReversalResponse = { id: string; status: string; version: number; receiptSerial: string | null; };

export type FinanceController_requestRefundResponse = { id: string; status: string; };

export type FinanceController_approveRefundResponse = { id: string; amount: string; };

export type FinanceController_issueInvoiceResponse = { id: string; status: string; serialNumber: string | null; version: number; };

export type FinanceController_cancelInvoiceResponse = { id: string; status: string; serialNumber: string | null; version: number; };

export type FinanceController_voidInvoiceResponse = { id: string; status: string; serialNumber: string | null; version: number; };

export type FinanceController_createCreditNoteResponse = { id: string; serialNumber: string; amount: string; };

export type PricingController_listResponse = { items: Array<ResponseType2.PricingResult>; nextCursor: string | null; };

export type PricingController_createResponse = { id: string; status: string; version: number; lockVersion: number; subtotal: string; discountAmount: string; totalAmount: string; requiredApprovalTier: 1 | 2; };

export type PricingController_readResponse = { enrollmentId: string; currencyCode: string; proposedBy: string; approvedBy: string | null; approvedAt: Date | null; lines: Array<{ quantity: string; unitAmount: string; lineAmount: string; id: string; organizationId: string; createdAt: Date; type: string; descriptionAr: string; descriptionEn: string; pricingAgreementId: string; }>; schedules: Array<{ installments: Array<{ amount: string; id: string; organizationId: string; createdAt: Date; ordinal: number; debitEntryId: string | null; scheduleId: string; dueDate: Date; }>; id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; enrollmentId: string; approvedBy: string | null; pricingAgreementId: string; lockVersion: number; approvedAt: Date | null; }>; id: string; status: string; version: number; lockVersion: number; subtotal: string; discountAmount: string; totalAmount: string; requiredApprovalTier: 1 | 2; };

export type PricingController_updateResponse = { id: string; status: string; version: number; lockVersion: number; subtotal: string; discountAmount: string; totalAmount: string; requiredApprovalTier: 1 | 2; };

export type PricingController_submitResponse = { id: string; status: string; version: number; lockVersion: number; subtotal: string; discountAmount: string; totalAmount: string; requiredApprovalTier: 1 | 2; };

export type PricingController_approveResponse = { id: string; status: string; version: number; lockVersion: number; subtotal: string; discountAmount: string; totalAmount: string; requiredApprovalTier: 1 | 2; };

export type PricingController_rejectResponse = { id: string; status: string; version: number; lockVersion: number; subtotal: string; discountAmount: string; totalAmount: string; requiredApprovalTier: 1 | 2; };

export type PricingController_createScheduleResponse = { id: string; status: string; version: number; lockVersion: number; totalAmount: string; };

export type PricingController_updateScheduleResponse = { id: string; status: string; version: number; lockVersion: number; totalAmount: string; };

export type PricingController_approveScheduleResponse = { id: string; status: string; version: number; lockVersion: number; totalAmount: string; };

export type FinanceInstallmentController_listResponse = { items: Array<{ id: string; ordinal: number; dueDate: string; originalAmount: string; allocatedAmount: string; outstandingAmount: string; currency: string; state: "PAID" | "PARTIALLY_PAID" | "OVERDUE" | "DUE" | "UPCOMING"; payable: boolean; }>; nextCursor: string | null; };

export type FinanceRequestDecisionController_rejectRefundResponse = { id: string; status: string; };

export type FinanceRequestDecisionController_withdrawRefundResponse = { id: string; status: string; };

export type FinanceRequestDecisionController_rejectReversalResponse = { id: string; status: string; };

export type FinanceRequestDecisionController_withdrawReversalResponse = { id: string; status: string; };

export type AttendanceController_rosterResponse = { session: { id: string; status: string; attendanceWindowState: string; startsAt: string | null; endsAt: string | null; version: number; }; items: Array<{ enrollmentId: string; student: { id: string; name: string | null; publicId: string; } | null; attendance: { id: string; status: string; source: string; recordedAt: string; version: number; } | null; effectiveStatus: string; }>; nextCursor: string | null; };

export type AttendanceController_getSelfTokenResponse = { token: string; };

export type AttendanceController_readRecordResponse = { recordedAt: string; createdAt: string; updatedAt: string; session: { id: string; startsAt: string | null; endsAt: string | null; attendanceWindowState: string; }; enrollment: { id: string; state: string; student: { id: string; name: string | null; publicId: string; }; }; events: Array<{ occurredAt: string; id: string; organizationId: string; actorUserId: string | null; version: number; reason: string | null; fromStatus: string | null; toStatus: string; attendanceRecordId: string; }>; makeup: { compensatesRecordId: string | null; compensatedByRecordId: string | null; }; id: string; organizationId: string; version: number; source: string; enrollmentId: string; sessionId: string; currentStatus: string; recordedBy: string | null; };

export type AttendanceController_summaryResponse = { enrollmentId: string; numerator: number; denominator: number; ratio: string | null; minimumRatio: string; meetsPolicy: boolean; statusCounts: Record<string, number>; makeupCredits: number; policyId: string | null; };

export type AttendanceController_anomaliesResponse = { items: Array<{ occurredAt: string; id: string; organizationId: string; actorUserId: string | null; metadata: unknown; studentPersonId: string | null; sessionId: string | null; challengeId: string | null; reasonCode: string; }>; nextCursor: string | null; };

export type AttendanceController_listPoliciesResponse = { items: Array<{ minimumRatio: string; effectiveFrom: string; effectiveTo: string | null; createdAt: string; id: string; programVersionId: string; cohortId: string | null; version: number; lockAfterMinutes: number; checkInOpensBeforeMinutes: number; checkInClosesAfterMinutes: number; createdBy: string; }>; };

export type AttendanceController_createPolicyResponse = { id: string; version: number; minimumRatio: string; effectiveFrom: string; effectiveTo: string | null; };

export type AttendanceController_openWindowResponse = { id: string; state: "SCHEDULED" | "OPEN" | "CLOSED" | "LOCKED"; version: number; };

export type AttendanceController_closeWindowResponse = { id: string; state: string; version: number; rosterCount: number; absentCount: number; };

export type AttendanceController_openChallengeResponse = { token: string; expiresAt: string; };

export type AttendanceController_checkInResponse = { id: string; status: string; version: number; };

export type AttendanceController_scanResponse = { id: string; status: string; version: number; };

export type AttendanceController_recordManualResponse = { id: string; status: string; version: number; };

export type AttendanceController_correctResponse = { id: string; status: string; version: number; };

export type AttendanceController_makeupResponse = { id: string; };

export type CertificatesController_listResponse = { items: Array<{ student: { id: string; name: string | null; publicId: string; } | null; issuedAt: string; revokedAt: string | null; createdAt: string; updatedAt: string; id: string; enrollmentId: string; evaluationId: string; supersedesId: string | null; serial: string; validityStatus: string; fulfillmentStatus: string; pdfStatus: string; fileAssetId: string | null; issuedBy: string; revokedBy: string | null; revocationReason: string | null; version: number; }>; nextCursor: string | null; };

export type CertificatesController_evaluationsResponse = { items: Array<{ attendanceRatio: string | null; evaluatedAt: string; createdAt: string; id: string; organizationId: string; enrollmentId: string; ruleVersionId: string; academicResult: string; financialHold: boolean; evidenceSnapshot: unknown; evaluatedBy: string | null; }>; };

export type CertificatesController_eligibilityResponse = { attendanceRatio: string | null; minimumRatio: string; academicEligibility: string; financialHold: boolean; outstanding: string; completionSatisfied: boolean; overallEligibility: boolean; ruleId: string; };

export type CertificatesController_verifyResponse = { name: string | null; programAr: string; programEn: string; serial: string; issuedAt: string; validityStatus: string; };

export type CertificatesController_downloadResponse = { url: string; expiresAt: string; };

export type CertificatesController_readResponse = { verificationToken: string; student: { id: string; name: string | null; publicId: string; }; program: { id: string; name: string; code: string; }; evaluation: { attendanceRatio: string | null; evaluatedAt: string; createdAt: string; id: string; organizationId: string; enrollmentId: string; ruleVersionId: string; academicResult: string; financialHold: boolean; evidenceSnapshot: unknown; evaluatedBy: string | null; }; events: Array<{ occurredAt: string; id: string; organizationId: string; actorUserId: string | null; type: string; reason: string | null; certificateId: string; fromValue: string | null; toValue: string | null; }>; issuedAt: string; revokedAt: string | null; createdAt: string; updatedAt: string; id: string; enrollmentId: string; evaluationId: string; supersedesId: string | null; serial: string; validityStatus: string; fulfillmentStatus: string; pdfStatus: string; fileAssetId: string | null; issuedBy: string; revokedBy: string | null; revocationReason: string | null; version: number; };

export type CertificatesController_evaluateResponse = { id: string; enrollmentId: string; attendanceRatio: string | null; minimumRatio: string; academicResult: string; financialHold: boolean; outstanding: string; completionSatisfied: boolean; ruleVersionId: string; };

export type CertificatesController_issueResponse = { id: string; serial: string; verificationToken: string; validityStatus: string; pdfStatus: string; version: number; };

export type CertificatesController_uploadResponse = { id: string; fileAssetId: string; pdfStatus: "AVAILABLE"; version: number; sha256: string; };

export type CertificatesController_reissueResponse = { id: string; serial: string; verificationToken: string; validityStatus: string; pdfStatus: string; version: number; };

export type CertificatesController_revokeResponse = { id: string; validityStatus: string; version: number; };

export type CertificatesController_printResponse = { id: string; fulfillmentStatus: string; version: number; };

export type CertificatesController_readyResponse = { id: string; fulfillmentStatus: string; version: number; };

export type CertificatesController_collectResponse = { id: string; fulfillmentStatus: string; version: number; };

export type CertificateRulesController_listResponse = { items: Array<{ minimumRatio: string; effectiveFrom: string; effectiveTo: string | null; createdAt: string; id: string; programVersionId: string; cohortId: string | null; version: number; createdBy: string; }>; };

export type CertificateRulesController_createResponse = { id: string; version: number; minimumRatio: string; effectiveFrom: string; effectiveTo: string | null; };

export type ImportsController_listResponse = { items: Array<{ id: string; organizationId: string; createdAt: Date; status: string; updatedAt: Date; receivedAt: Date; sourceSha256: string; receivedBy: string; finalizedAt: Date | null; finalizedBy: string | null; reconciliation: unknown; }>; nextCursor: string | null; };

export type ImportsController_stageResponse = { id: string; status: string; sha256: string; duplicate: boolean; rowCount?: never; } | { id: string; status: string; sha256: string; duplicate: boolean; rowCount: number; };

export type ImportsController_detailResponse = { sources: Array<{ sizeBytes: string; id: string; organizationId: string; createdAt: Date; sha256: string; batchId: string; originalName: string; storedPath: string | null; workbookMeta: unknown; }>; dispositions: { [k: string]: number; }; openIssues: number; reconciliation: Array<{ id: string; organizationId: string; createdAt: Date; batchId: string; metric: string; dimension: unknown; sourceValue: string | null; targetValue: string | null; difference: string | null; passed: boolean; }>; id: string; organizationId: string; createdAt: Date; status: string; updatedAt: Date; receivedAt: Date; sourceSha256: string; receivedBy: string; finalizedAt: Date | null; finalizedBy: string | null; };

export type ImportsController_issuesResponse = { items: Array<{ row: { id: string; disposition: string; sheetName: string; rowNumber: number; rowHash: string; rawValues: unknown; normalizedValues: unknown; targetType: string | null; targetId: string | null; } | null; candidates: Array<unknown>; id: string; organizationId: string; createdAt: Date; status: string; code: string; batchId: string; importRowId: string | null; severity: string; message: string; details: unknown; resolvedBy: string | null; resolvedAt: Date | null; }>; nextCursor: string | null; };

export type ImportsController_resolveIssueResponse = { id: string; rowId: string; decision: "CORRECT" | "EXCLUDE"; disposition: string; status: string; };

export type ImportsController_archiveQuarantinedResponse = { id: string; status: "VALIDATED"; archivedRows: number; resolvedIssues: number; remainingOpenIssues: number; };

export type ImportsController_validateResponse = { batchId: string; dispositions: { [k: string]: number; }; openIssues: number; };

export type ImportsController_reconcileResponse = { batchId: string; passed: boolean; metrics: Array<ResponseType6.ImportMetric>; };

export type ImportsController_promoteResponse = { id: string; status: "FINALIZED"; promotedRows: number; replayed: true; } | { id: string; status: "VALIDATED"; partial: boolean; promotedRows: number; quarantinedRows: number; openIssues: number; };

export type ImportsController_finalizeResponse = { id: string; status: "FINALIZED"; replayed: true; } | { id: string; status: "FINALIZED"; metrics: Array<ResponseType6.ImportMetric>; };

export type LegacyArchiveController_listResponse = { items: Array<{ sourceFileName: string | null; id: string; createdAt: Date; batchId: string; sourceFileId: string; sheetName: string; rowNumber: number; category: string; dataHash: string; }>; nextCursor: string | null; };

export type LegacyArchiveController_readResponse = { id: string; batchId: string; category: string; sourceFileId: string; sourceFileName: string | null; sheetName: string; rowNumber: number; dataHash: string; data: unknown; createdAt: Date; };

export type AcademicController_listResponse = { items: Array<{ id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; startsAt: Date | null; endsAt: Date | null; ordinal: number; cohortId: string; cohortModuleId: string; roomId: string | null; deliveryMode: string; attendanceWindowState: string; attendanceLockedAt: Date | null; } & { cohort: { id: string; organizationId: string; createdAt: Date; name: string | null; status: string; version: number; updatedAt: Date; owningBranchId: string; programVersionId: string; code: string; startsOn: Date | null; endsOn: Date | null; capacity: number | null; } | null; room: { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; branchId: string; isActive: boolean; code: string; capacity: number | null; } | null; trainers: Array<{ trainer: { person: { id: string; name: string | null; publicId: string; } | null; id: string; organizationId: string; createdAt: Date; personId: string; status: string; version: number; updatedAt: Date; biographyAr: string | null; biographyEn: string | null; } | null; id: string; organizationId: string; createdAt: Date; updatedAt: Date; startsAt: Date | null; endsAt: Date | null; role: string; sessionId: string; trainerId: string; bookingStatus: string; }>; module: { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; isActive: boolean; code: string; } | null; coordinatorName: string | null; }>; nextCursor: string | null; };

export type AcademicController_createResponse = { id: string; status: string; version: number; };

export type AcademicController_readResponse = ({ id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; startsAt: Date | null; endsAt: Date | null; ordinal: number; cohortId: string; cohortModuleId: string; roomId: string | null; deliveryMode: string; attendanceWindowState: string; attendanceLockedAt: Date | null; } & { cohort: { id: string; organizationId: string; createdAt: Date; name: string | null; status: string; version: number; updatedAt: Date; owningBranchId: string; programVersionId: string; code: string; startsOn: Date | null; endsOn: Date | null; capacity: number | null; } | null; room: { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; branchId: string; isActive: boolean; code: string; capacity: number | null; } | null; trainers: Array<{ trainer: { person: { id: string; name: string | null; publicId: string; } | null; id: string; organizationId: string; createdAt: Date; personId: string; status: string; version: number; updatedAt: Date; biographyAr: string | null; biographyEn: string | null; } | null; id: string; organizationId: string; createdAt: Date; updatedAt: Date; startsAt: Date | null; endsAt: Date | null; role: string; sessionId: string; trainerId: string; bookingStatus: string; }>; module: { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; isActive: boolean; code: string; } | null; coordinatorName: string | null; }) | undefined;

export type AcademicController_rescheduleResponse = { id: string; status: string; version: number; };

export type AcademicController_cancelResponse = { id: string; status: string; version: number; };

export type AcademicController_completeResponse = { id: string; status: string; version: number; };

export type ProgramsController_listResponse = { items: Array<{ versions: Array<{ id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; programId: string; effectiveFrom: Date | null; effectiveTo: Date | null; recordVersion: number; }>; id: string; organizationId: string; createdAt: Date; name: string; status: string; version: number; updatedAt: Date; code: string; }>; nextCursor: string | null; };

export type ProgramsController_createResponse = { id: string; organizationId: string; createdAt: Date; name: string; status: string; version: number; updatedAt: Date; code: string; };

export type ProgramsController_readResponse = { versions: Array<{ id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; programId: string; effectiveFrom: Date | null; effectiveTo: Date | null; recordVersion: number; }>; id: string; organizationId: string; createdAt: Date; name: string; status: string; version: number; updatedAt: Date; code: string; };

export type ProgramsController_updateResponse = { id: string; organizationId: string; createdAt: Date; name: string; status: string; version: number; updatedAt: Date; code: string; };

export type ProgramsController_createVersionResponse = { modules: Array<{ moduleId: string; ordinal: number; required: boolean; }>; id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; programId: string; effectiveFrom: Date | null; effectiveTo: Date | null; recordVersion: number; };

export type ProgramVersionsController_readResponse = { modules: Array<{ module: { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; isActive: boolean; code: string; } | null; id: string; organizationId: string; createdAt: Date; programVersionId: string; ordinal: number; moduleId: string; required: boolean; }>; id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; programId: string; effectiveFrom: Date | null; effectiveTo: Date | null; recordVersion: number; };

export type ProgramVersionsController_replaceCurriculumResponse = { id: string; recordVersion: number; modules: Array<{ moduleId: string; ordinal: number; required: boolean; }>; };

export type ProgramVersionsController_publishResponse = { id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; programId: string; effectiveFrom: Date | null; effectiveTo: Date | null; recordVersion: number; };

export type ProgramVersionsController_archiveResponse = { id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; programId: string; effectiveFrom: Date | null; effectiveTo: Date | null; recordVersion: number; };

export type ModulesController_listResponse = { items: Array<{ id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; isActive: boolean; code: string; }>; nextCursor: string | null; };

export type ModulesController_createResponse = { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; isActive: boolean; code: string; };

export type ModulesController_updateResponse = { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; isActive: boolean; code: string; };

export type CohortsController_listResponse = { items: Array<{ id: string; organizationId: string; createdAt: Date; name: string | null; status: string; version: number; updatedAt: Date; owningBranchId: string; programVersionId: string; code: string; startsOn: Date | null; endsOn: Date | null; capacity: number | null; } & { scheduleFirstAt: string | null; scheduleLastAt: string | null; sourceSessionCount: number; scheduledSessionCount: number; scheduleConflictCount: number; scheduleState: ResponseType0.CohortScheduleState; learnerCount: number; sourceAliases: Array<string>; capacitySource: string; remainingEnrollmentCount: number | null; intakeStatus: string; confirmedEnrollmentCount: number; pendingEnrollmentCount: number; postponedEnrollmentCount: number; reservedEnrollmentCount: number; }>; nextCursor: string | null; };

export type CohortsController_createResponse = { id: string; organizationId: string; createdAt: Date; name: string | null; status: string; version: number; updatedAt: Date; owningBranchId: string; programVersionId: string; code: string; startsOn: Date | null; endsOn: Date | null; capacity: number | null; };

export type CohortsController_readResponse = { modules: Array<{ module: { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; isActive: boolean; code: string; } | null; id: string; organizationId: string; createdAt: Date; ordinal: number; cohortId: string; programVersionModuleId: string; }>; id?: string; organizationId?: string; createdAt?: Date; name?: string | null; status?: string; version?: number; updatedAt?: Date; owningBranchId?: string; programVersionId?: string; code?: string; startsOn?: Date | null; endsOn?: Date | null; capacity?: number | null; scheduleFirstAt?: string | null; scheduleLastAt?: string | null; sourceSessionCount?: number; scheduledSessionCount?: number; scheduleConflictCount?: number; scheduleState?: ResponseType0.CohortScheduleState; learnerCount?: number; sourceAliases?: Array<string>; capacitySource?: string; remainingEnrollmentCount?: number | null; intakeStatus?: string; confirmedEnrollmentCount?: number; pendingEnrollmentCount?: number; postponedEnrollmentCount?: number; reservedEnrollmentCount?: number; };

export type CohortsController_updateResponse = { id: string; organizationId: string; createdAt: Date; name: string | null; status: string; version: number; updatedAt: Date; owningBranchId: string; programVersionId: string; code: string; startsOn: Date | null; endsOn: Date | null; capacity: number | null; };

export type CohortsController_transitionResponse = { id: string; organizationId: string; createdAt: Date; name: string | null; status: string; version: number; updatedAt: Date; owningBranchId: string; programVersionId: string; code: string; startsOn: Date | null; endsOn: Date | null; capacity: number | null; };

export type RoomsController_listResponse = { items: Array<{ id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; branchId: string; isActive: boolean; code: string; capacity: number | null; } & { scheduledSessions: number; cohortCount: number; firstSessionAt: string | null; lastSessionAt: string | null; capacitySource: string; }>; nextCursor: string | null; };

export type RoomsController_createResponse = { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; branchId: string; isActive: boolean; code: string; capacity: number | null; };

export type RoomsController_updateResponse = { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; branchId: string; isActive: boolean; code: string; capacity: number | null; };

export type TrainersController_listResponse = { items: Array<{ person: { id: string; name: string | null; publicId: string; } | null; id: string; organizationId: string; createdAt: Date; personId: string; status: string; version: number; updatedAt: Date; biographyAr: string | null; biographyEn: string | null; } & { scheduledSessions: number; cohortCount: number; firstSessionAt: string | null; lastSessionAt: string | null; }>; nextCursor: string | null; };

export type TrainersController_createResponse = { person: { id: string; organizationId: string; createdAt: Date; name: string | null; version: number; updatedAt: Date; publicId: string; birthDate: Date | null; gender: string | null; }; id: string; organizationId: string; createdAt: Date; personId: string; status: string; version: number; updatedAt: Date; biographyAr: string | null; biographyEn: string | null; };

export type TrainersController_readResponse = ({ person: { id: string; name: string | null; publicId: string; } | null; id: string; organizationId: string; createdAt: Date; personId: string; status: string; version: number; updatedAt: Date; biographyAr: string | null; biographyEn: string | null; } & { scheduledSessions: number; cohortCount: number; firstSessionAt: string | null; lastSessionAt: string | null; }) | undefined;

export type TrainersController_updateResponse = { id: string; organizationId: string; createdAt: Date; personId: string; status: string; version: number; updatedAt: Date; biographyAr: string | null; biographyEn: string | null; };

export type CalendarController_readResponse = { from: string; to: string; items: Array<{ cohort: { id: string; organizationId: string; createdAt: Date; name: string | null; status: string; version: number; updatedAt: Date; owningBranchId: string; programVersionId: string; code: string; startsOn: Date | null; endsOn: Date | null; capacity: number | null; } | null; room: { id: string; organizationId: string; createdAt: Date; name: string; version: number; updatedAt: Date; branchId: string; isActive: boolean; code: string; capacity: number | null; } | null; trainers: Array<{ id: string; organizationId: string; createdAt: Date; updatedAt: Date; startsAt: Date | null; endsAt: Date | null; role: string; sessionId: string; trainerId: string; bookingStatus: string; }>; id: string; organizationId: string; createdAt: Date; status: string; version: number; updatedAt: Date; startsAt: Date | null; endsAt: Date | null; ordinal: number; cohortId: string; cohortModuleId: string; roomId: string | null; deliveryMode: string; attendanceWindowState: string; attendanceLockedAt: Date | null; }>; };

export type StudentsController_listResponse = { items: Array<{ studentProfile: { id: string; organizationId: string; createdAt: Date; personId: string; version: number; updatedAt: Date; portalStatus: string; } | null; enrollmentSummary: { total: number; active: number; latestState: string | null; program: { id: string; name: string; code: string; } | null; cohort: { id: string; name: string | null; status: string; code: string; startsOn: Date | null; endsOn: Date | null; } | null; branch: { id: string; name: string; code: string; } | null; }; id: string; organizationId: string; createdAt: Date; name: string | null; version: number; updatedAt: Date; publicId: string; birthDate: Date | null; gender: string | null; }>; nextCursor: string | null; };

export type StudentsController_createResponse = { id: string; publicId: string; version: number; billingAccountId: string; };

export type StudentsController_readResponse = { possibleDuplicates?: Array<ResponseType14.Candidate>; studentProfile: { id: string; organizationId: string; createdAt: Date; personId: string; version: number; updatedAt: Date; portalStatus: string; }; contacts: Array<never> | Array<{ id: string; organizationId: string; createdAt: Date; personId: string; updatedAt: Date; type: string; isPrimary: boolean; rawValue: string; normalizedValue: string | null; verifiedAt: Date | null; }>; enrollmentSummary: { total: number; active: number; latestState: string | null; program: { id: string; name: string; code: string; } | null; cohort: { id: string; name: string | null; status: string; code: string; startsOn: Date | null; endsOn: Date | null; } | null; branch: { id: string; name: string; code: string; } | null; }; enrollments: Array<{ source: { workbookShouldPaid?: number | null; workbookRemaining?: number | null; legacyCode: string | null; legacyState: string | null; telesalesAgent: string | null; acquisitionSource: string | null; secondaryCode: string | null; deliveryMode: string | null; rowNumber: number | null; importedAt: Date | null; } | null; certificate?: { importedStatus: string | null; issuedCount: number; latest: { id: string; enrollmentId: string; issuedAt: Date; serial: string; validityStatus: string; fulfillmentStatus: string; pdfStatus: string; } | null; } | null; attendance?: { total: number; present: number; absent: number; late: number; excused: number; rate: number | null; } | null; finance?: { currencyCode: string; subtotal: number | null; discountAmount: number | null; totalAmount: number | null; paidAmount: number; outstandingBalance: number; paymentCount: number; } | null; programVersion: { id: string; status: string; version: number; programId: string; } | null; program: { id: string; name: string; code: string; } | null; cohort: { id: string; name: string | null; status: string; code: string; startsOn: Date | null; endsOn: Date | null; } | null; cohortStartedAt: Date | null; branch: { id: string; name: string; code: string; } | null; id: string; createdAt: Date; version: number; studentPersonId: string; programVersionId: string; homeBranchId: string; kind: string; state: string; activatedAt: Date | null; completedAt: Date | null; cancelledAt: Date | null; }>; id: string; organizationId: string; createdAt: Date; name: string | null; version: number; updatedAt: Date; publicId: string; birthDate: Date | null; gender: string | null; };

export type StudentsController_updateResponse = { id: string; organizationId: string; createdAt: Date; name: string | null; version: number; updatedAt: Date; publicId: string; birthDate: Date | null; gender: string | null; };

export type StudentsController_matchResponse = Array<ResponseType14.Candidate>;

export type StudentsController_mergeResponse = { sourcePersonId: string; targetPersonId: string; targetVersion: number; movedEnrollments: number; movedBillingAccounts: number; };

export type StudentsController_replaceContactsResponse = { id: string; version: number; contacts: Array<ResponseType13.PreparedContact>; };

export type StudentRegistrationController_listResponse = ResponseType15.StudentRegistrationsPageDto;

export type StudentRegistrationController_registerResponse = ResponseType15.RegistrationResponseDto;

export type StudentRegistrationController_getOneResponse = ResponseType15.StudentRegistrationDetailDto;

export type StudentRegistrationController_approveResponse = ResponseType15.StudentRegistrationDetailDto;

export type StudentRegistrationController_rejectResponse = ResponseType15.StudentRegistrationDetailDto;

export type ReportingController_operationsOverviewResponse = { from: string; to: string; branchId: string | null; leads: { total: number; byState: Record<string, number>; }; enrollments: { total: number; byState: Record<string, number>; }; cohorts: { total: number; byState: Record<string, number>; }; sessions: { total: number; byState: Record<string, number>; }; attendance: { total: number; byStatus: Record<string, number>; }; certificates: { total: number; byValidity: Record<string, number>; byFileStatus: Record<string, number>; }; };

export type ReportingController_financeReceivablesResponse = { asOf: string; branchId: string | null; currencyCode: string; enrollmentCount: number; outstandingEnrollmentCount: number; totals: { debits: string; allocated: string; outstanding: string; }; };

export type ReportingController_createFinanceReceivablesExportResponse = { id: string; reportType: string; status: string; version: number; expiresAt: string; };

export type ReportingController_listExportsResponse = { items: Array<ResponseType12.ExportResult & { parameters: unknown; fileAssetId: string | null; errorMessage: string | null; createdAt: string; startedAt: string | null; completedAt: string | null; }>; nextCursor: string | null; };

export type ReportingController_downloadExportResponse = { url: string; expiresAt: string; };

export type DashboardController_overviewResponse = { generatedAt: string; timezone: string; range: { from: string; toExclusive: string; fromMonth: string; toMonth: string; timeZone: "Africa/Cairo"; }; selectedBranchId: string | null; branches: Array<{ id: string; name: string; code: string; }>; kpis: { activeStudents: number; netCollectionsThisMonth: string; netCollectionsInPeriod: string; outstandingBalance: string; attendanceRate: string | null; activeCohorts: number; currencyCode: string; }; trends: { enrollments: Array<ResponseType11.TrendPoint>; collections: Array<ResponseType11.TrendPoint>; attendanceHealth: { healthy: number; nearThreshold: number; belowMinimum: number; noData: number; }; }; financeHealth: { overdueBalance: string; overdueEnrollmentCount: number; dueNext30Days: string; aging: { current: string; days1To30: string; days31To60: string; days61To90: string; days91Plus: string; }; }; salesPipeline: ResponseType10.DashboardSalesPipeline; attention: { total: number; bySeverity: Record<string, number>; items: Array<ResponseType9.AttentionItem>; }; todaySessions: Array<{ id: string; startsAt: string | null; endsAt: string | null; program: { name: string; } | null; cohort: { code: string; name: string | null; } | null; trainer: { name: string | null; } | null; room: { name: string; } | null; deliveryMode: string; status: string; attendanceWindowState: string; attendance: { expected: number; checkedIn: number; }; }>; approvals: Array<ResponseType8.ApprovalItem>; recentActivity: Array<{ id: string; actionCode: string; entityType: string; entityId: string | null; actor: { name: string | null; } | null; createdAt: string; }>; academyHealth: { openImportIssues: number; failedOperations: number; pendingCertificateUploads: number; pendingApprovals: number; }; };

export type WorkspaceOverviewController_overviewResponse = { student?: ResponseType19.StudentOverview; staff?: ResponseType18.StaffOverview; role: "OPERATIONS" | "ACADEMIC" | "RECEPTION" | "ACCOUNTS" | "ATTENDANCE" | "TRAINER" | "STUDENT" | "OTP_OPERATOR"; generatedAt: string; timezone: "Africa/Cairo"; metrics: Array<{ key: ResponseType19.WorkspaceMetricKey; value: number; }>; queue: { kind: "UPCOMING" | "TODAY" | "PAYMENTS"; total: number; items: Array<{ id: string; title: string | null; subtitle: string | null; at: string; status: string; amount: string | null; }>; } | null; channel: { state: "DISABLED" | "STARTING" | "QR_REQUIRED" | "CONNECTED" | "DISCONNECTED" | "FAULTED" | "STALE"; enabled: boolean; otpAvailable: boolean; needsQr: boolean; phoneMasked: string | null; lastConnectedAt: string | null; lastHeartbeatAt: string | null; } | null; };

export type SearchController_listResponse = { query: null; items: Array<ResponseType16.SearchResult>; recent: Array<ResponseType16.SearchResult>; } | { query: string; items: Array<ResponseType16.SearchResult>; recent: Array<ResponseType16.SearchResult>; };

export type NotificationsController_listResponse = { unreadCount: number; items: Array<{ readAt: string | null; createdAt: string; id: string; type: string; subjectType: string | null; subjectId: string | null; payload: unknown; }>; nextCursor: string | null; };

export type RealtimeTicketController_issueResponse = { ticket: string; expiresAt: string; };

export type OtpChannelController_readResponse = ResponseType7.OtpChannelStatusDto;

export type OtpChannelController_pairingCodeResponse = ResponseType7.OtpChannelPairingCodeDto;

export type OtpChannelController_connectResponse = { id: string | null; provider: "BAILEYS"; enabled: boolean; state: "DISABLED" | "STARTING" | "QR_REQUIRED" | "CONNECTED" | "DISCONNECTED" | "FAULTED" | "STALE"; otpAvailable: boolean; needsQr: boolean; phoneMasked: string | null; lastErrorCode: string | null; lastConnectedAt: string | null; lastDisconnectedAt: string | null; lastHeartbeatAt: string | null; qrExpiresAt: string | null; version: number; };

export type OtpChannelController_disableResponse = { id: string | null; provider: "BAILEYS"; enabled: boolean; state: "DISABLED" | "STARTING" | "QR_REQUIRED" | "CONNECTED" | "DISCONNECTED" | "FAULTED" | "STALE"; otpAvailable: boolean; needsQr: boolean; phoneMasked: string | null; lastErrorCode: string | null; lastConnectedAt: string | null; lastDisconnectedAt: string | null; lastHeartbeatAt: string | null; qrExpiresAt: string | null; version: number; };

export type OtpChannelController_resetResponse = { id: string | null; provider: "BAILEYS"; enabled: boolean; state: "DISABLED" | "STARTING" | "QR_REQUIRED" | "CONNECTED" | "DISCONNECTED" | "FAULTED" | "STALE"; otpAvailable: boolean; needsQr: boolean; phoneMasked: string | null; lastErrorCode: string | null; lastConnectedAt: string | null; lastDisconnectedAt: string | null; lastHeartbeatAt: string | null; qrExpiresAt: string | null; version: number; };
