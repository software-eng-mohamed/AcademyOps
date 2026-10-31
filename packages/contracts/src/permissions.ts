// Scopes: O = Organization, B = Branch, A = Assigned, S = Self
export const accessScopes = ['O', 'B', 'A', 'S'] as const;
export type AccessScope = (typeof accessScopes)[number];

export const permissions = [
  'students.read_basic',
  'students.read_contact',
  'students.create',
  'students.update',
  'students.update_sensitive',
  'students.merge',
  'students.registration.manage',
  'me.profile.update',
  'leads.read',
  'leads.create',
  'leads.update',
  'leads.claim',
  'leads.assign',
  'leads.convert',
  'business_accounts.read',
  'business_accounts.manage',
  'academic.catalog.read',
  'academic.programs.manage',
  'academic.cohorts.manage',
  'academic.sessions.manage',
  'enrollments.read',
  'enrollments.create',
  'enrollments.submit',
  'enrollments.activate',
  'enrollments.transfer',
  'enrollments.postpone',
  'enrollments.resume',
  'enrollments.complete',
  'enrollments.retake',
  'enrollments.cancel.request',
  'enrollments.cancel.approve',
  'pricing.read',
  'pricing.propose',
  'finance.balance.read',
  'discounts.approve_tier1',
  'discounts.approve_tier2',
  'payments.read',
  'payments.record',
  'payments.checkout',
  'payments.verify',
  'payments.reverse.request',
  'payments.reverse.approve',
  'invoices.read',
  'invoices.issue',
  'receipts.read',
  'receipts.issue',
  'refunds.request',
  'refunds.approve',
  'attendance.read',
  'attendance.check_in_self',
  'attendance.qr.open',
  'attendance.record_manual',
  'attendance.correct',
  'attendance.correct_after_lock',
  'certificates.read',
  'certificates.issue',
  'certificates.upload',
  'certificates.collect',
  'certificates.revoke',
  'certificate_rules.manage',
  'finance.reports.read',
  'finance.reports.export',
  'reports.operations.read',
  'users.manage',
  'roles.manage',
  'branches.manage',
  'audit.read',
  'exports.sensitive',
  'imports.preview',
  'imports.execute',
  'imports.finalize',
  'legacy_archive.read',
  'messaging.otp.read',
  'messaging.otp.manage',
] as const;

export type PermissionCode = (typeof permissions)[number];

export const OWNER_ONLY_PERMISSIONS = [
  'payments.reverse.request',
  'payments.reverse.approve',
  'refunds.request',
  'refunds.approve',
  'payments.verify',
] as const;

export type OwnerOnlyPermission = (typeof OWNER_ONLY_PERMISSIONS)[number];

export const REGISTRATION_OWNER_ONLY_PERMISSIONS = ['students.registration.manage'] as const;

export type RegistrationOwnerOnlyPermission = (typeof REGISTRATION_OWNER_ONLY_PERMISSIONS)[number];

export type AccessContext = {
  organizationId: string;
  actorUserId: string;
  grants: ReadonlyMap<PermissionCode, ReadonlySet<AccessScope>>;
  branchIds: ReadonlySet<string>;
  assignedResourceIds: ReadonlySet<string>;
  studentPersonId?: string;
  mfaVerifiedAt?: string;
  hasMfaConfigured?: boolean;
};

export const requiresStepUpMfa = new Set<PermissionCode>([
  'branches.manage',
  'users.manage',
  'roles.manage',
  'discounts.approve_tier2',
  'payments.reverse.request',
  'payments.reverse.approve',
  'refunds.request',
  'refunds.approve',
  'payments.verify',
  'certificates.issue',
  'certificates.upload',
  'certificates.revoke',
  'certificate_rules.manage',
  'imports.execute',
  'imports.finalize',
  'exports.sensitive',
  'students.registration.manage',
  'messaging.otp.manage',
  'students.merge',
  'receipts.issue',
]);

// Step-up MFA verification remains valid for 10 minutes
export function hasFreshStepUp(context: AccessContext, now = new Date()): boolean {
  if (!context.mfaVerifiedAt) return false;
  const verifiedAt = new Date(context.mfaVerifiedAt).getTime();
  return Number.isFinite(verifiedAt) && now.getTime() - verifiedAt <= 10 * 60 * 1000;
}
