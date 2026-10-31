import type {
  DashboardNavigationGroup,
  DashboardNavigationKey,
  KnownRoleCode,
} from '@/features/dashboard/navigation';
import type { Locale } from '@/lib/locales';
import { ar } from './app-copy.ar';
import { en } from './app-copy.en';

type FoundationCopy = { description: string; title: string };

export type AppCopy = {
  brand: string;
  dashboard: {
    description: string;
    eyebrow: string;
    foundations: [FoundationCopy, FoundationCopy, FoundationCopy, FoundationCopy];
    foundationsLabel: string;
    nextDescription: string;
    nextSuggestion: string;
    nextTitle: string;
    status: string;
    title: string;
  };
  error: {
    action: string;
    description: string;
    eyebrow: string;
    globalAction: string;
    globalTitle: string;
    title: string;
    backHome?: string;
    contactSupport?: string;
    errorCode?: string;
  };
  loading: string;
  metadataDescription: string;
  notFound: {
    action: string;
    title: string;
    description?: string;
    hint?: string;
    backHome?: string;
    loginAction?: string;
  };
  pageSettings: string;
  shell: {
    accountMenu: string;
    allBranches: string;
    appearance: string;
    branch: string;
    closeNavigation: string;
    collapseNavigation: string;
    comingSoon: string;
    expandNavigation: string;
    language: string;
    logout: string;
    logoutError: string;
    logoutErrorDescription: string;
    loggingOut: string;
    navigation: Record<DashboardNavigationKey, string>;
    navigationGroups: Record<DashboardNavigationGroup, string>;
    navigationLabel: string;
    noNavigationResults: string;
    noRole: string;
    openNavigation: string;
    productSubtitle: string;
    roleLabels: Record<KnownRoleCode, string>;
    searchNavigation: string;
    skipToContent: string;
    subtitle: string;
    switchToDarkTheme: string;
    switchToLightTheme: string;
    title: string;
  };
  switchLanguage: string;
};

export function getAppCopy(locale: Locale): AppCopy {
  return locale === 'ar' ? ar : en;
}
