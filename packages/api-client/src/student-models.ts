export type Installment = {
  id: string;
  ordinal: number;
  dueDate: string;
  originalAmount: string;
  allocatedAmount: string;
  outstandingAmount: string;
  currency: string;
  state: 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'DUE' | 'UPCOMING';
  payable: boolean;
};

export type InstallmentsPage = {
  items: Installment[];
  nextCursor: string | null;
};

export type CertificateEligibility = {
  attendanceRatio: string | null;
  minimumRatio: string;
  academicEligibility: 'ELIGIBLE' | 'INELIGIBLE';
  financialHold: boolean;
  outstanding: string;
  completionSatisfied: boolean;
  overallEligibility: boolean;
  ruleId: string;
};

export type CertificateDownloadResult = {
  url: string;
  expiresAt: string;
};
