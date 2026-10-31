import type { Locale } from '@/lib/locales';

const strings = {
  tools: ['Attendance tools', 'أدوات الحضور'],
  qr: ['Session QR code', 'رمز حضور المحاضرة'],
  qrHint: [
    'Students scan this code while the attendance window is open. Each code expires after 45 seconds.',
    'يمسح الطلاب الرمز خلال نافذة الحضور المفتوحة. تنتهي صلاحية كل رمز بعد ٤٥ ثانية.',
  ],
  generate: ['Generate new code', 'إنشاء رمز جديد'],
  expired: ['Code expired. Generate a new one.', 'انتهت صلاحية الرمز. أنشئ رمزًا جديدًا.'],
  expires: ['Expires at', 'ينتهي في'],
  scan: ['Record student QR', 'تسجيل رمز الطالب'],
  scanHint: [
    'Scan with a mobile camera, USB reader, or paste the student QR token.',
    'امسح بكاميرا الموبايل، أو استخدم قارئ USB، أو الصق رمز الطالب.',
  ],
  scanWithCamera: ['Mobile camera', 'كاميرا الموبايل'],
  manualInput: ['Manual / Scanner', 'إدخال يدوي / قارئ'],
  cameraPermissionDenied: [
    'Camera access was denied. Please allow camera permissions in browser settings, or use manual input.',
    'تم رفض الوصول إلى الكاميرا. يرجى السماح بإذن الكاميرا من إعدادات المتصفح، أو استخدم الإدخال اليدوي.',
  ],
  cameraNotFound: ['No camera found on this device.', 'لم يتم العثور على كاميرا في هذا الجهاز.'],
  pointCamera: ['Point camera at student QR code', 'وجّه الكاميرا نحو رمز الطالب'],
  switchCamera: ['Switch camera', 'تبديل الكاميرا'],
  toggleFlash: ['Flashlight', 'الكشاف'],
  rescan: ['Scan another code', 'مسح رمز آخر'],
  scanned: ['QR code scanned!', 'تم مسح الرمز بنجاح!'],
  token: ['Student QR token', 'رمز الطالب'],
  anomalies: ['Attendance exceptions', 'استثناءات الحضور'],
  anomaliesHint: [
    'Recorded exceptions for this session, newest first.',
    'الاستثناءات المسجلة لهذه المحاضرة، الأحدث أولًا.',
  ],
  record: ['Attendance record', 'سجل الحضور'],
  history: ['Change history', 'سجل التغييرات'],
  summary: ['Attendance summary', 'ملخص الحضور'],
  ratio: ['Attendance ratio', 'نسبة الحضور'],
  minimum: ['Required attendance', 'نسبة الحضور المطلوبة'],
  numerator: ['Counted attendance', 'الحضور المحتسب'],
  denominator: ['Counted sessions', 'المحاضرات المحتسبة'],
  makeupCount: ['Make-up credits', 'أرصدة التعويض'],
  makeup: ['Credit a make-up session', 'احتساب محاضرة تعويضية'],
  makeupHint: [
    'Choose another session where this enrollment was recorded present or late. One record can compensate one absence only.',
    'اختر محاضرة أخرى حضرها هذا الاشتراك بحالة حاضر أو متأخر. لا يمكن استخدام الحضور لتعويض أكثر من غياب.',
  ],
  makeupSession: ['Make-up session', 'المحاضرة التعويضية'],
  makeupRecord: ['Recorded attendance', 'الحضور المسجل'],
  compensated: ['This absence has already been compensated.', 'تم تعويض هذا الغياب بالفعل.'],
  noCandidate: [
    'This enrollment has no eligible recorded attendance in the selected session.',
    'لا يوجد حضور مسجل صالح لهذا الاشتراك في المحاضرة المختارة.',
  ],
  policies: ['Attendance policies', 'سياسات الحضور'],
  newPolicy: ['New policy version', 'إصدار سياسة جديد'],
  policyHint: [
    'A new version takes effect from its start date. Earlier versions are preserved; the previous open-ended version ends at the new start date.',
    'يسري الإصدار الجديد من تاريخ بدايته. تُحفظ الإصدارات السابقة ويُغلق الإصدار السابق المفتوح عند بداية الجديد.',
  ],
  defaultPolicy: ['Program default', 'السياسة الافتراضية للبرنامج'],
  cohortPolicy: ['Group override', 'سياسة خاصة بالمجموعة'],
  policyFallback: [
    'Without a specific policy, the program default applies; otherwise: 80% attendance, lock after 1,440 minutes, and a 30-minute window before/after the session.',
    'عند عدم وجود سياسة خاصة تُطبق سياسة البرنامج، وإلا فالقيم الافتراضية: حضور ٨٠٪، قفل بعد ١٤٤٠ دقيقة، ونافذة ٣٠ دقيقة قبل المحاضرة وبعدها.',
  ],
  minimumPercent: ['Minimum attendance (%)', 'الحد الأدنى للحضور (%)'],
  lockAfterMinutes: ['Lock after session end (minutes)', 'القفل بعد نهاية المحاضرة (دقائق)'],
  checkInOpensBeforeMinutes: ['Open before start (minutes)', 'الفتح قبل البداية (دقائق)'],
  checkInClosesAfterMinutes: ['Close after end (minutes)', 'الإغلاق بعد النهاية (دقائق)'],
  effectiveFrom: ['Effective from', 'يسري من'],
  effectiveTo: ['Effective until (optional)', 'يسري حتى (اختياري)'],
  scope: ['Applies to', 'نطاق التطبيق'],
  policyInvalid: [
    'Use 80–100%, a lock delay of 1–10,080 minutes, a window of 0–1,440 minutes, and a valid date range.',
    'استخدم نسبة ٨٠–١٠٠٪، وتأخير قفل ١–١٠٠٨٠ دقيقة، ونافذة ٠–١٤٤٠ دقيقة، وفترة زمنية صحيحة.',
  ],
  resultsLimited: ['Showing up to 500 policy versions.', 'يُعرض حتى ٥٠٠ إصدار سياسة.'],
} satisfies Record<string, readonly [string, string]>;
export type OperationsCopyKey = keyof typeof strings;
export const operationsText = (locale: Locale, key: OperationsCopyKey) =>
  strings[key][locale === 'ar' ? 1 : 0];
