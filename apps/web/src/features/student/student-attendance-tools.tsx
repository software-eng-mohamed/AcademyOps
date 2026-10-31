'use client';
import {
  Field,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from '@academyops/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Keyboard } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useRef, useState } from 'react';
import { getWorkspaceOverviewControllerOverviewV1QueryKey } from '@/api/generated/dashboard/dashboard';
import { checkInStudent, getStudentQr, studentKey } from '@/api/student/queries';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { QrCameraScanner } from '@/components/qr-camera-scanner';
import styles from '@/features/academy/academy-styles';
import { ErrorNotice } from '@/features/academy/academy-ui';
import { getAcademyCopy } from '@/i18n/academy-copy';
import { studentText } from '@/i18n/student-copy';
import type { Locale } from '@/lib/locales';

export function StudentAttendanceTools({ userId, locale }: { userId: string; locale: Locale }) {
  const [mode, setMode] = useState<'qr' | 'checkIn'>();
  const t = (key: Parameters<typeof studentText>[1]) => studentText(locale, key);
  return (
    <>
      <Button variant="secondary" onClick={() => setMode('qr')}>
        {t('showQr')}
      </Button>
      <Button onClick={() => setMode('checkIn')}>{t('checkIn')}</Button>
      {mode ? (
        <AttendanceDialog
          key={mode}
          mode={mode}
          userId={userId}
          locale={locale}
          onClose={() => setMode(undefined)}
        />
      ) : null}
    </>
  );
}
function AttendanceDialog({
  mode,
  userId,
  locale,
  onClose,
}: {
  mode: 'qr' | 'checkIn';
  userId: string;
  locale: Locale;
  onClose: () => void;
}) {
  const copy = getAcademyCopy(locale);
  const t = (key: Parameters<typeof studentText>[1]) => studentText(locale, key);
  const [token, setToken] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [scanMode, setScanMode] = useState<'camera' | 'manual'>('camera');
  const attempt = useRef<{ token: string; key: string } | undefined>(undefined);
  const submitting = useRef(false);
  const client = useQueryClient();
  const qr = useMutation({ mutationFn: getStudentQr, retry: false, gcTime: 0 });
  const checkIn = useMutation({
    mutationFn: async () => {
      const value = token.trim();
      if (attempt.current?.token !== value)
        attempt.current = { token: value, key: crypto.randomUUID() };
      return checkInStudent(value, attempt.current.key);
    },
    retry: false,
    onSuccess: async () => {
      await Promise.all(
        [
          studentKey(userId),
          ['management', userId],
          [...getWorkspaceOverviewControllerOverviewV1QueryKey('STUDENT'), userId],
          ['academy', userId],
        ].map((queryKey) => client.invalidateQueries({ queryKey })),
      );
    },
  });
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !checkIn.isPending) onClose();
      }}
    >
      <ModalContent className={styles.modal} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <ModalHeader>
          <div>
            <ModalTitle>{t(mode === 'qr' ? 'ownQr' : 'checkIn')}</ModalTitle>
            <ModalDescription>{t(mode === 'qr' ? 'ownQrHint' : 'checkInHint')}</ModalDescription>
          </div>
          <ModalCloseButton aria-label={copy.close} disabled={checkIn.isPending} />
        </ModalHeader>
        <ModalBody>
          {mode === 'qr' ? (
            <div className="grid justify-items-center gap-5 py-4">
              {qr.data ? (
                <div className="rounded-2xl bg-white p-5">
                  <QRCodeSVG value={qr.data.token} size={220} title={t('ownQr')} />
                </div>
              ) : (
                <Button disabled={qr.isPending} onClick={() => qr.mutate()}>
                  {qr.isPending ? copy.loading : t('showQr')}
                </Button>
              )}
              {qr.isError ? (
                <ErrorNotice error={qr.error} copy={copy} retry={() => qr.mutate()} />
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4 py-3">
              <div className="flex items-center justify-center gap-2 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
                <button
                  type="button"
                  onClick={() => setScanMode('camera')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    scanMode === 'camera'
                      ? 'bg-white text-neutral-900 shadow-xs dark:bg-neutral-900 dark:text-neutral-100'
                      : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
                  }`}
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span>{t('scanWithCamera')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScanMode('manual')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    scanMode === 'manual'
                      ? 'bg-white text-neutral-900 shadow-xs dark:bg-neutral-900 dark:text-neutral-100'
                      : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
                  }`}
                >
                  <Keyboard className="h-3.5 w-3.5" />
                  <span>{t('manualInput')}</span>
                </button>
              </div>

              {scanMode === 'camera' && !checkIn.isSuccess ? (
                <QrCameraScanner
                  locale={locale}
                  paused={checkIn.isPending}
                  onScan={async (scanned) => {
                    setToken(scanned);
                    setInvalid(false);
                    checkIn.reset();
                    if (scanned.length >= 20 && scanned.length <= 500 && !submitting.current) {
                      submitting.current = true;
                      try {
                        if (attempt.current?.token !== scanned) {
                          attempt.current = { token: scanned, key: crypto.randomUUID() };
                        }
                        await checkIn.mutateAsync();
                      } catch {
                        /* Handled by checkIn.error */
                      } finally {
                        submitting.current = false;
                      }
                    }
                  }}
                  onFallbackManual={() => setScanMode('manual')}
                  promptText={t('pointCameraSession')}
                />
              ) : null}

              <form
                className="grid gap-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (submitting.current) return;
                  const valid = token.trim().length >= 20 && token.trim().length <= 500;
                  setInvalid(!valid);
                  if (!valid) return;
                  submitting.current = true;
                  try {
                    await checkIn.mutateAsync();
                  } catch {
                    /* The mutation renders the API error. */
                  } finally {
                    submitting.current = false;
                  }
                }}
              >
                <Field htmlFor="student-session-token" label={t('sessionToken')}>
                  <Input
                    id="student-session-token"
                    aria-label={t('sessionToken')}
                    value={token}
                    onChange={(value) => {
                      setToken(value);
                      setInvalid(false);
                      checkIn.reset();
                    }}
                    maxLength={500}
                    isDisabled={checkIn.isPending}
                  />
                </Field>
                {invalid ? <p role="alert">{t('invalidToken')}</p> : null}
                {checkIn.isError ? <ErrorNotice error={checkIn.error} copy={copy} /> : null}
                {checkIn.isSuccess ? <p role="status">{t('checkedIn')}</p> : null}
                <Button type="submit" disabled={checkIn.isPending || checkIn.isSuccess}>
                  {checkIn.isPending ? copy.loading : t('checkIn')}
                </Button>
              </form>
            </div>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
