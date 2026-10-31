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
  Textarea,
} from '@academyops/ui';

import { useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useId, useState } from 'react';
import { record } from '@/api/academy/models';
import { getWorkspaceOverviewControllerOverviewV1QueryKey } from '@/api/generated/dashboard/dashboard';
import { executeChannelAction, readPairingCode } from '@/api/system/commands';

import { Button } from '@/components/base/buttons/button';
import styles from '@/features/academy/academy-styles';

import { ErrorNotice } from '@/features/academy/academy-ui';
import { isStepUpRequired, StepUpDialog } from '@/features/academy/step-up-dialog';

import { getAcademyCopy } from '@/i18n/academy-copy';
import { systemText } from '@/i18n/system-copy';

import type { Locale } from '@/lib/locales';
import { SystemCommandDialog } from './command-dialog';
import { SystemValue } from './system-ui';
export type ChannelAction = 'connect' | 'disable' | 'reset';

export function ChannelDialog({
  action,
  version,
  userId,
  locale,
  onClose,
  onSaved,
}: {
  action: ChannelAction;
  version: number;
  userId: string;
  locale: Locale;
  onClose: () => void;
  onSaved?: (result?: unknown) => void;
}) {
  const [reason, setReason] = useState(
    action === 'reset'
      ? locale === 'ar'
        ? 'إصلاح القناة ومسح الجلسة السابقة لربط هاتف جديد'
        : 'Repair channel and reset session to link new device'
      : '',
  );
  const id = useId();
  const client = useQueryClient();
  return (
    <SystemCommandDialog
      title={systemText(locale, action)}
      description={systemText(locale, `${action}Hint`)}
      locale={locale}
      userId={userId}
      fingerprint={JSON.stringify({ action, version, reason: reason.trim() })}
      submit={(key) => executeChannelAction(action, version, reason, key)}
      submitLabel={systemText(locale, action)}
      validate={() => reason.trim().length >= 10 && reason.trim().length <= 500}
      onClose={onClose}
      onSaved={(result) => {
        client.invalidateQueries({
          queryKey: [...getWorkspaceOverviewControllerOverviewV1QueryKey('OTP_OPERATOR'), userId],
        });
        onSaved?.(result);
      }}
    >
      <Field htmlFor={id} label={systemText(locale, 'reason')}>
        <Textarea
          id={id}
          required
          minLength={10}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <p className="text-sm leading-relaxed text-ink-muted">
        {systemText(locale, 'channelReasonHint')}
      </p>
    </SystemCommandDialog>
  );
}

export function PairingCode({
  locale,
  onClose,
  onReset,
}: {
  locale: Locale;
  onClose: () => void;
  onReset?: () => void;
}) {
  const [data, setData] = useState<{ qr: string; expiresAt: string }>();
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [stepUp, setStepUp] = useState(false);
  const copy = getAcademyCopy(locale);
  // biome-ignore lint/correctness/useExhaustiveDependencies: an explicit retry refetches the short-lived credential without caching it.
  useEffect(() => {
    const controller = new AbortController();
    setPending(true);
    setData(undefined);
    setError(undefined);
    // Pairing credentials stay in component memory, never in Query cache, storage or logs.
    void readPairingCode(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        const next = record(value);
        if (typeof next.qr !== 'string' || typeof next.expiresAt !== 'string')
          throw new Error('Invalid pairing response');
        setData({ qr: next.qr, expiresAt: next.expiresAt });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason);
          if (isStepUpRequired(reason)) setStepUp(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (!data) return;
    const delay = Date.parse(data.expiresAt) - Date.now();
    const timer = setTimeout(
      () => setData(undefined),
      Math.max(0, Number.isFinite(delay) ? delay : 0),
    );
    return () => clearTimeout(timer);
  }, [data]);
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ModalContent className={styles.modal} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <ModalHeader>
          <div>
            <ModalTitle>{systemText(locale, 'showQr')}</ModalTitle>
            <ModalDescription>{systemText(locale, 'qrPrivacy')}</ModalDescription>
          </div>
          <ModalCloseButton aria-label={copy.close} />
        </ModalHeader>
        <ModalBody>
          <div className="grid justify-items-center gap-4 py-4">
            <p className="max-w-md text-center text-sm leading-relaxed text-ink-muted">
              {systemText(locale, 'qrInstructions')}
            </p>
            {pending ? (
              <p role="status">{copy.loading}</p>
            ) : error ? (
              <div className="grid justify-items-center gap-3">
                <ErrorNotice
                  error={error}
                  copy={{
                    ...copy,
                    conflict: systemText(locale, 'qrNotReady'),
                    error: systemText(locale, 'qrUnavailable'),
                  }}
                  retry={() => setAttempt((old) => old + 1)}
                />
                {onReset ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      onClose();
                      onReset();
                    }}
                  >
                    {systemText(locale, 'resetAndChangePhone')}
                  </Button>
                ) : null}
              </div>
            ) : data && Date.parse(data.expiresAt) > Date.now() ? (
              <>
                <div className="rounded-xl bg-white p-3">
                  <QRCodeSVG
                    value={data.qr}
                    size={224}
                    marginSize={2}
                    title={systemText(locale, 'showQr')}
                  />
                </div>
                <p className="text-xs text-ink-muted">
                  {systemText(locale, 'qrExpiresAt')}:{' '}
                  <SystemValue name="qrExpiresAt" value={data.expiresAt} locale={locale} />
                </p>
                {onReset ? (
                  <Button
                    variant="ghost"
                    className="text-xs text-red-600 hover:text-red-700"
                    onClick={() => {
                      onClose();
                      onReset();
                    }}
                  >
                    {systemText(locale, 'resetAndChangePhone')}
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                <p role="status" className="text-sm text-ink-muted">
                  {systemText(locale, 'qrExpired')}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="secondary" onClick={() => setAttempt((old) => old + 1)}>
                    {copy.retry}
                  </Button>
                  {onReset ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        onClose();
                        onReset();
                      }}
                    >
                      {systemText(locale, 'resetAndChangePhone')}
                    </Button>
                  ) : null}
                </div>
              </>
            )}
            <StepUpDialog
              open={stepUp}
              locale={locale}
              copy={copy}
              onClose={() => setStepUp(false)}
              onVerified={() => {
                setStepUp(false);
                setAttempt((old) => old + 1);
              }}
            />
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
