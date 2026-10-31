import type { Locale } from '@/lib/locales';

export interface PermissionCategory {
  id: string;
  name: { en: string; ar: string };
  prefixes: string[];
}

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  { id: 'students', name: { en: 'Students', ar: 'الطلاب' }, prefixes: ['students.'] },
  {
    id: 'academic',
    name: { en: 'Academic & Cohorts', ar: 'المجموعات والدورات' },
    prefixes: ['academic.'],
  },
  {
    id: 'enrollments',
    name: { en: 'Enrollments', ar: 'التسجيلات والقيود' },
    prefixes: ['enrollments.'],
  },
  { id: 'attendance', name: { en: 'Attendance', ar: 'الحضور والغياب' }, prefixes: ['attendance.'] },
  {
    id: 'finance',
    name: { en: 'Finance & Payments', ar: 'المالية والمدفوعات' },
    prefixes: [
      'finance.',
      'payments.',
      'invoices.',
      'receipts.',
      'refunds.',
      'pricing.',
      'discounts.',
    ],
  },
  {
    id: 'certificates',
    name: { en: 'Certificates', ar: 'الشهادات' },
    prefixes: ['certificates.', 'certificate_rules.'],
  },
  {
    id: 'crm',
    name: { en: 'CRM & Leads', ar: 'العملاء والشركات' },
    prefixes: ['leads.', 'business_accounts.'],
  },
  {
    id: 'system',
    name: { en: 'System & Admin', ar: 'النظام والإدارة' },
    prefixes: [
      'users.',
      'roles.',
      'branches.',
      'audit.',
      'reports.',
      'exports.',
      'imports.',
      'legacy_archive.',
      'messaging.',
      'me.',
    ],
  },
];

