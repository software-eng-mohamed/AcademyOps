import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const shell = [
  process.env.PLG_TEST_POSIX_SHELL,
  'sh',
  ...(process.platform === 'win32'
    ? ['C:\\Program Files\\Git\\bin\\sh.exe', 'C:\\Program Files\\Git\\usr\\bin\\sh.exe']
    : []),
]
  .filter((candidate): candidate is string => Boolean(candidate))
  .find((candidate) => spawnSync(candidate, ['-c', 'exit 0']).status === 0);

const executable = (path: string, body: string): void => {
  writeFileSync(path, body);
  chmodSync(path, 0o700);
};

const withFixture = (name: string, run: (fixture: string) => void): void => {
  const fixture = mkdtempSync(resolve(tmpdir(), `${name}-`));
  try {
    run(fixture);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
};

const runBackup = (failure = '') => {
  let result!: SpawnSyncReturns<string>;
  let backupPath = '';
  let publishedBackup = false;
  withFixture('plg-stage34-backup', (fixture) => {
    const scripts = resolve(fixture, 'scripts');
    const bin = resolve(fixture, 'bin');
    mkdirSync(scripts);
    mkdirSync(bin);
    copyFileSync(
      resolve(root, 'deploy/vps/scripts/backup-postgres.sh'),
      resolve(scripts, 'backup-postgres.sh'),
    );
    writeFileSync(resolve(fixture, 'runtime.env'), 'POSTGRES_DB=plg_stage34\n');
    executable(
      resolve(bin, 'docker'),
      `#!/bin/sh
printf '%s\n' "$*" >> "$INVOCATION_LOG"
case "$*" in
  *"run --rm --no-deps -T"*"backup-tool"*)
    [ "$STAGE34_FAILURE" = dump ] && exit 91
    [ "$STAGE34_FAILURE" = validation ] && exit 92
    dd if=/dev/zero bs=1048576 count=2 2>/dev/null
    ;;
  *"exec -T postgres sh -ceu"*)
    dd if=/dev/zero bs=1048576 count=2 2>/dev/null
    [ "$STAGE34_FAILURE" = dump ] && exit 23
    ;;
  *"exec -T postgres pg_restore --list"*)
    [ "$STAGE34_FAILURE" = validation ] && exit 25
    ;;
  *"cp "*) : ;;
  *"exec -T postgres rm -f"*) : ;;
  *"exec -T postgres printenv POSTGRES_DB"*) printf 'plg_stage34\n' ;;
esac
exit 0
`,
    );
    executable(
      resolve(bin, 'age'),
      `#!/bin/sh
[ "$STAGE34_FAILURE" = encryption ] && exit 27
output=''
input=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output=$2; shift 2 ;;
    --recipient) shift 2 ;;
    --encrypt) shift ;;
    *) input=$1; shift ;;
  esac
done
if [ -n "$input" ]; then cp "$input" "$output"; else cat > "$output"; fi
`,
    );
    result = spawnSync(shell!, [resolve(scripts, 'backup-postgres.sh'), '--local-only'], {
      env: {
        ...process.env,
        BACKUP_AGE_RECIPIENT: 'age1stage34fixture',
        INVOCATION_LOG: resolve(fixture, 'invocations.log'),
        PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
        STAGE34_FAILURE: failure,
      },
      encoding: 'utf8',
    });
    backupPath = result.stdout.trim();
    const backupName = backupPath.split(/[\\/]/).at(-1) ?? '';
    const actualBackup = resolve(fixture, 'backups', backupName);
    publishedBackup = Boolean(backupName) && existsSync(actualBackup);
    if (!failure) {
      expect(result.stderr).toBe('');
      expect(statSync(actualBackup).size).toBe(2 * 1024 * 1024);
      const metadata = readFileSync(`${actualBackup}.metadata`, 'utf8');
      expect(metadata).toContain('archive_bytes=2097152');
      expect(metadata).toMatch(/archive_sha256=[0-9a-f]{64}/);
    }
  });
  return { backupPath, publishedBackup, result };
};

describe.runIf(Boolean(shell))('stage 3 VPS backup and deployment gates', () => {
  it('consumes and encrypts a complete dump larger than one MiB', () => {
    const { result } = runBackup();
    expect(result.status).toBe(0);
  });

  it.each([
    ['dump', 91, 'PostgreSQL dump failed'],
    ['validation', 92, 'PostgreSQL archive validation failed'],
    ['encryption', 27, 'Database dump encryption failed'],
  ])('propagates a failed %s process', (failure, _exitCode, message) => {
    const { backupPath, publishedBackup, result } = runBackup(failure);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
    expect(backupPath).toBe('');
    expect(publishedBackup).toBe(false);
  });

  it('stops a release after migration failure and preserves the running release state', () => {
    withFixture('plg-stage34-deploy', (fixture) => {
      const scripts = resolve(fixture, 'scripts');
      const bin = resolve(fixture, 'bin');
      const invocationLog = resolve(fixture, 'invocations.log');
      const oldState = resolve(fixture, 'old-api.state');
      mkdirSync(scripts);
      mkdirSync(bin);
      copyFileSync(
        resolve(root, 'deploy/vps/scripts/deploy-release.sh'),
        resolve(scripts, 'deploy-release.sh'),
      );
      executable(resolve(scripts, 'preflight.sh'), '#!/bin/sh\nexit 0\n');
      executable(resolve(scripts, 'backup-postgres.sh'), '#!/bin/sh\nexit 0\n');
      writeFileSync(
        resolve(scripts, 'release-common.sh'),
        `release_fail() { echo "release: $*" >&2; exit 1; }
verify_release_manifest() { release_tag=${'a'.repeat(40)}; migration_policy=expand-only; }
verify_installed_release_images() { :; }
deployment_config_sha() { printf 'fixture-config\n'; }
manifest_value() { printf 'fixture-config\n'; }
wait_service_healthy() { :; }
runtime_value() { printf 'http://127.0.0.1.invalid\n'; }
persist_runtime_image_tag() { printf 'mutated\n' > "$OLD_API_STATE"; }
`,
      );
      executable(
        resolve(bin, 'docker'),
        `#!/bin/sh
printf '%s\n' "$*" >> "$INVOCATION_LOG"
case "$*" in
  *"run --rm migrate"*) exit 23 ;;
  *" api-a"*|*" api-b"*) printf 'new-api-started\n' > "$OLD_API_STATE" ;;
esac
exit 0
`,
      );
      executable(resolve(bin, 'curl'), '#!/bin/sh\nexit 0\n');
      writeFileSync(resolve(fixture, 'runtime.env'), 'IMAGE_TAG=old-release\n');
      writeFileSync(resolve(fixture, 'release.manifest'), 'fixture\n');
      writeFileSync(resolve(fixture, 'release.manifest.sig'), 'fixture\n');
      writeFileSync(oldState, 'running-old-release\n');

      const result = spawnSync(
        shell!,
        [resolve(scripts, 'deploy-release.sh'), resolve(fixture, 'release.manifest')],
        {
          env: {
            ...process.env,
            INVOCATION_LOG: invocationLog,
            OLD_API_STATE: oldState,
            PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
          },
          encoding: 'utf8',
        },
      );
      const invocations = readFileSync(invocationLog, 'utf8');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('database migration failed');
      expect(invocations).toContain('run --rm migrate');
      expect(invocations).not.toMatch(/api-a|api-b/);
      expect(readFileSync(oldState, 'utf8')).toBe('running-old-release\n');
      expect(readFileSync(resolve(fixture, 'runtime.env'), 'utf8')).toBe('IMAGE_TAG=old-release\n');
      expect(existsSync(resolve(fixture, 'runtime/releases/current.manifest'))).toBe(false);
    });
  });
});
