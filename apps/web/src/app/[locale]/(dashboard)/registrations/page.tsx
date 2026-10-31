import { AcademyRoute } from '@/features/academy/academy-route';

export default function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <AcademyRoute section="registrations" params={params} />;
}
