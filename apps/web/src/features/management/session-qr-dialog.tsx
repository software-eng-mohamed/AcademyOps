'use client';

import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from '@academyops/ui';
import { useMutation } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';

import { createSessionChallenge } from '@/api/management/attendance';

import { Button } from '@/components/base/buttons/button';

import styles from '@/features/academy/academy-form-styles';

import { ErrorNotice, formatAcademyDateTime } from '@/features/academy/academy-ui';

import { getAcademyCopy } from '@/i18n/academy-copy';

import { operationsText } from '@/i18n/operations-copy';
import type { Locale } from '@/lib/locales';
export function SessionQr({
  id,
  locale,
  onClose,
}: {
  id: string;
  locale: Locale;
  onClose: () => void;
}) {
  const copy = getAcademyCopy(locale);
  const [now, setNow] = useState(Date.now);
  const [challenge, setChallenge] = useState<{ token: string; expiresAt: string }>();
  const [expired, setExpired] = useState(false);
  // Short-lived tokens are component-local and never put in query/storage caches.
  const request = useMutation({
    mutationFn: async () => {
      const value = await createSessionChallenge(id);
      setChallenge(value);
      return null;
    },
    retry: false,
    gcTime: 0,
  });
  const expiresAt = challenge ? Date.parse(challenge.expiresAt) : 0;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [expiresAt]);
  useEffect(() => {
    if (challenge && (!Number.isFinite(expiresAt) || expiresAt <= now)) {
      setChallenge(undefined);
      setExpired(true);
    }
  }, [challenge, expiresAt, now]);
  const active = challenge && Number.isFinite(expiresAt) && expiresAt > now;
  return (
    <Modal
      open
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <ModalContent className={styles.modal} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <ModalHeader>
          <div>
            <ModalTitle>{operationsText(locale, 'qr')}</ModalTitle>
            <ModalDescription>{operationsText(locale, 'qrHint')}</ModalDescription>
          </div>
          <ModalCloseButton aria-label={copy.close} />
        </ModalHeader>
        <ModalBody>
          <div className="grid justify-items-center gap-5 py-4">
            {active ? (
              <>
                <div className="rounded-2xl bg-white p-5">
                  <QRCodeSVG
                    value={challenge.token}
                    size={220}
                    title={operationsText(locale, 'qr')}
                  />
                </div>
                <p>
                  {operationsText(locale, 'expires')}:{' '}
                  {formatAcademyDateTime(challenge.expiresAt, locale, copy.none)}
                </p>
              </>
            ) : expired ? (
              <p role="status">{operationsText(locale, 'expired')}</p>
            ) : null}
            {request.isError ? <ErrorNotice error={request.error} copy={copy} /> : null}
            <Button
              disabled={request.isPending}
              onClick={() => {
                request.reset();
                setChallenge(undefined);
                setExpired(false);
                setNow(Date.now());
                request.mutate();
              }}
            >
              {request.isPending ? copy.loading : operationsText(locale, 'generate')}
            </Button>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
