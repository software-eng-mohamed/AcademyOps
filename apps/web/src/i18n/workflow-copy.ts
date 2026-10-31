import type { Locale } from '@/lib/locales';

const strings = {
  workflowHubTitle: ['Daily Operations Hub', 'مسارات العمل اليومية السريعة'],
  workflowHubHint: [
    'Quick, effortless access to run academy operations step-by-step.',
    'وصول فوري ومبسّط لتنفيذ عمليات الأكاديمية خطوة بخطوة بأعلى سرعة وسهولة.',
  ],
  newCohort: ['Create Cohort / Group', 'إنشاء دفعة / مجموعة جديدة'],
  newCohortDesc: [
    'Set up intake, program, capacity, and open student bookings.',
    'تجهيز البرنامج، الطاقة الاستيعابية، وفتح باب حجز الطلاب.',
  ],
  enrollStudent: ['Enroll & Down Payment', 'تسجيل طالب وسداد مقدم'],
  enrollStudentDesc: [
    'Confirm student admission and track initial payments.',
    'تأكيد حجز الطالب ومتابعة سداد الدفعات والمقدمات.',
  ],
  trainerSessions: ['Sessions & Locations', 'مواعيد وقاعات الجلسات'],
  trainerSessionsDesc: [
    'View trainer schedules, start times, rooms, and online links.',
    'متابعة جدول المعلمين، توقيتات المحاضرات، القاعات، وروابط الأونلاين.',
  ],
  quickAttendance: ['Scan Student QR', 'مسح غياب الطلاب (QR)'],
  quickAttendanceDesc: [
    'Scan student QR codes effortlessly to record attendance.',
    'تسجيل الحضور الفوري بمسح رمز QR الخاص بالطلاب بكل سهولة.',
  ],
  certificatesFinance: ['Certificates & Clearance', 'الشهادات والمخالصة المالية'],
  certificatesFinanceDesc: [
    'Verify 100% full payment clearance and issue certificates.',
    'التأكد من سداد كامل المصروفات واعتماد إصدار الشهادة.',
  ],
  openFullPage: ['Open in full page', 'عرض كصفحة كاملة'],
  openDrawer: ['Switch to side drawer', 'عرض كلوحة جانبية'],
  backToList: ['Back to list', 'العودة إلى القائمة'],
  detailsView: ['Record Details', 'تفاصيل السجل'],
  quickActions: ['Quick Actions', 'الإجراءات السريعة'],
  cohortLifecycle: ['Cohort Progress', 'مسار تقدم المجموعة'],
  cohortStepIntake: ['1. Intake Open', '1. فتح باب الحجز'],
  cohortStepDeposits: ['2. Students & Deposits', '2. تأكيد الطلاب والمقدم'],
  cohortStepActivation: ['3. Cohort Active', '3. اكتمال وبدء الدفعة'],
  cohortStepSessions: ['4. Schedule Sessions', '4. جدولة الجلسات والقاعات'],
  scheduleCohortSession: ['Schedule Session for this Cohort', 'جدولة جلسة لهذه المجموعة'],
  viewCohortSessions: ['View Sessions', 'عرض الجلسات'],
  enrollCohortStudent: ['Enroll Student in Cohort', 'تسجيل طالب بهذه المجموعة'],
  financialClearance: ['Financial Clearance', 'المخالصة المالية'],
  fullyPaidTitle: [
    'Fully Paid (100%) · Ready for Certificate',
    'مسدد بالكامل (100%) · جاهز لإصدار الشهادة',
  ],
  fullyPaidDesc: [
    'All course fees and dues are completely settled. The student is cleared for certificate issuance.',
    'تم سداد كامل رسوم الكورس بدون أي متبقيات. الطالب مستوفٍ لشروط استلام الشهادة رسمياً.',
  ],
  remainingBalanceTitle: ['Remaining Balance: {amount} EGP', 'متبقي مصروفات: {amount} ج.م'],
  remainingBalanceDesc: [
    'Official certificates require full payment of all dues before delivery.',
    'يلزم سداد كامل المصروفات المتبقية قبل اعتماد وتسليم الشهادة الرسمية للدارس.',
  ],
  recordPaymentNow: ['Record Payment Now', 'تسجيل دفعة الآن'],
  takeAttendanceNow: ['Record Attendance', 'تسجيل الحضور'],
  scanQrPrompt: ['Scan student QR or paste token', 'امسح رمز QR الخاص بالطالب أو الصقه هنا'],
  scanSuccess: ['Attendance successfully recorded', 'تم تسجيل الحضور بنجاح'],
} as const;

export type WorkflowTextKey = keyof typeof strings;

export function workflowText(locale: Locale, key: WorkflowTextKey): string {
  const item = strings[key];
  if (!item) return key;
  return locale === 'ar' ? item[1] : item[0];
}
