'use client';

import { Field } from '@academyops/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Keyboard } from 'lucide-react';
import { useState } from 'react';
import { academyKey } from '@/api/academy/queries';
import { scanAttendance } from '@/api/management/attendance';
import { managementKey } from '@/api/management/queries';

import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';
import { QrCameraScanner } from '@/components/qr-camera-scanner';
import { SystemCommandDialog } from '@/features/system/command-dialog';

import { managementText } from '@/i18n/management-copy';
import { operationsText } from '@/i18n/operations-copy';
import { workflowText } from '@/i18n/workflow-copy';
import type { Locale } from '@/lib/locales';

export function AttendanceScan({
  id,
  userId,
  locale,
  onClose,
}: {
  id: string;
  userId: string;
  locale: Locale;
  onClose: () => void;
}) {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'PRESENT' | 'LATE'>('PRESENT');
  const [invalid, setInvalid] = useState(false);
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const client = useQueryClient();

  return (
    <SystemCommandDialog
      title={operationsText(locale, 'scan')}
      description={operationsText(locale, 'scanHint')}
      locale={locale}
      userId={userId}
      fingerprint={JSON.stringify({ id, token, status })}
      submit={(key) => scanAttendance(id, token, status, key)}
      validate={() => {
        const valid = token.trim().length > 0 && token.length <= 500;
        setInvalid(!valid);
        return valid;
      }}
      onClose={onClose}
      onSaved={() =>
        Promise.all([
          client.invalidateQueries({ queryKey: managementKey(userId) }),
          client.invalidateQueries({ queryKey: academyKey(userId) }),
          client.invalidateQueries({
            predicate: (query) =>
              query.queryKey.some(
                (part) => typeof part === 'string' && part.includes('/dashboard/'),
              ),
          }),
        ]).then(() => undefined)
      }
    >
      {/* Mode switcher */}
      <div className="mb-3 flex items-center justify-center gap-2 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
        <button
          type="button"
          onClick={() => setMode('camera')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === 'camera'
              ? 'bg-white text-neutral-900 shadow-xs dark:bg-neutral-900 dark:text-neutral-100'
              : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          <Camera className="h-3.5 w-3.5" />
          <span>{operationsText(locale, 'scanWithCamera')}</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === 'manual'
              ? 'bg-white text-neutral-900 shadow-xs dark:bg-neutral-900 dark:text-neutral-100'
              : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          <Keyboard className="h-3.5 w-3.5" />
          <span>{operationsText(locale, 'manualInput')}</span>
        </button>
      </div>

      {/* Camera scanner */}
      {mode === 'camera' ? (
        <div className="mb-4">
          <QrCameraScanner
            locale={locale}
            onScan={(scannedToken) => {
              setToken(scannedToken);
              setInvalid(false);
            }}
            onFallbackManual={() => setMode('manual')}
            promptText={operationsText(locale, 'pointCamera')}
          />
        </div>
      ) : null}

      <div className="relative">
        <Input
          label={operationsText(locale, 'token')}
          type="text"
          autoComplete="off"
          autoFocus={mode === 'manual'}
          placeholder={workflowText(locale, 'scanQrPrompt')}
          value={token}
          onChange={setToken}
          isInvalid={invalid}
          className="font-mono text-sm tracking-wide"
        />
        {token ? (
          <button
            type="button"
            onClick={() => setToken('')}
            className="absolute end-2.5 top-9 text-xs text-ink-muted hover:text-ink"
            aria-label="Clear"
          >
            ✕
          </button>
        ) : null}
      </div>
      <Field label={managementText(locale, 'status')} htmlFor="scan-status">
        <Select
          triggerId="scan-status"
          aria-label={managementText(locale, 'status')}
          selectedKey={status}
          renderValue={managementText(locale, status)}
          onSelectionChange={(value) => setStatus(value === 'LATE' ? 'LATE' : 'PRESENT')}
        >
          <SelectItem id="PRESENT" textValue={managementText(locale, 'PRESENT')}>
            {managementText(locale, 'PRESENT')}
          </SelectItem>
          <SelectItem id="LATE" textValue={managementText(locale, 'LATE')}>
            {managementText(locale, 'LATE')}
          </SelectItem>
        </Select>
      </Field>
    </SystemCommandDialog>
  );
}