export const PERMISSION_TITLES: Record<string, { en: string; ar: string }> = {
  'students.read_basic': { en: 'View student profiles', ar: 'عرض ملفات الطلاب الأساسية' },
  'students.read_contact': { en: 'View student contact details', ar: 'عرض بيانات التواصل للطلاب' },
  'students.create': { en: 'Add new student', ar: 'إضافة دارس جديد' },
  'students.update': { en: 'Edit student details', ar: 'تعديل بيانات الدارس' },
  'students.update_sensitive': {
    en: 'Edit sensitive student data',
    ar: 'تعديل البيانات الحساسة للدارس',
  },
  'students.merge': { en: 'Merge duplicate students', ar: 'دمج سجلات الطلاب المكررة' },
  'students.registration.manage': {
    en: 'Manage student registrations',
    ar: 'إدارة طلبات تسجيل الدارسين',
  },
  'academic.catalog.read': { en: 'View course catalog', ar: 'عرض دليل البرامج التدريبية' },
  'academic.programs.manage': { en: 'Manage training programs', ar: 'إدارة البرامج والمسارات' },
  'academic.cohorts.manage': {
    en: 'Manage cohorts & groups',
    ar: 'إدارة المجموعات والفرق التدريبية',
  },
  'academic.sessions.manage': {
    en: 'Manage session schedule',
    ar: 'إدارة جداول المحاضرات والجلسات',
  },
  'enrollments.read': { en: 'View student enrollments', ar: 'عرض قيود وتسكين الطلاب' },
  'enrollments.create': { en: 'Create new enrollment', ar: 'تسجيل وقيد دارس جديد' },
  'enrollments.submit': { en: 'Submit enrollment for review', ar: 'إرسال القيد للمراجعة' },
  'enrollments.activate': { en: 'Activate enrollment', ar: 'تفعيل القيد وبدء الدراسة' },
  'enrollments.transfer': { en: 'Transfer to another cohort', ar: 'نقل الدارس لمجموعة أخرى' },
  'enrollments.postpone': { en: 'Postpone enrollment', ar: 'تأجيل قيد الدارس' },
  'enrollments.resume': { en: 'Resume postponed enrollment', ar: 'استئناف القيد المؤجل' },
  'enrollments.complete': { en: 'Complete course requirements', ar: 'إتمام وإنهاء متطلبات الكورس' },
  'enrollments.retake': { en: 'Retake course or exam', ar: 'إعادة الدورة أو الاختبار' },
  'enrollments.cancel.request': { en: 'Request enrollment cancel', ar: 'طلب إلغاء القيد' },
  'enrollments.cancel.approve': { en: 'Approve enrollment cancel', ar: 'اعتماد إلغاء القيد' },
  'attendance.read': { en: 'View attendance records', ar: 'عرض كشوفات الحضور' },
  'attendance.check_in_self': { en: 'Self check-in for sessions', ar: 'تسجيل الحضور الذاتي' },
  'attendance.qr.open': { en: 'Open attendance QR scanner', ar: 'فتح رمز QR لمسح الحضور' },
  'attendance.record_manual': { en: 'Record manual attendance', ar: 'تسجيل الحضور يدويًا' },
  'attendance.correct': { en: 'Correct attendance status', ar: 'تصحيح حالة الحضور' },
  'attendance.correct_after_lock': {
    en: 'Correct locked attendance',
    ar: 'تعديل الحضور بعد الإغلاق',
  },
  'pricing.read': { en: 'View course pricing plans', ar: 'عرض خطط وقوائم الأسعار' },
  'pricing.propose': { en: 'Propose special pricing', ar: 'اقتراح خطة أسعار مخصصة' },
  'finance.balance.read': {
    en: 'View student financial balance',
    ar: 'عرض الأرصدة المالية والمديونيات',
  },
  'discounts.approve_tier1': { en: 'Approve Tier 1 discounts', ar: 'اعتماد خصومات المستوى الأول' },
  'discounts.approve_tier2': { en: 'Approve Tier 2 discounts', ar: 'اعتماد خصومات المستوى الثاني' },
  'payments.read': { en: 'View payment history', ar: 'عرض سجل الدفعات والمتحصلات' },
  'payments.record': { en: 'Record incoming payment', ar: 'تسجيل تحصيل أو دفعة جديدة' },
  'payments.checkout': { en: 'Process POS payment', ar: 'سداد إلكتروني ونقاط بيع' },
  'payments.verify': { en: 'Verify payment transactions', ar: 'التحقق من إيصالات التحويل' },
  'payments.reverse.request': { en: 'Request payment reversal', ar: 'طلب استرجاع دفعة مالية' },
  'payments.reverse.approve': {
    en: 'Approve payment reversal',
    ar: 'اعتماد استرجاع الدفعة المالية',
  },
  'invoices.read': { en: 'View financial invoices', ar: 'عرض الفواتير والمطالبات' },
  'invoices.issue': { en: 'Issue student invoice', ar: 'إصدار فاتورة رسمية' },
  'receipts.read': { en: 'View payment receipts', ar: 'عرض إيصالات السداد' },
  'receipts.issue': { en: 'Issue payment receipt', ar: 'إصدار سند أو إيصال قبض' },
  'refunds.request': { en: 'Request student refund', ar: 'طلب استرداد رسوم' },
  'refunds.approve': { en: 'Approve financial refund', ar: 'اعتماد صرف الاسترداد المالي' },
  'finance.reports.read': { en: 'View financial summaries', ar: 'عرض التقارير والتحليلات المالية' },
  'finance.reports.export': { en: 'Export financial reports', ar: 'تصدير التقارير المالية' },
  'certificates.read': { en: 'View issued certificates', ar: 'عرض الشهادات الصادرة' },
  'certificates.issue': { en: 'Issue graduation certificate', ar: 'إصدار شهادة تخرج' },
  'certificates.upload': { en: 'Upload certificate templates', ar: 'رفع ملفات ونماذج الشهادات' },
  'certificates.collect': { en: 'Handover certificate to student', ar: 'تسليم الشهادة للدارس' },
  'certificates.revoke': { en: 'Revoke certificate', ar: 'إلغاء أو سحب الشهادة' },
  'certificate_rules.manage': {
    en: 'Manage certificate criteria',
    ar: 'إدارة شروط ومعايير الشهادات',
  },
  'leads.read': { en: 'View prospective leads', ar: 'عرض سجلات العملاء المحتملين' },
  'leads.create': { en: 'Add new prospective lead', ar: 'إضافة عميل محتمل جديد' },
  'leads.update': { en: 'Update lead follow-up status', ar: 'تحديث بيانات ومتابعة العميل' },
  'leads.claim': { en: 'Claim lead for sales follow-up', ar: 'استلام العميل لمتابعة المبيعات' },
  'leads.assign': { en: 'Assign leads to sales staff', ar: 'توزيع العملاء على مسؤولي المبيعات' },
  'leads.convert': { en: 'Convert lead to enrolled student', ar: 'تحويل العميل لدارس مسجل' },
  'business_accounts.read': {
    en: 'View corporate B2B clients',
    ar: 'عرض حسابات الشركات والتعاقدات',
  },
  'business_accounts.manage': {
    en: 'Manage corporate contracts',
    ar: 'إدارة اتفاقيات وحسابات الشركات',
  },
  'users.manage': { en: 'Manage team staff members', ar: 'إدارة حسابات الموظفين والفريق' },
  'roles.manage': { en: 'Manage roles and security grants', ar: 'إدارة الأدوار وصلاحيات الوصول' },
  'branches.manage': { en: 'Manage academy branches', ar: 'إدارة مقرات وفروع الأكاديمية' },
  'audit.read': { en: 'View system audit logs', ar: 'عرض سجل الرقابة والعمليات' },
  'reports.operations.read': { en: 'View operational reports', ar: 'عرض التقارير التشغيلية' },
  'exports.sensitive': { en: 'Export sensitive databases', ar: 'تصدير البيانات والتقارير الحساسة' },
  'imports.preview': { en: 'Preview bulk excel imports', ar: 'معاينة ملفات الاستيراد المجمعة' },
  'imports.execute': { en: 'Execute bulk data import', ar: 'تنفيذ استيراد البيانات' },
  'imports.finalize': {
    en: 'Finalize and commit imported data',
    ar: 'اعتماد البيانات المستوردة نهائيًا',
  },
  'legacy_archive.read': {
    en: 'View legacy historical archive',
    ar: 'عرض الأرشيف التاريخي القديم',
  },
  'messaging.otp.read': { en: 'View OTP log & statuses', ar: 'عرض سجل رسائل التحقق' },
  'messaging.otp.manage': {
    en: 'Manage WhatsApp OTP gateway',
    ar: 'إدارة ربط قنوات واتساب للتحقق',
  },
  'me.profile.update': { en: 'Update personal profile', ar: 'تحديث بيانات الحساب الشخصي' },
};

export function getPermissionCategory(code: string): string {
  for (const cat of PERMISSION_CATEGORIES) {
    if (cat.prefixes.some((prefix) => code.startsWith(prefix))) {
      return cat.id;
    }
  }
  return 'system';
}

export function getPermissionTitle(code: string, locale: Locale): string {
  const meta = PERMISSION_TITLES[code];
  if (meta) return locale === 'ar' ? meta.ar : meta.en;
  return code;
}

export const SCOPE_LABELS: Record<string, { en: string; ar: string }> = {
  O: { en: 'Academy / Organization (Full)', ar: 'الأكاديمية بالكامل (O)' },
  B: { en: 'Branch Scoped (B)', ar: 'نطاق الفرع فقط (B)' },
  S: { en: 'Session Scoped (S)', ar: 'نطاق الجلسة فقط (S)' },
  A: { en: 'Account Scoped (A)', ar: 'نطاق الحساب فقط (A)' },
};

export function getScopeLabel(scope: string, locale: Locale): string {
  const meta = SCOPE_LABELS[scope];
  if (meta) return locale === 'ar' ? meta.ar : meta.en;
  return scope;
}
