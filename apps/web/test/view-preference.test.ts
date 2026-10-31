import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW_MODE,
  loadViewPreference,
  parseViewMode,
  resolveViewMode,
  saveViewPreference,
  useViewMode,
  VIEW_PREFERENCE_COOKIE,
  VIEW_PREFERENCE_KEY,
} from '@/features/dashboard/view-preference';

beforeEach(() => {
  window.localStorage.clear();
  // biome-ignore lint/suspicious/noDocumentCookie: test resets the UI preference cookie
  document.cookie = `${VIEW_PREFERENCE_COOKIE}=; Path=/; Max-Age=0`;
});

afterEach(() => {
  window.localStorage.clear();
  // biome-ignore lint/suspicious/noDocumentCookie: test resets the UI preference cookie
  document.cookie = `${VIEW_PREFERENCE_COOKIE}=; Path=/; Max-Age=0`;
});

describe('view preference persistence and default resolution', () => {
  it('defines table as the default view mode', () => {
    expect(DEFAULT_VIEW_MODE).toBe('table');
  });

  it('parses valid view modes and ignores invalid ones', () => {
    expect(parseViewMode('table')).toBe('table');
    expect(parseViewMode('grid')).toBe('grid');
    expect(parseViewMode('list')).toBeNull();
    expect(parseViewMode('')).toBeNull();
    expect(parseViewMode(null)).toBeNull();
    expect(parseViewMode(undefined)).toBeNull();
    expect(parseViewMode(123)).toBeNull();
  });

  it('loads and saves preferences to localStorage and cookies', () => {
    expect(loadViewPreference()).toBeNull();

    saveViewPreference('grid');
    expect(window.localStorage.getItem(VIEW_PREFERENCE_KEY)).toBe('grid');
    expect(document.cookie).toContain(`${VIEW_PREFERENCE_COOKIE}=grid`);
    expect(loadViewPreference()).toBe('grid');

    saveViewPreference('table');
    expect(window.localStorage.getItem(VIEW_PREFERENCE_KEY)).toBe('table');
    expect(document.cookie).toContain(`${VIEW_PREFERENCE_COOKIE}=table`);
    expect(loadViewPreference()).toBe('table');
  });

  it('resolves view mode prioritizing URL params over stored preference and defaults to table', () => {
    // 1. Neither param nor stored preference -> default table
    expect(resolveViewMode(null)).toBe('table');
    expect(resolveViewMode(undefined)).toBe('table');
    expect(resolveViewMode('invalid')).toBe('table');

    // 2. Stored preference exists, no param -> uses stored preference
    expect(resolveViewMode(null, 'grid')).toBe('grid');
    expect(resolveViewMode(undefined, 'table')).toBe('table');

    // 3. URL param is explicit -> param takes precedence over stored preference
    expect(resolveViewMode('grid', 'table')).toBe('grid');
    expect(resolveViewMode('table', 'grid')).toBe('table');
  });

  it('useViewMode hook defaults to table and updates when view is changed', () => {
    const { result } = renderHook(({ param }) => useViewMode(param), {
      initialProps: { param: null as string | null },
    });

    // Default is table
    expect(result.current[0]).toBe('table');

    // Change to grid
    act(() => {
      result.current[1]('grid');
    });

    expect(result.current[0]).toBe('grid');
    expect(window.localStorage.getItem(VIEW_PREFERENCE_KEY)).toBe('grid');
    expect(loadViewPreference()).toBe('grid');

    // Change back to table
    act(() => {
      result.current[1]('table');
    });

    expect(result.current[0]).toBe('table');
    expect(window.localStorage.getItem(VIEW_PREFERENCE_KEY)).toBe('table');
    expect(loadViewPreference()).toBe('table');
  });

  it('useViewMode initializes with stored preference when no param is in URL', () => {
    saveViewPreference('grid');

    const { result } = renderHook(() => useViewMode(null));

    expect(result.current[0]).toBe('grid');
  });

  it('useViewMode prioritizes explicit URL param over stored preference', () => {
    saveViewPreference('grid');

    const { result } = renderHook(() => useViewMode('table'));

    expect(result.current[0]).toBe('table');
  });

  it('useViewMode syncs across tabs via window storage event', () => {
    const { result } = renderHook(() => useViewMode(null));
    expect(result.current[0]).toBe('table');

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: VIEW_PREFERENCE_KEY,
          newValue: 'grid',
        }),
      );
    });

    expect(result.current[0]).toBe('grid');
  });
});
