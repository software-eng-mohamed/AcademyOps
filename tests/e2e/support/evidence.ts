import type { Page, TestInfo } from '@playwright/test';

type Evidence = {
  api: Array<{ method: string; path: string; status: number; correlationId?: string }>;
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: Array<{ method: string; path: string; error?: string }>;
};

function safePath(rawUrl: string): string {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return '[invalid-url]';
  }
}

export function redactEvidenceText(value: string): string {
  return value
    .replace(/(bearer|password|cookie|token|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[redacted-email]')
    .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, '[redacted-id]')
    .replace(/(?:\+?\d[\d\s().-]{8,}\d)/g, '[redacted-phone]')
    .slice(0, 500);
}

export async function collectEvidence(
  page: Page,
  testInfo: TestInfo,
  run: () => Promise<void>,
): Promise<void> {
  const evidence: Evidence = { api: [], consoleErrors: [], pageErrors: [], requestFailures: [] };
  page.on('response', (response) => {
    const request = response.request();
    if (!safePath(response.url()).startsWith('/api/v1/')) return;
    const method = request.method();
    if (method === 'GET' && response.status() < 400) return;
    const correlationId = response.headers()['x-correlation-id'];
    evidence.api.push({
      method,
      path: safePath(response.url()),
      status: response.status(),
      ...(correlationId ? { correlationId } : {}),
    });
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      evidence.consoleErrors.push(redactEvidenceText(message.text()));
    }
  });
  page.on('pageerror', (error) => evidence.pageErrors.push(redactEvidenceText(error.message)));
  page.on('requestfailed', (request) => {
    evidence.requestFailures.push({
      method: request.method(),
      path: safePath(request.url()),
      error: redactEvidenceText(request.failure()?.errorText ?? 'unknown'),
    });
  });
  try {
    await run();
  } finally {
    if (
      evidence.api.length ||
      evidence.consoleErrors.length ||
      evidence.pageErrors.length ||
      evidence.requestFailures.length
    ) {
      await testInfo.attach('browser-api-evidence.json', {
        body: Buffer.from(JSON.stringify(evidence, null, 2)),
        contentType: 'application/json',
      });
    }
  }
}
