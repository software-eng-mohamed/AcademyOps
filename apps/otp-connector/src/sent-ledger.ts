import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

// 24-hour retention window for duplicate message suppression
const RETENTION_MS = 24 * 60 * 60_000;

export class SentLedger {
  private readonly directory: string;

  constructor(sessionPath: string) {
    this.directory = resolve(sessionPath, '.sent-ledger');
  }

  async has(organizationId: string, idempotencyKey: string): Promise<boolean> {
    const path = this.path(organizationId, idempotencyKey);
    try {
      const value = await stat(path);
      if (value.mtimeMs >= Date.now() - RETENTION_MS) return true;
      await rm(path, { force: true });
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    return false;
  }

  async record(organizationId: string, idempotencyKey: string): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = this.path(organizationId, idempotencyKey);
    await writeFile(path, '', { flag: 'a', mode: 0o600 });
  }

  async prune(now = Date.now()): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(this.directory);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    await Promise.all(
      entries.map(async (entry) => {
        if (!/^[0-9a-f]{64}\.done$/.test(entry)) return;
        const path = resolve(this.directory, entry);
        if (!path.startsWith(`${this.directory}${sep}`)) return;
        const value = await stat(path);
        if (value.mtimeMs < now - RETENTION_MS) await rm(path, { force: true });
      }),
    );
  }

  private path(organizationId: string, idempotencyKey: string): string {
    const digest = createHash('sha256').update(`${organizationId}:${idempotencyKey}`).digest('hex');
    return resolve(this.directory, `${digest}.done`);
  }
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}
