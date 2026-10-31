import { StudentRoute } from '@/features/student/student-route';
export default function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <StudentRoute section="learning" params={params} />;
}
