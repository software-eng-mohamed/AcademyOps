import { test as base, expect } from '@playwright/test';
import { collectEvidence } from './evidence';

export const test = base.extend<{ evidence: void }>({
  evidence: [
    async ({ page }, use, testInfo) => collectEvidence(page, testInfo, async () => use()),
    { auto: true },
  ],
});

export { expect };
