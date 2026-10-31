import { chmod, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { userInfo } from 'node:os';
import {
  E2E_FIXTURE_MARKER,
  E2E_ORGANIZATION_CODE,
  E2E_ORGANIZATION_NAME,
  LOAD_ARTIFACT_MARKER,
  type LoadRole,
} from './constants';

export interface ArtifactSession {
  role: LoadRole;
  syntheticSubjectId: string;
  enrollmentId?: string;
  expiresAt: string;
  cookies: Record<string, string>;
}

export interface RunnerArtifact {
  marker: string;
  fixtureMarker: string;
  revision: string;
  organization: { code: string; name: string };
  targetOrigin: string;
  runner: { index: number; count: number };
  targets: { attendanceSessionId: string };
  sessions: ArtifactSession[];
}

export const ARTIFACT_DIRECTORY = resolve(__dirname, '../../../../test-results/load');

export function artifactPath(runnerIndex: number): string {
  return resolve(ARTIFACT_DIRECTORY, `sessions-r${runnerIndex}.json`);
}

export async function writeArtifacts(
  runnerCount: number,
  targetOrigin: string,
  revision: string,
  attendanceSessionId: string,
  sessions: Array<ArtifactSession & { runnerIndex: number }>,
): Promise<void> {
  await mkdir(ARTIFACT_DIRECTORY, { recursive: true });
  for (let runnerIndex = 0; runnerIndex < runnerCount; runnerIndex += 1) {
    const artifact: RunnerArtifact = {
      marker: LOAD_ARTIFACT_MARKER,
      fixtureMarker: E2E_FIXTURE_MARKER,
      revision,
      organization: { code: E2E_ORGANIZATION_CODE, name: E2E_ORGANIZATION_NAME },
      targetOrigin,
      runner: { index: runnerIndex, count: runnerCount },
      targets: { attendanceSessionId },
      sessions: sessions
        .filter((session) => session.runnerIndex === runnerIndex)
        .map((session) => ({
          role: session.role,
          syntheticSubjectId: session.syntheticSubjectId,
          ...(session.enrollmentId ? { enrollmentId: session.enrollmentId } : {}),
          expiresAt: session.expiresAt,
          cookies: session.cookies,
        })),
    };
    const path = artifactPath(runnerIndex);
    await writeFile(path, `${JSON.stringify(artifact)}\n`, { encoding: 'utf8', mode: 0o600 });
    await chmod(path, 0o600);
    if (process.platform === 'win32') {
      const owner = userInfo().username;
      execFileSync('icacls.exe', [path, '/inheritance:r', '/grant:r', `${owner}:(F)`], {
        stdio: 'ignore',
      });
    }
  }
}

export async function readArtifact(runnerIndex: number): Promise<RunnerArtifact> {
  return JSON.parse(await readFile(artifactPath(runnerIndex), 'utf8')) as RunnerArtifact;
}

export async function removeArtifacts(): Promise<void> {
  const names = await readdir(ARTIFACT_DIRECTORY).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const name of names) {
    if (/^sessions-r\d+\.json$/.test(name)) await unlink(resolve(ARTIFACT_DIRECTORY, name));
  }
}
