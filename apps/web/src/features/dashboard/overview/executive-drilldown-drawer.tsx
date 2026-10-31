'use client';

import {
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@academyops/ui';
import { ArrowRight2, Chart } from 'iconsax-react';
import Link from 'next/link';
import type { ResponseDashboardControllerOverviewResponse } from '@/api/generated/models/responseDashboardControllerOverviewResponse';
import styles from '@/features/academy/academy-styles';
import type { Locale } from '@/lib/locales';
import { type ExecutiveMetricKey, getExecutiveMetricDetail } from './executive-comparison-data';

export function ExecutiveDrilldownDrawer({
  metricKey,
  overview,
  locale,
  onClose,
}: {
  metricKey: ExecutiveMetricKey | null;
  overview: ResponseDashboardControllerOverviewResponse;
  locale: Locale;
  onClose: () => void;
}) {
  if (!metricKey) return null;
  const isAr = locale === 'ar';
  const data = getExecutiveMetricDetail(metricKey, overview, locale);

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className={styles.drawer} dir={isAr ? 'rtl' : 'ltr'}>
        <DrawerHeader className="border-b border-border-secondary p-5 sm:p-6">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-500/10 px-2.5 py-0.5 text-xs font-semibold text-accent-600">
              <Chart size={14} color="currentColor" variant="Bulk" />
              {isAr ? 'تفاصيل المؤشر' : 'Metric details'}
            </span>
            <DrawerTitle className="mt-2.5 text-xl font-bold tracking-tight text-text-primary [overflow-wrap:anywhere]">
              {data.title}
            </DrawerTitle>
            <DrawerDescription className="mt-1 text-xs leading-relaxed text-text-secondary">
              {data.subtitle}
            </DrawerDescription>
            <p className="mt-4 text-3xl font-bold tracking-tight text-text-primary tabular-nums">
              {data.currentValue}
            </p>
          </div>
          <DrawerCloseButton aria-label={isAr ? 'إغلاق' : 'Close'} />
        </DrawerHeader>

        <DrawerBody className="space-y-5 p-5 sm:p-6 plg-scrollbar">
          {data.breakdown.length > 0 ? (
            <section className="rounded-2xl border border-border-secondary bg-background-primary-default p-4 shadow-xs">
              <h3 className="mb-3 text-sm font-semibold text-text-primary">
                {isAr ? 'التوزيع الحالي' : 'Current breakdown'}
              </h3>
              <dl className="divide-y divide-border-secondary/70 text-sm">
                {data.breakdown.map((row) => (
                  <div className="flex items-start justify-between gap-4 py-3" key={row.label}>
                    <dt className="text-text-secondary">{row.label}</dt>
                    <dd className="font-semibold text-text-primary tabular-nums">
                      {row.formattedValue}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">
              {isAr ? 'السجل الشهري المتاح' : 'Available monthly history'}
            </h3>
            {data.monthly.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-border-secondary bg-background-primary-default shadow-xs">
                <table className="w-full text-start text-xs">
                  <thead>
                    <tr className="border-b border-border-secondary bg-background-secondary-default/60 text-text-secondary">
                      <th className="px-3.5 py-2.5 text-start font-semibold">
                        {isAr ? 'الشهر' : 'Month'}
                      </th>
                      <th className="px-3.5 py-2.5 text-start font-semibold">
                        {isAr ? 'القيمة' : 'Value'}
                      </th>
                      <th className="px-3.5 py-2.5 text-start font-semibold">
                        {isAr ? 'التغير عن الشهر السابق' : 'Change from previous month'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-secondary/70">
                    {data.monthly.map((row) => (
                      <tr key={row.periodKey}>
                        <th className="px-3.5 py-3 text-start font-medium text-text-primary">
                          {row.period}
                        </th>
                        <td className="px-3.5 py-3 font-semibold text-text-primary tabular-nums">
                          {row.formattedValue}
                        </td>
                        <td className="px-3.5 py-3 text-text-secondary tabular-nums">
                          {row.deltaPercent === undefined
                            ? '—'
                            : `${row.deltaPercent > 0 ? '+' : ''}${row.deltaPercent}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-xl border border-border-secondary p-4 text-sm text-text-secondary">
                {isAr
                  ? 'لا يتوفر سجل شهري لهذا المؤشر.'
                  : 'Monthly history is not available for this metric.'}
              </p>
            )}
          </section>

          <p className="text-xs leading-relaxed text-text-tertiary">
            {isAr
              ? 'المستهدفات ومساهمات الفروع غير متاحة لهذا المؤشر.'
              : 'Targets and branch contributions are not available for this metric.'}
          </p>
          <Link
            href={data.actionHref}
            onClick={onClose}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-accent-700 active:scale-[0.99]"
          >
            <span>{data.actionLabel}</span>
            <ArrowRight2 size={16} color="currentColor" className="rtl:rotate-180" />
          </Link>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
