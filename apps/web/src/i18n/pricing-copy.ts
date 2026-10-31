import type { Locale } from '@/lib/locales';

const labels = {
  title: ['Fees & installments', 'الرسوم والأقساط'],
  hint: [
    'Set the enrollment fees, approve the agreement, then prepare its installment schedule.',
    'حدد رسوم الالتحاق واعتمد الاتفاق، ثم جهّز جدول الأقساط.',
  ],
  proposalHint: [
    'Propose the enrollment fees and submit them for review. Approval is handled by an authorized reviewer.',
    'اقترح رسوم الالتحاق وأرسلها للمراجعة. يتولى المسؤول المخوّل اعتمادها.',
  ],
  create: ['New fee agreement', 'اتفاق رسوم جديد'],
  edit: ['Edit fee agreement', 'تعديل اتفاق الرسوم'],
  submit: ['Submit for approval', 'إرسال للاعتماد'],
  approve: ['Approve agreement', 'اعتماد الاتفاق'],
  reject: ['Reject agreement', 'رفض الاتفاق'],
  createSchedule: ['New installment schedule', 'جدول أقساط جديد'],
  editSchedule: ['Edit installment schedule', 'تعديل جدول الأقساط'],
  approveSchedule: ['Approve installment schedule', 'اعتماد جدول الأقساط'],
  empty: ['No fee agreements for this enrollment.', 'لا توجد اتفاقات رسوم لهذا الالتحاق.'],
  readOnly: [
    'View this enrollment’s fee agreements and installment schedules. Changes are handled by the finance team.',
    'عرض اتفاقات رسوم هذا الالتحاق وجداول أقساطه. يتولى الفريق المالي تعديلها.',
  ],
  locked: [
    'New fees can only be set while the enrollment is Draft or Pending approval.',
    'يمكن إنشاء اتفاق رسوم فقط عندما يكون الالتحاق مسودة أو بانتظار الاعتماد.',
  ],
  version: ['Agreement', 'الاتفاق'],
  schedule: ['Installment schedule', 'جدول الأقساط'],
  lines: ['Fee items', 'بنود الرسوم'],
  description: ['Description', 'الوصف'],
  descriptionEn: ['Description in English', 'الوصف بالإنجليزية'],
  descriptionAr: ['Description in Arabic', 'الوصف بالعربية'],
  type: ['Fee type', 'نوع الرسوم'],
  quantity: ['Quantity', 'الكمية'],
  unitAmount: ['Unit amount (EGP)', 'قيمة الوحدة (ج.م)'],
  amount: ['Amount (EGP)', 'القيمة (ج.م)'],
  discount: ['Discount amount (EGP)', 'قيمة الخصم (ج.م)'],
  total: ['Total (EGP)', 'الإجمالي (ج.م)'],
  addLine: ['Add fee item', 'إضافة بند رسوم'],
  remove: ['Remove item', 'حذف البند'],
  addInstallment: ['Add installment', 'إضافة قسط'],
  dueDate: ['Due date', 'تاريخ الاستحقاق'],
  reason: ['Decision reason', 'سبب القرار'],
  confirm: [
    'Review the details before saving. This action is recorded in the audit log.',
    'راجع البيانات قبل الحفظ. يُسجل هذا الإجراء في سجل المراجعة.',
  ],
  scheduleHint: [
    'Installments must be positive, ordered by date, and add up to the agreement total exactly.',
    'يجب أن تكون الأقساط موجبة ومرتبة حسب التاريخ ومجموعها يساوي إجمالي الاتفاق بالضبط.',
  ],
  decisionHint: [
    'Approving a new agreement replaces the previously approved version. Discounts over 10% require tier 2 approval.',
    'اعتماد اتفاق جديد يحل محل النسخة المعتمدة السابقة. الخصم فوق ١٠٪ يتطلب صلاحية الاعتماد من المستوى الثاني.',
  ],
  draft: ['Draft', 'مسودة'],
  DRAFT: ['Draft', 'مسودة'],
  PROPOSED: ['Pending approval', 'بانتظار الاعتماد'],
  APPROVED: ['Approved', 'معتمد'],
  REJECTED: ['Rejected', 'مرفوض'],
  SUPERSEDED: ['Superseded', 'مستبدل'],
  TUITION: ['Tuition', 'رسوم الدراسة'],
  REGISTRATION: ['Registration', 'رسوم التسجيل'],
  MATERIALS: ['Materials', 'المواد التعليمية'],
  OTHER: ['Other', 'أخرى'],
  details: ['View agreement', 'عرض الاتفاق'],
  next: ['More agreements', 'اتفاقات أخرى'],
} as const;
export function pricingText(locale: Locale, key: string): string {
  return labels[key as keyof typeof labels]?.[locale === 'ar' ? 1 : 0] ?? key;
}
