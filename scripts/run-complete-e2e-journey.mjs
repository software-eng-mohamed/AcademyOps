// Records existing synthetic fixture views. Mutation acceptance lives in tests/e2e.
// No .env loading, direct database writes, or credentials embedded in the recorder.
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  assertSyntheticOrganization,
  journeyConfig,
  JourneySafetyError,
  readFixtureCredentials,
  syntheticTenant,
} from './journey-config.mjs';
import {
  authenticateFixture,
  copyJourneyArtifact,
  finalizeJourneyVideo,
} from './journey-helpers.mjs';

let stage = 'configuration';

async function recordRole(
  browser,
  expect,
  configuration,
  outputDirectory,
  organizationId,
  role,
  account,
) {
  stage = `authenticate ${role}`;
  const context = await browser.newContext({
    baseURL: configuration.baseUrl,
    viewport: { width: 1440, height: 1000 },
    locale: configuration.locale === 'ar' ? 'ar-EG' : 'en-GB',
    recordVideo: { dir: join(outputDirectory, 'video'), size: { width: 1440, height: 1000 } },
  });
  const page = await context.newPage();
  const video = page.video();
  const captures = [];
  const routes =
    role === 'owner'
      ? [
          ['dashboard', '/dashboard'],
          ['students', '/students'],
          ['cohorts', '/academic/cohorts'],
          ['sessions', '/sessions'],
          ['attendance', '/attendance'],
        ]
      : [['student', '/dashboard']];
  try {
    await authenticateFixture(page, account, configuration, organizationId);
    for (const [label, path] of routes) {
      stage = `capture ${role}/${label}`;
      const route = `/${configuration.locale}${path}`;
      const response = await page.goto(route, { waitUntil: 'networkidle' });
      expect(response?.status(), `${label} must render successfully`).toBe(200);
      expect(new URL(page.url()).origin, 'navigation must remain on the local web origin').toBe(
        configuration.baseUrl,
      );
      expect(new URL(page.url()).pathname, 'fixture route must not redirect to login').toBe(route);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('status', { name: 'Loading dashboard' })).toHaveCount(0);
      await expect(page.getByRole('main').locator('[aria-busy="true"]')).toHaveCount(0);
      const screenshot = join(outputDirectory, `${role}-${label}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      copyJourneyArtifact(screenshot, configuration.artifactDirectory);
      captures.push({ role, route, screenshot: basename(screenshot), data: 'synthetic fixture' });
      console.log(`Recorded synthetic ${role}/${label} view.`);
    }
  } finally {
    await context.close();
  }
  await finalizeJourneyVideo(
    video,
    join(outputDirectory, `${role}-journey.webm`),
    configuration.artifactDirectory,
  );
  return captures;
}

async function main() {
  const configuration = journeyConfig();
  const accounts = readFixtureCredentials(configuration.credentialsFile);
  // Resolve the workspace dependency through its owning package, never a pnpm store path.
  const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
  const { PrismaClient } = apiRequire('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: configuration.databaseUrl } } });
  let browser;
  try {
    stage = 'verify synthetic database';
    const organization = await prisma.organization.findUnique({
      where: { code: syntheticTenant.code },
      select: { id: true, code: true, name: true },
    });
    assertSyntheticOrganization(organization);
    const { chromium, expect } = await import('@playwright/test');
    mkdirSync(configuration.outputDirectory, { recursive: true });
    const outputDirectory = mkdtempSync(join(configuration.outputDirectory, 'run-'));
    if (configuration.artifactDirectory) {
      configuration.artifactDirectory = join(
        configuration.artifactDirectory,
        basename(outputDirectory),
      );
    }
    browser = await chromium.launch({ headless: true });
    const captures = [];
    for (const role of ['owner', 'student']) {
      captures.push(
        ...(await recordRole(
          browser,
          expect,
          configuration,
          outputDirectory,
          organization.id,
          role,
          accounts[role],
        )),
      );
    }
    writeFileSync(
      join(outputDirectory, 'manifest.json'),
      JSON.stringify(
        {
          purpose: 'Synthetic fixture navigation and visual recording; not mutation acceptance.',
          captures,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`Recorded ${captures.length} synthetic views in ${outputDirectory}.`);
    console.log('Run the maintained browser and integration suites for workflow acceptance.');
  } finally {
    try {
      await browser?.close();
    } finally {
      await prisma.$disconnect();
    }
  }
}

main().catch((error) => {
  // Database/Playwright errors may include connection or request details. Never print raw errors.
  const detail =
    error instanceof JourneySafetyError
      ? error.message
      : 'Check the local services and fixture setup.';
  console.error(`Journey recording stopped during ${stage}. ${detail}`);
  process.exitCode = 1;
});
