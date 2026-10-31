import { Element3 } from 'iconsax-react';
import { Breadcrumb, BreadcrumbItem } from '@/components/base/breadcrumb/breadcrumb';

export function DashboardBreadcrumbs({
  ariaLabel,
  dashboardHref,
  dashboardLabel,
  overviewLabel,
}: {
  ariaLabel: string;
  dashboardHref: string;
  dashboardLabel: string;
  overviewLabel: string;
}) {
  return (
    <Breadcrumb aria-label={ariaLabel} className="min-h-10 [&>ol]:px-0">
      <BreadcrumbItem
        className="mx-0 px-0 py-1 text-sm font-semibold text-text-secondary"
        href={dashboardHref}
      >
        <Element3 aria-hidden color="currentColor" size={16} variant="Bulk" />
        {dashboardLabel}
      </BreadcrumbItem>
      <BreadcrumbItem
        className="rounded-lg bg-linear-to-r from-accent-600 to-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm"
        current
      >
        {overviewLabel}
      </BreadcrumbItem>
    </Breadcrumb>
  );
}
