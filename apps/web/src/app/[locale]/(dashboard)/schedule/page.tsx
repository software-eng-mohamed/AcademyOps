import { StudentRoute } from '@/features/student/student-route';
export default function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <StudentRoute section="schedule" params={params} />;
}
