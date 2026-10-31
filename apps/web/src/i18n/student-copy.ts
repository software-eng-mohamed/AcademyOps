import type { Locale } from '@/lib/locales';

const strings = {
  learning: ['My learning', 'كورساتي'],
  learningHint: [
    'Your enrollments, curriculum and progress in one place.',
    'اشتراكاتك ومحتوى كورساتك وتقدّمك في مكان واحد.',
  ],
  schedule: ['My schedule', 'جدولي'],
  scheduleHint: [
    'Your published classes, including schedule changes. Times are shown in Cairo time.',
    'محاضراتك المنشورة وتغييرات مواعيدها. كل المواعيد بتوقيت القاهرة.',
  ],
  attendance: ['My attendance', 'حضوري'],
  attendanceHint: [
    'Your attendance only. Show your personal QR to staff or enter the current session code.',
    'سجلات حضورك أنت فقط. اعرض رمزك الشخصي للموظف أو أدخل رمز المحاضرة الحالي.',
  ],
  finance: ['My finance', 'حسابي المالي'],
  financeHint: [
    'Your course balances, installments, payments and documents.',
    'أرصدة كورساتك وأقساطك ومدفوعاتك ومستنداتك.',
  ],
  certificates: ['My certificates', 'شهاداتي'],
  certificatesHint: [
    'Your issued certificates and available downloads.',
    'شهاداتك الصادرة والملفات المتاحة للتحميل.',
  ],
  course: ['Course', 'الكورس'],
  installments: ['Installments', 'الأقساط'],
  payments: ['Payments', 'المدفوعات'],
  invoices: ['Invoices', 'الفواتير'],
  receipts: ['Receipts', 'الإيصالات'],
  curriculum: ['Curriculum', 'محتوى الكورس'],
  ownQr: ['My attendance QR', 'رمز حضوري'],
  ownQrHint: [
    'Show this private code to authorized academy staff. Do not share it with others.',
    'اعرض الرمز الخاص ده للموظف المسؤول في الأكاديمية فقط، ولا تشاركه مع غيره.',
  ],
  showQr: ['Show my QR', 'عرض رمزي'],
  checkIn: ['Check in', 'تسجيل حضوري'],
  checkInHint: [
    'Scan the session QR code with your mobile camera or enter the session code.',
    'امسح رمز المحاضرة بكاميرا الموبايل أو أدخل رمز المحاضرة يدويًا.',
  ],
  scanWithCamera: ['Mobile camera', 'كاميرا الموبايل'],
  manualInput: ['Enter code', 'إدخال الرمز'],
  pointCameraSession: [
    'Point camera at the session QR on screen',
    'وجّه الكاميرا نحو رمز المحاضرة المعروض',
  ],
  cameraPermissionDenied: [
    'Camera access was denied. Please allow camera permissions in browser settings, or enter the code manually.',
    'تم رفض الوصول إلى الكاميرا. يرجى تفعيل إذن الكاميرا من إعدادات المتصفح أو إدخال الرمز يدويًا.',
  ],
  sessionToken: ['Session code', 'رمز المحاضرة'],
  checkedIn: ['Attendance recorded. Your records are refreshed.', 'تم تسجيل حضورك وتحديث سجلاتك.'],
  invalidToken: [
    'Enter a session code between 20 and 500 characters.',
    'أدخل رمز محاضرة من ٢٠ إلى ٥٠٠ حرف.',
  ],
  balance: ['Balance', 'الرصيد المستحق'],
  credit: ['Credit balance', 'رصيد دائن'],
  charged: ['Charges', 'المستحقات'],
  credited: ['Credits', 'المبالغ الدائنة'],
  amount: ['Amount', 'القيمة'],
  allocated: ['Allocated', 'المسدّد'],
  remaining: ['Remaining', 'المتبقي'],
  due: ['Due date', 'تاريخ الاستحقاق'],
  pay: ['Prepare payment', 'تجهيز الدفع'],
  checkout: ['Continue to secure payment', 'متابعة الدفع الآمن'],
  paymentStatus: ['Payment status', 'حالة الدفع'],
  refreshPayment: ['Refresh payment status', 'تحديث حالة الدفع'],
  paymentHint: [
    'A checkout link is not proof of payment. Payment is confirmed only after the provider verifies it.',
    'رابط الدفع مش إثبات للسداد. بيتأكد الدفع بعد تأكيده من مزوّد الخدمة.',
  ],
  eligibility: ['Certificate eligibility', 'استحقاق الشهادة'],
  eligible: ['Eligible', 'مستحق'],
  ineligible: ['Not yet eligible', 'غير مستحق حاليًا'],
  completed: ['Course completion', 'اكتمال الكورس'],
  financialHold: ['Financial hold', 'تعليق مالي'],
  noAttendance: [
    'No attendance has been recorded for you in this session yet.',
    'لم يُسجّل لك حضور في المحاضرة دي لسه.',
  ],
  unavailable: ['This record is unavailable to your account.', 'السجل ده غير متاح لحسابك.'],
} as const;
export function studentText(locale: Locale, key: keyof typeof strings) {
  return strings[key][locale === 'ar' ? 1 : 0];
}
export type StudentTextKey = keyof typeof strings;
