import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const posixShell = [
  process.env.PLG_TEST_POSIX_SHELL,
  'sh',
  ...(process.platform === 'win32'
    ? ['C:\\Program Files\\Git\\bin\\sh.exe', 'C:\\Program Files\\Git\\usr\\bin\\sh.exe']
    : []),
].find((candidate) => candidate && spawnSync(candidate, ['-c', 'exit 0']).status === 0);

const maliciousRestoreTargets = [
  'plg_restore_',
  'plg_restore_a"',
  "plg_restore_a'",
  'plg_restore_a space',
  'plg_restore_a;SELECT_1',
  'plg_restore_a\nDROP_DATABASE',
  'plg_restore_a$(id)',
  'plg_restore_a`id`',
  `plg_restore_${'a'.repeat(52)}`,
];

const runRejectedRestore = (target: string): { invoked: boolean; status: number | null } => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'plg-restore-rejection-'));
  try {
    const scripts = resolve(fixture, 'scripts');
    const backups = resolve(fixture, 'backups');
    const bin = resolve(fixture, 'bin');
    const invocationLog = resolve(fixture, 'invocations.log');
    mkdirSync(scripts);
    mkdirSync(backups);
    mkdirSync(bin);
    copyFileSync(
      resolve(root, 'deploy/vps/scripts/restore-postgres.sh'),
      resolve(scripts, 'restore-postgres.sh'),
    );
    const backup = resolve(backups, 'fixture.dump.age');
    writeFileSync(backup, 'not-used');
    writeFileSync(`${backup}.sha256`, `${'0'.repeat(64)}  fixture.dump.age\n`);
    writeFileSync(resolve(fixture, 'runtime.env'), 'POSTGRES_DB=plg\n');
    const identity = resolve(fixture, 'identity');
    writeFileSync(identity, 'not-used');
    for (const command of ['age', 'docker', 'psql', 'sha256sum']) {
      const wrapper = resolve(bin, command);
      writeFileSync(
        wrapper,
        `#!/bin/sh\nprintf '%s\\n' '${command}' >> "$INVOCATION_LOG"\nexit 99\n`,
      );
      chmodSync(wrapper, 0o700);
    }
    const result = spawnSync(
      posixShell!,
      [resolve(scripts, 'restore-postgres.sh'), backup, target, '--execute'],
      {
        env: {
          ...process.env,
          BACKUP_AGE_IDENTITY_FILE: identity,
          INVOCATION_LOG: invocationLog,
          PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
        },
        encoding: 'utf8',
      },
    );
    return {
      invoked: existsSync(invocationLog) && readFileSync(invocationLog, 'utf8').trim().length > 0,
      status: result.status,
    };
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
};

