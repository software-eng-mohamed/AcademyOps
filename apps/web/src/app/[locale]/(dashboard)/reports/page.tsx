import { ManagementRoute } from '@/features/management/management-route';

export default function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <ManagementRoute section="reports" params={params} />;
}
