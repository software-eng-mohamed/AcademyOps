import { buildQuery, type RequestOptions } from './base.js';
import type {
  BusinessAccount,
  BusinessAccountContactInput,
  BusinessAccountDetail,
  BusinessAccountsPage,
  BusinessContactCandidate,
  CreateBusinessAccountInput,
  CreateLeadStageInput,
  Lead,
  LeadAssignee,
  LeadConversionInput,
  LeadConversionResult,
  LeadStage,
  LeadState,
  LeadsPage,
  UpdateBusinessAccountInput,
  UpdateLeadStageInput,
} from './crm-models.js';
import {
  validateBusinessAccount,
  validateBusinessAccountsPage,
  validateLead,
  validateLeadStages,
  validateLeadsPage,
} from './crm-validators.js';
import type {
  CreatePaymentInput,
  EligibleInvoiceEntriesPage,
  InstallmentScheduleResult,
  Invoice,
  InvoicesPage,
  Payment,
  PaymentMethod,
  PaymentMethodMix,
  PaymentMutationResult,
  PaymentsPage,
  PaymobCheckoutResult,
  PaymobCheckoutStatus,
  PricingAgreement,
  PricingAgreementDetail,
  PricingAgreementLineInput,
  PricingAgreementsPage,
  Receipt,
  ReceiptsPage,
} from './finance-models.js';
import {
  validateInvoicesPage,
  validatePaymentMethodMix,
  validatePaymentMethods,
  validatePaymentMutationResult,
  validatePaymentsPage,
  validatePaymobCheckoutResult,
  validatePaymobCheckoutStatus,
  validatePricingAgreementsPage,
  validateReceiptsPage,
} from './finance-validators.js';
import type * as M from './models.js';
import { PlgPasswordResetClient } from './password-reset-client.js';
import {
  validateAcademicCalendar,
  validateAttendanceSummary,
  validateFinanceAging,
  validateFinanceReceivables,
  validateFinanceSummary,
  validateStudentCertificatesPage,
  validateStudentEnrollment,
  validateStudentEnrollmentsPage,
} from './validators.js';
export class PlgBaseClient extends PlgPasswordResetClient {
  me(options?: RequestOptions): Promise<M.CurrentUser | null> {
    return this.request<M.CurrentUser>('GET', '/auth/me', undefined, true, options);
  }
  login(input: {
    identifier: string;
    password: string;
    rememberMe?: boolean;
    totpCode?: string;
    recoveryCode?: string;
  }): Promise<{
    expiresAt: string;
    mfaSetupRequired: boolean;
    passwordChangeRequired: boolean;
  }> {
    return this.request('POST', '/auth/login', {
      organizationCode: 'ACADEMYOPS',
      identifierType: 'EMAIL',
      ...input,
    });
  }
  requestPhoneOtp(input: M.RequestPhoneOtpInput): Promise<M.RequestPhoneOtpResponse> {
    return this.request('POST', '/auth/phone-otp/request', input);
  }
  verifyPhoneOtp(input: M.VerifyPhoneOtpInput): Promise<M.VerifyPhoneOtpResponse> {
    return this.request('POST', '/auth/phone-otp/verify', input);
  }
  logout(): Promise<void> {
    return this.request('POST', '/auth/logout');
  }
  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return this.request('POST', '/auth/password/change', { currentPassword, newPassword });
  }
  beginTotpEnrollment(label = 'AcademyOps') {
    return this.request<{
      factorId: string;
      secret: string;
      otpauthUri: string;
    }>('POST', '/auth/mfa/totp/enroll', { label });
  }
  verifyTotpEnrollment(factorId: string, code: string) {
    return this.request<{
      recoveryCodes: string[];
    }>('POST', `/auth/mfa/totp/${encodeURIComponent(factorId)}/verify`, { code });
  }
  dashboard(
    input?: string | M.DashboardPeriodQuery,
    options?: RequestOptions,
  ): Promise<M.DashboardOverview> {
    const query = typeof input === 'string' ? { branchId: input } : (input ?? {});
    return this.request(
      'GET',
      `/dashboard/overview${buildQuery(query)}`,
      undefined,
      undefined,
      options,
    );
  }
  search(q?: string, types?: M.SearchEntityType[], limit = 20, options?: RequestOptions) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (q) params.set('q', q);
    if (types?.length) params.set('types', types.join(','));
    return this.request<{
      query: string | null;
      items: M.SearchResult[];
      recent: M.SearchResult[];
    }>('GET', `/search?${params.toString()}`, undefined, undefined, options);
  }
  recordRecent(entityType: M.SearchEntityType, entityId: string): Promise<void> {
    return this.request('POST', '/search/recent', { entityType, entityId });
  }
  notifications(cursor?: string, options?: RequestOptions): Promise<M.NotificationList> {
    return this.request(
      'GET',
      `/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      undefined,
      undefined,
      options,
    );
  }
  markNotificationRead(id: string): Promise<void> {
    return this.request('POST', `/notifications/${id}/read`);
  }
  markAllNotificationsRead(): Promise<void> {
    return this.request('POST', '/notifications/read-all');
  }
  updateLocale(locale: 'ar' | 'en', version: number): Promise<M.CurrentUser> {
    return this.request(
      'PATCH',
      '/auth/me/preferences',
      { preferredLocale: locale },
      { 'If-Match': String(version) },
    );
  }
  completeOnboarding(version: number): Promise<M.CurrentUser> {
    return this.request('POST', '/auth/me/onboarding/complete', undefined, {
      'If-Match': String(version),
    });
  }
  stepUp(code: string): Promise<void> {
    return this.request('POST', '/auth/mfa/step-up', { code });
  }
  regenerateRecoveryCodes(): Promise<{
    recoveryCodes: string[];
  }> {
    return this.request('POST', '/auth/mfa/recovery-codes/regenerate');
  }
  createLead(input: {
    branchId: string;
    newPerson: {
      name?: string;
      phone?: string;
      email?: string;
      confirmDistinctFromPersonIds?: string[];
    };
    source?: string;
    nextActionAt?: string;
  }) {
    return this.request<{
      id: string;
      state: string;
      version: number;
    }>('POST', '/leads', input);
  }
  async listLeads(
    query: {
      branchId?: string;
      assignedUserId?: string;
      stageId?: string;
      state?: LeadState;
      search?: string;
      cursor?: string;
      limit?: number;
    } = {},
    options?: RequestOptions,
  ): Promise<LeadsPage> {
    return validateLeadsPage(
      await this.request('GET', `/leads${buildQuery(query)}`, undefined, undefined, options),
    );
  }
  async getLead(id: string, options?: RequestOptions): Promise<Lead> {
    return validateLead(
      await this.request('GET', `/leads/${encodeURIComponent(id)}`, undefined, undefined, options),
    );
  }
  updateLead(
    id: string,
    input: {
      stageId?: string;
      source?: string;
      nextActionAt?: string;
    },
    version: number,
  ): Promise<Lead> {
    return this.request('PATCH', `/leads/${encodeURIComponent(id)}`, input, {
      'If-Match': String(version),
    });
  }
  claimLead(id: string, version: number): Promise<Lead> {
    return this.request('POST', `/leads/${encodeURIComponent(id)}/claim`, undefined, {
      'If-Match': String(version),
    });
  }
  listLeadAssignees(branchId: string, search?: string, options?: RequestOptions) {
    return this.request<{
      items: LeadAssignee[];
    }>(
      'GET',
      `/leads/assignees${buildQuery({ branchId, search, limit: 30 })}`,
      undefined,
      undefined,
      options,
    );
  }
  assignLead(id: string, userId: string, version: number): Promise<Lead> {
    return this.request(
      'POST',
      `/leads/${encodeURIComponent(id)}/assign`,
      { userId },
      {
        'If-Match': String(version),
      },
    );
  }
  addLeadActivity(
    id: string,
    input: {
      type: 'CALL' | 'EMAIL' | 'WHATSAPP' | 'MEETING' | 'NOTE';
      occurredAt?: string;
      data?: Record<string, unknown>;
    },
  ) {
    return this.request('POST', `/leads/${encodeURIComponent(id)}/activities`, input);
  }
  transitionLead(
    id: string,
    command: 'open' | 'qualify' | 'lose' | 'disqualify' | 'reopen',
    version: number,
    reason?: string,
  ): Promise<{
    id: string;
    state: LeadState;
    version: number;
  }> {
    return this.request(
      'POST',
      `/leads/${encodeURIComponent(id)}/${command}`,
      ['lose', 'disqualify', 'reopen'].includes(command) ? { reason } : undefined,
      { 'If-Match': String(version) },
    );
  }
  winLead(
    id: string,
    input: LeadConversionInput,
    version: number,
    idempotencyKey: string,
  ): Promise<LeadConversionResult> {
    return this.request('POST', `/leads/${encodeURIComponent(id)}/win`, input, {
      'If-Match': String(version),
      'Idempotency-Key': idempotencyKey,
    });
  }
  async listLeadStages(options?: RequestOptions, includeInactive = false): Promise<LeadStage[]> {
    return validateLeadStages(
      await this.request(
        'GET',
        `/lead-stages${buildQuery({ includeInactive: includeInactive || undefined })}`,
        undefined,
        undefined,
        options,
      ),
    );
  }
  createLeadStage(input: CreateLeadStageInput): Promise<LeadStage> {
    return this.request('POST', '/lead-stages', input);
  }
  updateLeadStage(id: string, input: UpdateLeadStageInput, version: number): Promise<LeadStage> {
    return this.request('PATCH', `/lead-stages/${encodeURIComponent(id)}`, input, {
      'If-Match': String(version),
    });
  }
  async listBusinessAccounts(
    query: {
      search?: string;
      branchId?: string;
      status?: 'ACTIVE' | 'ARCHIVED';
      cursor?: string;
      limit?: number;
    } = {},
    options?: RequestOptions,
  ): Promise<BusinessAccountsPage> {
    return validateBusinessAccountsPage(
      await this.request(
        'GET',
        `/business-accounts${buildQuery(query)}`,
        undefined,
        undefined,
        options,
      ),
    );
  }
  async getBusinessAccount(id: string, options?: RequestOptions): Promise<BusinessAccountDetail> {
    return validateBusinessAccount(
      await this.request(
        'GET',
        `/business-accounts/${encodeURIComponent(id)}`,
        undefined,
        undefined,
        options,
      ),
    );
  }
  createBusinessAccount(input: CreateBusinessAccountInput): Promise<BusinessAccount> {
    return this.request('POST', '/business-accounts', input);
  }
  updateBusinessAccount(
    id: string,
    input: UpdateBusinessAccountInput,
    version: number,
  ): Promise<BusinessAccount> {
    return this.request('PATCH', `/business-accounts/${encodeURIComponent(id)}`, input, {
      'If-Match': String(version),
    });
  }
  listBusinessContactCandidates(branchId: string, search: string, options?: RequestOptions) {
    return this.request<{
      items: BusinessContactCandidate[];
    }>(
      'GET',
      `/business-accounts/contact-candidates${buildQuery({ branchId, search, limit: 20 })}`,
      undefined,
      undefined,
      options,
    );
  }
  replaceBusinessAccountContacts(
    id: string,
    contacts: BusinessAccountContactInput[],
    version: number,
  ): Promise<{
    id: string;
    version: number;
    contacts: BusinessAccountContactInput[];
  }> {
    return this.request(
      'PUT',
      `/business-accounts/${encodeURIComponent(id)}/contacts`,
      { contacts },
      {
        'If-Match': String(version),
      },
    );
  }
  registerStudent(input: M.RegisterStudentInput): Promise<M.RegistrationResponse> {
    return this.request('POST', '/student-registrations', input);
  }
  listStudentRegistrations(query: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<M.StudentRegistrationsPage> {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    return this.request('GET', `/student-registrations?${params.toString()}`);
  }
  getStudentRegistration(id: string): Promise<M.StudentRegistrationDetail> {
    return this.request('GET', `/student-registrations/${encodeURIComponent(id)}`);
  }
  approveStudentRegistration(
    id: string,
    version: number,
    input: M.ApproveStudentRegistrationInput,
  ): Promise<M.StudentRegistrationDetail> {
    return this.request('POST', `/student-registrations/${encodeURIComponent(id)}/approve`, input, {
      'If-Match': String(version),
    });
  }
  rejectStudentRegistration(
    id: string,
    version: number,
    reason: string,
  ): Promise<M.StudentRegistrationDetail> {
    return this.request(
      'POST',
      `/student-registrations/${encodeURIComponent(id)}/reject`,
      { reason },
      { 'If-Match': String(version) },
    );
  }
  async financeReceivables(
    branchId?: string,
    asOf?: string,
    options?: RequestOptions,
  ): Promise<M.FinanceReceivablesReport> {
    return validateFinanceReceivables(
      await this.request(
        'GET',
        `/reports/finance/receivables${buildQuery({ branchId, asOf })}`,
        undefined,
        undefined,
        options,
      ),
    );
  }
  createFinanceReceivablesExport(
    branchId: string | undefined,
    asOf: string | undefined,
    idempotencyKey: string,
  ): Promise<M.ReportExport> {
    return this.request(
      'POST',
      `/reports/finance/receivables/exports${buildQuery({ branchId, asOf })}`,
      undefined,
      { 'Idempotency-Key': idempotencyKey },
    );
  }
  listReportExports(
    cursor?: string,
    limit = 25,
    options?: RequestOptions,
  ): Promise<M.ReportExportsPage> {
    return this.request(
      'GET',
      `/reports/exports${buildQuery({ cursor, limit })}`,
      undefined,
      undefined,
      options,
    );
  }
  downloadReportExport(id: string): Promise<M.DownloadUrl> {
    return this.request('GET', `/reports/exports/${encodeURIComponent(id)}/download`);
  }
  async financeAging(
    branchId?: string,
    asOf?: string,
    options?: RequestOptions,
  ): Promise<M.FinanceAgingReport> {
    return validateFinanceAging(
      await this.request(
        'GET',
        `/finance/reports/aging${buildQuery({ branchId, asOf })}`,
        undefined,
        undefined,
        options,
      ),
    );
  }
  async calendar(
    query: M.AcademicCalendarQuery,
    options?: RequestOptions,
  ): Promise<M.AcademicCalendarResult> {
    const { from, to, branchId, cohortId, roomId, trainerId } = query;
    return validateAcademicCalendar(
      await this.request(
        'GET',
        `/calendar${buildQuery({ from, to, branchId, cohortId, roomId, trainerId })}`,
        undefined,
        undefined,
        options,
      ),
    );
  }
  async listEnrollments(
    query?: {
      studentPersonId?: string;
      branchId?: string;
      programVersionId?: string;
      state?: string;
      cohortId?: string;
      limit?: number;
      cursor?: string;
    },
    options?: RequestOptions,
  ): Promise<M.StudentEnrollmentsPage> {
    return validateStudentEnrollmentsPage(
      await this.request(
        'GET',
        `/enrollments${buildQuery(query ?? {})}`,
        undefined,
        undefined,
        options,
      ),
    );
  }
  async getEnrollment(id: string): Promise<M.StudentEnrollment> {
    return validateStudentEnrollment(
      await this.request('GET', `/enrollments/${encodeURIComponent(id)}`),
    );
  }
  async getAttendanceSummary(
    enrollmentId: string,
    options?: RequestOptions,
  ): Promise<M.EnrollmentAttendanceSummary> {
    return validateAttendanceSummary(
      await this.request(
        'GET',
        `/enrollments/${encodeURIComponent(enrollmentId)}/attendance-summary`,
        undefined,
        undefined,
        options,
      ),
    );
  }
  async getFinanceSummary(
    enrollmentId: string,
    options?: RequestOptions,
  ): Promise<M.EnrollmentFinanceSummary> {
    return validateFinanceSummary(
      await this.request(
        'GET',
        `/enrollments/${encodeURIComponent(enrollmentId)}/finance-summary`,
        undefined,
        undefined,
        options,
      ),
    );
  }
  async listCertificates(
    query?: {
      enrollmentId?: string;
      validityStatus?: string;
      limit?: number;
      cursor?: string;
    },
    options?: RequestOptions,
  ): Promise<M.StudentCertificatesPage> {
    return validateStudentCertificatesPage(
      await this.request(
        'GET',
        `/certificates${buildQuery(query ?? {})}`,
        undefined,
        undefined,
        options,
      ),
    );
  }
  getCertificate(id: string, options?: RequestOptions): Promise<M.CertificateDetail> {
    return this.request(
      'GET',
      `/certificates/${encodeURIComponent(id)}`,
      undefined,
      undefined,
      options,
    );
  }
  evaluateCertificate(enrollmentId: string): Promise<{
    enrollmentId: string;
    attendanceRatio: string | null;
    minimumRatio: string;
    academicResult: 'ELIGIBLE' | 'INELIGIBLE';
    financialHold: boolean;
    outstanding: string;
    completionSatisfied: boolean;
  }> {
    return this.request('POST', '/certificates/evaluate', { enrollmentId });
  }
  issueCertificate(
    enrollmentId: string,
    idempotencyKey: string,
  ): Promise<{
    id: string;
    serial: string;
    validityStatus: string;
    pdfStatus: string;
    version: number;
  }> {
    return this.request(
      'POST',
      '/certificates/issue',
      { enrollmentId },
      {
        'Idempotency-Key': idempotencyKey,
      },
    );
  }
  reissueCertificate(
    id: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<{
    id: string;
    serial: string;
    validityStatus: string;
    pdfStatus: string;
    version: number;
  }> {
    return this.request(
      'POST',
      `/certificates/${encodeURIComponent(id)}/reissue`,
      { reason },
      { 'Idempotency-Key': idempotencyKey },
    );
  }
  uploadCertificateFile(
    id: string,
    file: File,
    version: number,
    idempotencyKey: string,
  ): Promise<{
    id: string;
    pdfStatus: 'AVAILABLE';
    version: number;
    sha256: string;
  }> {
    const body = new FormData();
    body.append('file', file);
    return this.request('POST', `/certificates/${encodeURIComponent(id)}/file`, body, {
      'Idempotency-Key': idempotencyKey,
      'If-Match': String(version),
    });
  }
  listCertificateRules(
    query: {
      programVersionId?: string;
      cohortId?: string;
      activeAt?: string;
    } = {},
    options?: RequestOptions,
  ): Promise<{
    items: M.CertificateRule[];
  }> {
    return this.request(
      'GET',
      `/certificate-rules${buildQuery(query)}`,
      undefined,
      undefined,
      options,
    );
  }
  createCertificateRule(
    input: {
      programVersionId: string;
      cohortId?: string;
      minimumRatio: number;
      effectiveFrom: string;
      effectiveTo?: string;
    },
    idempotencyKey: string,
  ): Promise<{
    id: string;
    version: number;
    minimumRatio: string;
    effectiveFrom: string;
    effectiveTo: string | null;
  }> {
    return this.request('POST', '/certificate-rules', input, {
      'Idempotency-Key': idempotencyKey,
    });
  }
  updateCertificateFulfillment(
    id: string,
    command: 'print' | 'ready' | 'collect',
    version: number,
    idempotencyKey: string,
  ): Promise<{
    id: string;
    fulfillmentStatus: string;
    version: number;
  }> {
    return this.request('POST', `/certificates/${encodeURIComponent(id)}/${command}`, undefined, {
      'Idempotency-Key': idempotencyKey,
      'If-Match': String(version),
    });
  }
  revokeCertificate(
    id: string,
    reason: string,
    version: number,
    idempotencyKey: string,
  ): Promise<{
    id: string;
    validityStatus: string;
    version: number;
  }> {
    return this.request(
      'POST',
      `/certificates/${encodeURIComponent(id)}/revoke`,
      { reason },
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
    );
  }
  async paymentMethods(): Promise<PaymentMethod[]> {
    return validatePaymentMethods(await this.request('GET', '/payment-methods'));
  }
  async listPayments(
    query: {
      billingAccountId?: string;
      enrollmentId?: string;
      branchId?: string;
      fromMonth?: string;
      toMonth?: string;
      status?: string;
      cursor?: string;
      limit?: number;
    },
    options?: RequestOptions,
  ): Promise<PaymentsPage> {
    return validatePaymentsPage(
      await this.request('GET', `/payments${buildQuery(query)}`, undefined, undefined, options),
    );
  }
  async paymentMethodMix(
    input?: string | M.DashboardPeriodQuery,
    options?: RequestOptions,
  ): Promise<PaymentMethodMix> {
    const query = typeof input === 'string' ? { branchId: input } : (input ?? {});
    return validatePaymentMethodMix(
      await this.request(
        'GET',
        `/payments/method-mix${buildQuery(query)}`,
        undefined,
        undefined,
        options,
      ),
    );
  }
  getPayment(id: string, options?: RequestOptions): Promise<Payment> {
    return this.request(
      'GET',
      `/payments/${encodeURIComponent(id)}`,
      undefined,
      undefined,
      options,
    );
  }
  requestPaymentReversal(
    paymentId: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<{
    id: string;
    paymentId: string;
    status: string;
  }> {
    return this.request(
      'POST',
      `/payments/${encodeURIComponent(paymentId)}/reversal-requests`,
      { reason },
      { 'Idempotency-Key': idempotencyKey },
    );
  }
  requestPaymentRefund(
    paymentId: string,
    amount: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<{
    id: string;
    paymentId: string;
    status: string;
    amount: string;
  }> {
    return this.request(
      'POST',
      `/payments/${encodeURIComponent(paymentId)}/refund-requests`,
      { amount, reason },
      { 'Idempotency-Key': idempotencyKey },
    );
  }
  async listInvoices(
    query: {
      billingAccountId?: string;
      status?: string;
      cursor?: string;
      limit?: number;
    },
    options?: RequestOptions,
  ): Promise<InvoicesPage> {
    return validateInvoicesPage(
      await this.request('GET', `/invoices${buildQuery(query)}`, undefined, undefined, options),
    );
  }
  getInvoice(id: string, options?: RequestOptions): Promise<Invoice> {
    return this.request(
      'GET',
      `/invoices/${encodeURIComponent(id)}`,
      undefined,
      undefined,
      options,
    );
  }
  listEligibleInvoiceEntries(
    query: {
      billingAccountId: string;
      enrollmentId?: string;
      cursor?: string;
      limit?: number;
    },
    options?: RequestOptions,
  ): Promise<EligibleInvoiceEntriesPage> {
    return this.request(
      'GET',
      `/invoices/eligible-ledger-entries${buildQuery(query)}`,
      undefined,
      undefined,
      options,
    );
  }
  createInvoice(
    input: {
      billingAccountId: string;
      lines: Array<{
        ledgerEntryId: string;
        descriptionAr: string;
        descriptionEn: string;
        quantity: string;
        unitAmount: string;
        taxAmount?: string;
      }>;
    },
    idempotencyKey: string,
  ): Promise<{
    id: string;
    status: string;
    version: number;
  }> {
    return this.request('POST', '/invoices', input, { 'idempotency-key': idempotencyKey });
  }
  issueInvoice(id: string, version: number, idempotencyKey: string) {
    return this.request<{
      id: string;
      status: string;
      serialNumber: string | null;
      version: number;
    }>('POST', `/invoices/${encodeURIComponent(id)}/issue`, undefined, {
      'If-Match': String(version),
      'idempotency-key': idempotencyKey,
    });
  }
  cancelInvoice(id: string, reason: string, version: number, idempotencyKey: string) {
    return this.request<{
      id: string;
      status: string;
      serialNumber: string | null;
      version: number;
    }>(
      'POST',
      `/invoices/${encodeURIComponent(id)}/cancel`,
      { reason },
      { 'If-Match': String(version), 'idempotency-key': idempotencyKey },
    );
  }
  voidInvoice(id: string, reason: string, version: number, idempotencyKey: string) {
    return this.request<{
      id: string;
      status: string;
      serialNumber: string | null;
      version: number;
    }>(
      'POST',
      `/invoices/${encodeURIComponent(id)}/void`,
      { reason },
      { 'If-Match': String(version), 'idempotency-key': idempotencyKey },
    );
  }
  createInvoiceCreditNote(id: string, amount: string, reason: string, idempotencyKey: string) {
    return this.request<{
      id: string;
      serialNumber: string;
      amount: string;
    }>(
      'POST',
      `/invoices/${encodeURIComponent(id)}/credit-notes`,
      { amount, reason },
      { 'idempotency-key': idempotencyKey },
    );
  }
  async listReceipts(
    query: {
      billingAccountId?: string;
      cursor?: string;
      limit?: number;
    },
    options?: RequestOptions,
  ): Promise<ReceiptsPage> {
    return validateReceiptsPage(
      await this.request('GET', `/receipts${buildQuery(query)}`, undefined, undefined, options),
    );
  }
  getReceipt(id: string, options?: RequestOptions): Promise<Receipt> {
    return this.request(
      'GET',
      `/receipts/${encodeURIComponent(id)}`,
      undefined,
      undefined,
      options,
    );
  }
  issueReceipt(paymentId: string, idempotencyKey: string): Promise<Receipt> {
    return this.request('POST', `/payments/${encodeURIComponent(paymentId)}/receipt`, undefined, {
      'idempotency-key': idempotencyKey,
    });
  }
  async listPricingAgreements(
    query: {
      enrollmentId?: string;
      status?: string;
      cursor?: string;
      limit?: number;
    },
    options?: RequestOptions,
  ): Promise<PricingAgreementsPage> {
    return validatePricingAgreementsPage(
      await this.request(
        'GET',
        `/pricing-agreements${buildQuery(query)}`,
        undefined,
        undefined,
        options,
      ),
    );
  }
  getPricingAgreement(id: string, options?: RequestOptions): Promise<PricingAgreementDetail> {
    return this.request(
      'GET',
      `/pricing-agreements/${encodeURIComponent(id)}`,
      undefined,
      undefined,
      options,
    );
  }
  createPricingAgreement(
    input: {
      enrollmentId: string;
      lines: PricingAgreementLineInput[];
      discountAmount?: string;
    },
    idempotencyKey: string,
  ): Promise<PricingAgreement> {
    return this.request('POST', '/pricing-agreements', input, {
      'Idempotency-Key': idempotencyKey,
    });
  }
  updatePricingAgreement(
    id: string,
    input: {
      lines: PricingAgreementLineInput[];
      discountAmount?: string;
    },
    version: number,
    idempotencyKey: string,
  ): Promise<PricingAgreement> {
    return this.request('PUT', `/pricing-agreements/${encodeURIComponent(id)}`, input, {
      'If-Match': String(version),
      'Idempotency-Key': idempotencyKey,
    });
  }
  submitPricingAgreement(
    id: string,
    version: number,
    idempotencyKey: string,
  ): Promise<PricingAgreement> {
    return this.request('POST', `/pricing-agreements/${encodeURIComponent(id)}/submit`, undefined, {
      'If-Match': String(version),
      'Idempotency-Key': idempotencyKey,
    });
  }
  createInstallmentSchedule(
    agreementId: string,
    installments: Array<{
      dueDate: string;
      amount: string;
    }>,
    idempotencyKey: string,
  ): Promise<InstallmentScheduleResult> {
    return this.request(
      'POST',
      `/pricing-agreements/${encodeURIComponent(agreementId)}/installment-schedules`,
      { installments },
      { 'Idempotency-Key': idempotencyKey },
    );
  }
  updateInstallmentSchedule(
    scheduleId: string,
    installments: Array<{
      dueDate: string;
      amount: string;
    }>,
    version: number,
    idempotencyKey: string,
  ): Promise<InstallmentScheduleResult> {
    return this.request(
      'PUT',
      `/installment-schedules/${encodeURIComponent(scheduleId)}`,
      { installments },
      {
        'If-Match': String(version),
        'Idempotency-Key': idempotencyKey,
      },
    );
  }
  approveInstallmentSchedule(
    scheduleId: string,
    version: number,
    idempotencyKey: string,
  ): Promise<InstallmentScheduleResult> {
    return this.request(
      'POST',
      `/installment-schedules/${encodeURIComponent(scheduleId)}/approve`,
      undefined,
      {
        'If-Match': String(version),
        'Idempotency-Key': idempotencyKey,
      },
    );
  }
  async createPayment(
    input: CreatePaymentInput,
    idempotencyKey: string,
  ): Promise<PaymentMutationResult> {
    return validatePaymentMutationResult(
      await this.request('POST', '/payments', input, {
        'idempotency-key': idempotencyKey,
      }),
    );
  }
  async createPaymobCheckout(
    installmentId: string,
    idempotencyKey: string,
  ): Promise<PaymobCheckoutResult> {
    return validatePaymobCheckoutResult(
      await this.request(
        'POST',
        `/installments/${encodeURIComponent(installmentId)}/paymob-checkout`,
        undefined,
        {
          'idempotency-key': idempotencyKey,
        },
      ),
    );
  }
  async getPaymobCheckoutStatus(attemptId: string): Promise<PaymobCheckoutStatus> {
    return validatePaymobCheckoutStatus(
      await this.request('GET', `/payment-gateway-attempts/${encodeURIComponent(attemptId)}`),
    );
  }
}
