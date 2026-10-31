'use client';

import { useCallback, useEffect, useState } from 'react';

export type ViewMode = 'table' | 'grid';

export const DEFAULT_VIEW_MODE: ViewMode = 'table';
export const VIEW_PREFERENCE_KEY = 'plg:view-preference:v1';
export const VIEW_PREFERENCE_COOKIE = 'plg_view_preference';
const VIEW_PREFERENCE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function parseViewMode(value: unknown): ViewMode | null {
  if (value === 'table' || value === 'grid') return value;
  return null;
}

export function loadViewPreference(): ViewMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(VIEW_PREFERENCE_KEY);
    return parseViewMode(stored);
  } catch {
    return null;
  }
}

export function saveViewPreference(mode: ViewMode) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VIEW_PREFERENCE_KEY, mode);
  } catch {
    // Local storage is a best-effort compatibility copy.
  }
  try {
    // biome-ignore lint/suspicious/noDocumentCookie: cookie allows sharing non-sensitive UI preference.
    document.cookie = `${VIEW_PREFERENCE_COOKIE}=${mode}; Path=/; Max-Age=${VIEW_PREFERENCE_MAX_AGE_SECONDS}; SameSite=Lax`;
  } catch {
    // Cookie storage may be disabled.
  }
}

export function resolveViewMode(
  paramValue: string | null | undefined,
  storedPreference?: ViewMode | null,
): ViewMode {
  const fromParam = parseViewMode(paramValue);
  if (fromParam) return fromParam;
  if (storedPreference) return storedPreference;
  return DEFAULT_VIEW_MODE;
}

export function useViewMode(
  paramValue: string | null | undefined,
): [ViewMode, (mode: ViewMode) => void] {
  const [storedPreference, setStoredPreference] = useState<ViewMode | null>(null);

  useEffect(() => {
    setStoredPreference(loadViewPreference());
    const onStorage = (event: StorageEvent) => {
      if (event.key === VIEW_PREFERENCE_KEY) {
        setStoredPreference(parseViewMode(event.newValue));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const parsedParam = parseViewMode(paramValue);
  const view: ViewMode = parsedParam ?? storedPreference ?? DEFAULT_VIEW_MODE;

  const setView = useCallback((mode: ViewMode) => {
    saveViewPreference(mode);
    setStoredPreference(mode);
  }, []);

  return [view, setView];
}
