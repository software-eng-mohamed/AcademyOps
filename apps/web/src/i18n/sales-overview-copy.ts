import type { Locale } from '@/lib/locales';

type SalesOverviewCopy = {
  title: string;
  welcome: string;
  assignedDescription: string;
  accessibleDescription: string;
  metrics: {
    open: string;
    openCaption: string;
    new: string;
    newCaption: string;
    converted: string;
    convertedCaption: string;
  };
  followUps: {
    title: string;
    description: string;
    scheduledToday: string;
    overdue: string;
    today: string;
    emptyTitle: string;
    emptyDescription: string;
    preview: string;
    timezone: string;
    emptyFootnote: string;
    unnamed: string;
    noStage: string;
  };
  loading: string;
  error: string;
  stale: string;
  forbidden: string;
  retry: string;
};

const en: SalesOverviewCopy = {
  title: 'Sales overview',
  welcome: 'Good to see you, {name}.',
  assignedDescription: 'Your leads, your follow-ups. A little clarity for the day ahead.',
  accessibleDescription: 'A quick look at the leads and follow-ups within your access.',
  metrics: {
    open: 'Open leads',
    openCaption: 'Ready for your next conversation',
    new: 'New this month',
    newCaption: 'Leads created this month',
    converted: 'Converted this month',
    convertedCaption: 'Leads converted to enrollments',
  },
  followUps: {
    title: 'Follow-ups',
    description: 'Due today and earlier, oldest first.',
    scheduledToday: '{count} scheduled today',
    overdue: 'Overdue',
    today: 'Today',
    emptyTitle: 'You’re all caught up.',
    emptyDescription: 'No follow-ups are due through the end of today.',
    preview: 'Showing {shown} of {total} due follow-ups',
    timezone: 'Cairo time',
    emptyFootnote: 'Your scheduled follow-ups will appear here.',
    unnamed: 'Unnamed lead',
    noStage: 'No stage assigned',
  },
  loading: 'Loading your sales overview',
  error: 'We couldn’t load your sales overview. Please try again.',
  stale: 'We couldn’t refresh this view. These are the last loaded figures.',
  forbidden: 'Your account no longer has access to these leads.',
  retry: 'Try again',
};

const ar: SalesOverviewCopy = {
  title: 'نظرة المبيعات',
  welcome: 'أهلًا بيك يا {name}',
  assignedDescription: 'عملاؤك ومتابعاتك، نظرة خفيفة تساعدك تبدأ يومك.',
  accessibleDescription: 'نظرة سريعة على العملاء والمتابعات المتاحة حسب صلاحياتك.',
  metrics: {
    open: 'العملاء المفتوحون',
    openCaption: 'في انتظار خطوتك القادمة',
    new: 'الجدد هذا الشهر',
    newCaption: 'العملاء المضافون خلال الشهر',
    converted: 'التحويلات هذا الشهر',
    convertedCaption: 'عملاء تحوّلوا إلى التحاقات',
  },
  followUps: {
    title: 'المتابعات',
    description: 'متابعات اليوم والمتأخرة، الأقدم أولًا.',
    scheduledToday: '{count} مجدولة اليوم',
    overdue: 'متأخرة',
    today: 'اليوم',
    emptyTitle: 'كل المتابعات تمام.',
    emptyDescription: 'لا توجد متابعات مستحقة حتى نهاية اليوم.',
    preview: 'عرض {shown} من {total} متابعات مستحقة',
    timezone: 'بتوقيت القاهرة',
    emptyFootnote: 'متابعاتك المجدولة هتظهر هنا.',
    unnamed: 'عميل بدون اسم',
    noStage: 'لم تُحدد المرحلة',
  },
  loading: 'جارٍ تحميل نظرة المبيعات',
  error: 'تعذر تحميل نظرة المبيعات. حاول مرة أخرى.',
  stale: 'تعذر تحديث البيانات. المعروض هو آخر بيانات تم تحميلها.',
  forbidden: 'لم يعد لحسابك صلاحية عرض هؤلاء العملاء.',
  retry: 'حاول مجددًا',
};

export function getSalesOverviewCopy(locale: Locale): SalesOverviewCopy {
  return locale === 'ar' ? ar : en;
}
