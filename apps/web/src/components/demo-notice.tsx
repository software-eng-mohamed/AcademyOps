'use client';

import { useState } from 'react';
import { resetDemoData } from '@/api/browser/demo-controls';
import { Button } from '@/components/base/buttons/button';
import type { Locale } from '@/lib/locales';

export function DemoNotice({ locale }: { locale: Locale }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const arabic = locale === 'ar';
  async function reset() {
    setPending(true);
    setFailed(false);
    try {
      await resetDemoData();
      window.location.reload();
    } catch {
      setPending(false);
      setFailed(true);
    }
  }
  return (
    <aside
      aria-label={arabic ? 'نسخة تجريبية' : 'Demo information'}
      className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border-button-default bg-background-full px-4 py-2 text-caption-1-regular text-text-secondary"
    >
      <p className="min-w-0 flex-1">
        {arabic
          ? 'نسخة تجريبية ببيانات وهمية. التعديلات في هذا المتصفح فقط؛ لا تُنفَّذ مدفوعات أو رسائل فعلية.'
          : 'Demo with fictional data. Edits stay in this browser; no real payments or messages are sent.'}
      </p>
      <Button disabled={pending} onClick={reset} size="xs" variant="ghost">
        {arabic ? 'إعادة ضبط التجربة' : 'Reset demo'}
      </Button>
      {failed && (
        <p role="alert">
          {arabic ? 'تعذرت إعادة الضبط. حاول مرة أخرى.' : 'Reset failed. Please try again.'}
        </p>
      )}
    </aside>
  );
}
