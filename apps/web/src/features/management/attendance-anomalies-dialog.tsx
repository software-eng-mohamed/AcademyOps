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
import { useInfiniteQuery } from '@tanstack/react-query';

import { readAttendanceAnomalies } from '@/api/management/attendance';
import { managementKey } from '@/api/management/queries';
import { Button } from '@/components/base/buttons/button';

import styles from '@/features/academy/academy-form-styles';
import { AcademyTable } from '@/features/academy/academy-table';
import { ErrorNotice, formatAcademyDateTime } from '@/features/academy/academy-ui';

import { getAcademyCopy } from '@/i18n/academy-copy';
import { managementText } from '@/i18n/management-copy';
import { operationsText } from '@/i18n/operations-copy';
import type { Locale } from '@/lib/locales';
export function AttendanceAnomalies({
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
  const copy = getAcademyCopy(locale);
  const query = useInfiniteQuery({
    queryKey: [...managementKey(userId), 'anomalies', id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => readAttendanceAnomalies(id, pageParam, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
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
            <ModalTitle>{operationsText(locale, 'anomalies')}</ModalTitle>
            <ModalDescription>{operationsText(locale, 'anomaliesHint')}</ModalDescription>
          </div>
          <ModalCloseButton aria-label={copy.close} />
        </ModalHeader>
        <ModalBody>
          {query.isPending ? (
            <p role="status">{copy.loading}</p>
          ) : query.isError ? (
            <ErrorNotice error={query.error} copy={copy} retry={() => void query.refetch()} />
          ) : rows.length ? (
            <AcademyTable
              label={operationsText(locale, 'anomalies')}
              rows={rows}
              busy={query.isFetching}
              columns={[
                {
                  id: 'reason',
                  header: managementText(locale, 'reason'),
                  cell: (row) => managementText(locale, row.reasonCode),
                },
                {
                  id: 'at',
                  header: managementText(locale, 'occurredAt'),
                  cell: (row) => formatAcademyDateTime(row.occurredAt, locale, copy.none),
                },
              ]}
            />
          ) : (
            <p>{copy.empty}</p>
          )}
          {query.hasNextPage ? (
            <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              {copy.next}
            </Button>
          ) : null}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
