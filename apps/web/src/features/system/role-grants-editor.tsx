'use client';

import { useMemo, useState } from 'react';
import type { PermissionGrantDto } from '@/api/generated/models/permissionGrantDto';
import { PermissionGrantDtoPermissionCode } from '@/api/generated/models/permissionGrantDtoPermissionCode';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { systemText } from '@/i18n/system-copy';
import type { Locale } from '@/lib/locales';
import {
  getPermissionCategory,
  getPermissionTitle,
  PERMISSION_CATEGORIES,
} from './permissions-catalog';

export function RoleGrantsEditor({
  grants,
  onChange,
  user,
  locale,
}: {
  grants: PermissionGrantDto[];
  onChange: (grants: PermissionGrantDto[]) => void;
  user: DashboardUser;
  locale: Locale;
}) {
  const isAr = locale === 'ar';
  const known = useMemo(() => new Set<string>(Object.values(PermissionGrantDtoPermissionCode)), []);
  const allowed = useMemo(
    () => user.permissions.filter((item) => known.has(item.code)),
    [user.permissions, known],
  );

  const [activeCategory, setActiveCategory] = useState('students');
  const [search, setSearch] = useState('');

  const grantedMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of grants) map.set(g.permissionCode, g.scope);
    return map;
  }, [grants]);

  const categorizedItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result: Record<string, typeof allowed> = {};
    for (const cat of PERMISSION_CATEGORIES) result[cat.id] = [];
    for (const item of allowed) {
      const cat = getPermissionCategory(item.code);
      const title = getPermissionTitle(item.code, locale).toLowerCase();
      if (!query || item.code.toLowerCase().includes(query) || title.includes(query)) {
        if (!result[cat]) result[cat] = [];
        result[cat].push(item);
      }
    }
    return result;
  }, [allowed, search, locale]);

  const resolveScope = (itemScopes: readonly unknown[] = []) => {
    const stringScopes = itemScopes.map(String);
    if (stringScopes.includes('O')) return 'O';
    return stringScopes[0] ?? 'O';
  };

  const toggleGrant = (code: string) => {
    if (grantedMap.has(code)) {
      onChange(grants.filter((g) => g.permissionCode !== code));
    } else {
      const target = allowed.find((i) => i.code === code);
      const existingScope = grantedMap.get(code);
      const scopeToUse = existingScope ?? (target ? resolveScope(target.scopes) : 'O');
      onChange([
        ...grants,
        {
          permissionCode: code as PermissionGrantDto['permissionCode'],
          scope: scopeToUse as PermissionGrantDto['scope'],
        },
      ]);
    }
  };

  const currentItems = categorizedItems[activeCategory] ?? [];
  const currentGranted = currentItems.filter((i) => grantedMap.has(i.code)).length;
  const isAllSelected = currentItems.length > 0 && currentGranted === currentItems.length;

  const toggleCategoryAll = () => {
    if (isAllSelected) {
      const remove = new Set(currentItems.map((i) => i.code));
      onChange(grants.filter((g) => !remove.has(g.permissionCode)));
    } else {
      const next = [...grants];
      for (const item of currentItems) {
        if (!grantedMap.has(item.code)) {
          next.push({
            permissionCode: item.code as PermissionGrantDto['permissionCode'],
            scope: resolveScope(item.scopes) as PermissionGrantDto['scope'],
          });
        }
      }
      onChange(next);
    }
  };

  return (
    <div className="grid min-w-0 gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-secondary pb-3">
        <span className="text-sm font-semibold text-text-primary">
          {systemText(locale, 'replaceGrants')}
        </span>
        <span className="rounded-full bg-accent-500/10 px-2.5 py-0.5 text-xs font-semibold text-accent-500">
          {isAr ? `${grants.length} صلاحية مفعّلة` : `${grants.length} granted`}
        </span>
      </div>

      <div>
        <label
          htmlFor="perm-search"
          className="mb-1.5 block text-xs font-semibold text-text-secondary"
        >
          {isAr ? 'بحث سريع في الصلاحيات' : 'Quick search permissions'}
        </label>
        <Input
          id="perm-search"
          type="search"
          value={search}
          onChange={setSearch}
          placeholder={isAr ? 'ابحث بالاسم أو الكود...' : 'Search by name or code...'}
          fieldClassName="h-10 border border-border-button-default bg-background-primary-default"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
        {PERMISSION_CATEGORIES.map((cat) => {
          const catTotal = allowed.filter((i) => getPermissionCategory(i.code) === cat.id).length;
          if (!catTotal) return null;
          const catActive = allowed
            .filter((i) => getPermissionCategory(i.code) === cat.id)
            .filter((i) => grantedMap.has(i.code)).length;
          const isCurrent = activeCategory === cat.id;

          return (
            <button
              type="button"
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                isCurrent
                  ? 'bg-accent-600 text-white shadow-xs font-semibold'
                  : 'border border-border-secondary bg-background-secondary-default text-text-secondary hover:text-text-primary'
              }`}
            >
              <span>{isAr ? cat.name.ar : cat.name.en}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  isCurrent
                    ? 'bg-white/20 text-white'
                    : 'bg-background-primary-default text-text-tertiary'
                }`}
              >
                {catActive}/{catTotal}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border-secondary/60 py-2">
        <Button
          type="button"
          variant="secondary"
          size="small"
          onClick={toggleCategoryAll}
          disabled={!currentItems.length}
        >
          {isAllSelected
            ? isAr
              ? 'إلغاء تحديد هذا القسم'
              : 'Deselect category'
            : isAr
              ? 'تحديد كل صلاحيات هذا القسم'
              : 'Select all in category'}
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="small"
            onClick={() =>
              onChange(
                allowed.map((item) => ({
                  permissionCode: item.code as PermissionGrantDto['permissionCode'],
                  scope: resolveScope(item.scopes) as PermissionGrantDto['scope'],
                })),
              )
            }
          >
            {isAr ? 'تحديد الكل' : 'Select all'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="small"
            onClick={() => onChange([])}
            disabled={!grants.length}
          >
            {isAr ? 'مسح التحديد' : 'Clear all'}
          </Button>
        </div>
      </div>

      <div className="grid max-h-60 gap-2 overflow-y-auto pr-1 plg-scrollbar">
        {currentItems.length ? (
          currentItems.map((item) => {
            const isChecked = grantedMap.has(item.code);
            return (
              <div
                key={item.code}
                className={`flex items-start justify-between gap-3 rounded-xl border p-2.5 transition-colors ${
                  isChecked
                    ? 'border-accent-500/40 bg-accent-500/5 shadow-2xs'
                    : 'border-border-secondary hover:bg-background-secondary-default/50'
                }`}
              >
                <Checkbox
                  isSelected={isChecked}
                  onChange={() => toggleGrant(item.code)}
                  className="flex-1 items-start gap-2.5 min-w-0 cursor-pointer"
                >
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold text-text-primary">
                      {getPermissionTitle(item.code, locale)}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] text-text-tertiary [overflow-wrap:anywhere]">
                      {item.code}
                    </span>
                  </div>
                </Checkbox>
              </div>
            );
          })
        ) : (
          <p className="py-6 text-center text-xs text-text-secondary">
            {isAr ? 'لا توجد صلاحيات مطابقة للبحث' : 'No matching permissions'}
          </p>
        )}
      </div>

      {grants.length ? (
        <div className="mt-1 border-t border-border-secondary pt-2.5">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-text-secondary">
            <span>{isAr ? 'الصلاحيات المحددة حالياً:' : 'Active granted permissions:'}</span>
            <span>{grants.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto plg-scrollbar">
            {grants.map((grant) => (
              <span
                key={grant.permissionCode}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-secondary bg-background-secondary-default px-2.5 py-1 text-xs text-text-primary transition-colors hover:border-accent-500/30"
              >
                <span className="font-medium">
                  {getPermissionTitle(grant.permissionCode, locale)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      grants.filter((entry) => entry.permissionCode !== grant.permissionCode),
                    )
                  }
                  className="ms-1 text-text-tertiary hover:text-red-500 text-sm font-bold cursor-pointer"
                  aria-label={`${systemText(locale, 'remove')}: ${grant.permissionCode}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const GrantEditor = RoleGrantsEditor;
