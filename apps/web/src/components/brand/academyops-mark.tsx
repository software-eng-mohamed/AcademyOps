import Image from 'next/image';

export function AcademyOpsMark({ className = 'size-10' }: { className?: string }) {
  return <Image alt="" className={className} height={48} src="/academyops-mark.svg" width={48} />;
}
