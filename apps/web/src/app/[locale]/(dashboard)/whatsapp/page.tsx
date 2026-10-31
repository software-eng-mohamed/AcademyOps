import { SystemRoute } from '@/features/system/system-route';
export default function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <SystemRoute section="whatsapp" params={params} />;
}