describe('VPS disaster recovery contract', () => {
  it('encrypts, checksums, and verifies the off-host copy', () => {
    const backup = read('deploy/vps/scripts/backup-postgres.sh');
    const retention = read('deploy/vps/scripts/prune-local-backups.sh');
    const retentionTest = read('deploy/vps/scripts/test-backup-retention.sh');

    expect(backup).toContain('BACKUP_AGE_RECIPIENT');
    expect(backup).toContain('BACKUP_RCLONE_DESTINATION');
    expect(backup).toContain('age --encrypt');
    expect(backup).toContain('mkfifo');
    expect(backup).toContain('sha256sum --check --status');
    expect(backup).toContain('rclone copyto');
    expect(backup).toContain('remote_verification');
    expect(backup).toContain('archive_sha256=');
    expect(backup).toContain('--exclude-extension=pg_stat_statements');
    expect(backup).toContain('--local-only');
    expect(backup).toContain('BACKUP_LOCAL_RETENTION_DAYS');
    expect(retention).toContain('[ ! -L "$backup_dir" ]');
    expect(retention).toContain('-mindepth 1 -maxdepth 1 -type f ! -type l');
    expect(retention).toContain("-name 'plg-*.dump.age.metadata'");
    expect(retentionTest).toContain('Symlinked backup directory was not rejected');
    expect(backup).not.toMatch(/set -[a-z]*x/);
  });

  it('restores as the migration owner and proves application-role CRUD', () => {
    const restore = read('deploy/vps/scripts/restore-postgres.sh');

    expect(restore).toContain('--owner=plg_migrate');
    expect(restore).toContain('-U plg_migrate');
    expect(restore).not.toContain('--role=plg_migrate');
    expect(restore).toContain('-e POSTGRES_PASSWORD=');
    expect(restore).toContain('--entrypoint /bin/sh backup-tool');
    expect(restore).toContain('archive=/work/archive.dump');
    expect(restore).not.toContain('mktemp "$backup_dir/.restore.XXXXXX.dump"');
    expect(restore).toContain('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');
    expect(restore).toContain('restored application relation is not owned by plg_migrate');
    expect(restore).toContain('GRANT SELECT, INSERT, UPDATE, DELETE');
    expect(restore).toContain('-U plg_app');
    expect(restore).toContain('SELECT rolsuper FROM pg_roles');
    expect(restore).toContain('INSERT INTO public.:"probe"');
    expect(restore).toContain('UPDATE public.:"probe"');
    expect(restore).toContain('DELETE FROM public.:"probe"');
    expect(restore).toContain('ALTER DATABASE :"target_db"');
    expect(restore).not.toContain('ALTER DATABASE "$1"');
    expect(restore).toContain('dropdb');
  });

  it.runIf(Boolean(posixShell)).each(maliciousRestoreTargets)(
    'rejects unsafe restore target %j before invoking external tools',
    (target) => {
      expect(runRejectedRestore(target)).toEqual({ invoked: false, status: 2 });
    },
  );

  it('provides a disposable encrypted restore drill', () => {
    const drill = read('deploy/vps/scripts/drill-postgres-restore.sh');

    expect(drill).toContain('age-keygen');
    expect(drill).toContain('backup-postgres.sh" --local-only');
    expect(drill).toContain('restore-postgres.sh" "$backup" "$database" --drill');
  });

  it('schedules observable, non-overlapping off-host backups', () => {
    const service = read('deploy/vps/systemd/plg-postgres-backup.service.in');
    const timer = read('deploy/vps/systemd/plg-postgres-backup.timer');
    const installer = read('deploy/vps/scripts/install-backup-schedule.sh');
    const monitoring = read('deploy/vps/compose.monitoring.yml');
    const alerts = read('deploy/vps/prometheus/alerts.yml');

    expect(service).toContain('EnvironmentFile=/etc/plg/backup.env');
    expect(service).toContain('/usr/bin/flock --nonblock');
    expect(service).toContain('ExecStartPost=');
    expect(service).toContain('plg_postgres_backup_last_success_timestamp_seconds');
    expect(service).toContain('NoNewPrivileges=true');
    expect(service).toContain('ProtectSystem=strict');
    expect(timer).toContain('RandomizedDelaySec=45m');
    expect(timer).toContain('Persistent=true');
    expect(installer).toContain('[ "$(stat -c \'%a\' -- "$env_file")" = 600 ]');
    expect(installer).toContain('systemd-analyze verify');
    expect(monitoring).toContain('--collector.textfile.directory=/textfile');
    expect(alerts).toContain('PostgresOffsiteBackupMissing');
    expect(alerts).toContain('PostgresOffsiteBackupStale');
    expect(alerts).toContain('> 108000');
  });
});

