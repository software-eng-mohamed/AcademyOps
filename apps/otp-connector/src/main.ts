import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConnectorApi } from './connector-api';
import { readConnectorConfig } from './connector-config';
import { ConnectorHttpServer } from './connector-http';
import { SessionManager } from './session-manager';

const envPath = resolve(__dirname, '../../../.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([^#\s][^=]+?)\s*=\s*(.*)$/);
    const key = match?.[1]?.trim();
    const rawValue = match?.[2];
    if (!key || rawValue === undefined) continue;
    process.env[key] ??= rawValue.trim();
  }
}

async function bootstrap(): Promise<void> {
  const config = readConnectorConfig();
  const api = new ConnectorApi(config);
  const manager = new SessionManager(config, api);
  const http = new ConnectorHttpServer(config, manager);
  await http.listen();
  manager.start();
  process.stdout.write(`OTP connector listening on internal port ${config.port}\n`);
  const shutdown = async () => {
    await Promise.all([http.close(), manager.stop()]);
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}

void bootstrap().catch((error: unknown) => {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`OTP connector failed to start: ${detail}\n`);
  process.exit(1);
});
