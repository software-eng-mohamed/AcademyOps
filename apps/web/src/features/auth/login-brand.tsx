import { AcademyOpsMark } from '@/components/brand/academyops-mark';

export function AcademyOpsBrand({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-3" data-login-brand dir="ltr">
      <AcademyOpsMark />
      <span className="text-sm font-bold tracking-tight text-ink">{label}</span>
    </span>
  );
}