describe('immutable VPS release contract', () => {
  it('gates destructive SSH lockdown on a verified second session', () => {
    const bootstrap = read('deploy/vps/scripts/bootstrap-ubuntu-host.sh');

    expect(bootstrap).toContain('Docker repository signing-key fingerprint is unexpected');
    expect(bootstrap).toContain('ufw allow "$ssh_port/tcp"');
    expect(bootstrap).toContain('PLG_LOCKDOWN_ACK=verified-key-only-session');
    expect(bootstrap).toContain('No active TTY login was found');
    expect(bootstrap).toContain('rm -f /etc/ssh/sshd_config.d/60-plg-hardening.conf');
    expect(bootstrap).toContain('cat > /etc/ssh/sshd_config.d/00-plg-hardening.conf');
    expect(bootstrap.indexOf('sshd -t')).toBeLessThan(bootstrap.indexOf('systemctl reload ssh'));
  });

  it('attests source, images, configuration, and migration policy', () => {
    const manifest = read('deploy/vps/scripts/create-release-manifest.sh');
    const common = read('deploy/vps/scripts/release-common.sh');

    expect(manifest).toContain('refusing to attest images from a dirty source tree');
    expect(manifest).toContain('BACKEND_IMAGE_ID=');
    expect(manifest).toContain('WEB_IMAGE_ID=');
    expect(manifest).toContain('OTP_CONNECTOR_IMAGE_ID=');
    expect(manifest).toContain('MIGRATIONS_TREE=');
    expect(manifest).toContain('MIGRATION_POLICY=');
    expect(manifest).toContain('DEPLOYMENT_CONFIG_SHA256=');
    expect(manifest).toContain('org.opencontainers.image.revision');
    expect(common).toContain('[ "${#release_sha}" -eq 40 ]');
    expect(common).toContain('IMAGE_TAG must equal SOURCE_GIT_SHA');
  });

  it('authenticates release inputs before loading images', () => {
    const common = read('deploy/vps/scripts/release-common.sh');
    const bundle = read('deploy/vps/scripts/create-release-bundle.sh');
    const install = read('deploy/vps/scripts/install-release-bundle.sh');
    const rejectionTest = read('deploy/vps/scripts/test-release-authenticity.sh');

    expect(common).toContain('ssh-keygen -Y sign');
    expect(common).toContain('ssh-keygen -Y verify');
    expect(common).toContain('trusted release signers file must be owned by root');
    expect(common).toContain('every trusted signer path directory must be root-owned');
    expect(bundle).toContain('sign_release_file "$archive.sha256"');
    expect(install.indexOf('verify_release_signature "$archive.sha256"')).toBeLessThan(
      install.indexOf('docker image load'),
    );
    expect(rejectionTest).toContain('missing-signature');
    expect(rejectionTest).toContain('tampered-manifest');
    expect(rejectionTest).toContain('mixed-signature');
    expect(rejectionTest).toContain('wrong-key');
    expect(rejectionTest).toContain('unsafe-ancestor');
    expect(rejectionTest).toContain('Docker was invoked before rejecting');
  });

  it('backs up before migration, never builds, and gates release/rollback', () => {
    const deploy = read('deploy/vps/scripts/deploy-release.sh');
    const rollback = read('deploy/vps/scripts/rollback-release.sh');
    const backupIndex = deploy.indexOf('backup-postgres.sh');
    const migrationIndex = deploy.indexOf('dc run --rm migrate');

    expect(backupIndex).toBeGreaterThan(0);
    expect(migrationIndex).toBeGreaterThan(backupIndex);
    expect(deploy).toContain('[ "$migration_policy" = expand-only ]');
    expect(deploy).toContain('wait_service_healthy api-a');
    expect(deploy).toContain('/api/v1/health/ready');
    expect(deploy).not.toMatch(/docker (compose )?build/);
    expect(rollback).toContain('--acknowledge-db-not-rolled-back');
    expect(rollback).toContain('the database was not rolled back');
    expect(rollback).not.toContain('migrate');
  });

  it('builds and scans both images and validates deploy configuration in CI', () => {
    const ci = read('.github/workflows/ci.yml');

    expect(ci).toContain('deploy/Dockerfile.backend');
    expect(ci).toContain('deploy/Dockerfile.web');
    expect(ci).toContain('plg-academy-backend:${{ github.sha }}');
    expect(ci).toContain('plg-academy-web:${{ github.sha }}');
    expect(ci).toContain('Validate production and synthetic Compose models');
    expect(ci).toContain('Validate production and synthetic Caddy configurations');
    expect(ci).toContain('image-ref: plg-academy-web:${{ github.sha }}');
    expect(ci).toContain('gitleaks:v8.28.0@sha256:');
  });
});
