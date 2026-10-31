'use client';

import { Field } from '@academyops/ui';
import { Button } from '@academyops/ui/registry';
import { supportsSearch } from '@/api/academy/models';
import { Select, SelectItem } from '@/components/base/select/select';
import { academyLabel } from '@/i18n/academy-copy';
import { AcademyToolbar } from './academy-workspace';
import { RemoteSelect } from './remote-select';

import type { AcademyPageModel } from './use-academy-page';

export function AcademyPageToolbar({ model }: { model: AcademyPageModel }) {
  const { user, copy, params, resource, search, setSearch, cursor, view, updateParams, statuses } =
    model;
  return (
    <AcademyToolbar
      copy={copy}
      view={view}
      onViewChange={(value) => updateParams({ view: value })}
      {...(supportsSearch(resource)
        ? {
            search: {
              value: search,
              onChange: setSearch,
              onSubmit: () => updateParams({ search: search.trim() || undefined }, true),
            },
          }
        : {})}
      filters={
        <>
          {statuses ? (
            <Field htmlFor="academy-status-filter" label={copy.selectStatus}>
              <Select
                aria-label={copy.selectStatus}
                triggerId="academy-status-filter"
                className="w-40"
                triggerClassName="h-10"
                selectedKey={params.get('status') || '__all'}
                placeholder={copy.allStatuses}
                renderValue={
                  params.get('status')
                    ? resource === 'cohorts' && params.get('status') === 'PLANNED'
                      ? copy.intakeOpen
                      : academyLabel(copy, params.get('status') ?? '')
                    : copy.allStatuses
                }
                onSelectionChange={(value) =>
                  updateParams(
                    {
                      status: value === '__all' || value === null ? undefined : String(value),
                    },
                    true,
                  )
                }
              >
                <SelectItem id="__all" textValue={copy.allStatuses}>
                  {copy.allStatuses}
                </SelectItem>
                {statuses.map((value) => (
                  <SelectItem
                    key={value}
                    id={value}
                    textValue={
                      resource === 'cohorts' && value === 'PLANNED'
                        ? copy.intakeOpen
                        : academyLabel(copy, value)
                    }
                  >
                    {resource === 'cohorts' && value === 'PLANNED'
                      ? copy.intakeOpen
                      : academyLabel(copy, value)}
                  </SelectItem>
                ))}
              </Select>
            </Field>
          ) : null}
          {resource === 'enrollments' ? (
            <RemoteSelect
              id="academy-student-filter"
              label={copy.selectStudent}
              kind="students"
              value={params.get('studentId') ?? ''}
              onChange={(value) => updateParams({ studentId: value || undefined }, true)}
              copy={copy}
              userId={user.id}
            />
          ) : null}
          {params.get('search') || params.get('status') || params.get('studentId') || cursor ? (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => {
                setSearch('');
                updateParams({ search: undefined, status: undefined, studentId: undefined }, true);
              }}
            >
              {copy.reset}
            </Button>
          ) : null}
        </>
      }
    />
  );
}
