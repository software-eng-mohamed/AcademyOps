import 'reflect-metadata';
import './local-environment';
import { createRequire } from 'node:module';
import { NestFactory } from '@nestjs/core';
import type { WorkerModule as WorkerModuleDefinition } from '@academyops/api/worker';

const requireFromWorker = createRequire(__filename);
type WorkerPackage = { WorkerModule: typeof WorkerModuleDefinition };

async function loadWorkerModule(): Promise<typeof WorkerModuleDefinition> {
  const attempts = process.env.NODE_ENV === 'production' ? 1 : 120;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const workerPackage = requireFromWorker('@academyops/api/worker') as WorkerPackage;
      return workerPackage.WorkerModule;
    } catch (error) {
      const retryable = (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND';
      if (!retryable || attempt === attempts) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    }
  }
  throw new Error('Worker module did not become available.');
}

async function bootstrap(): Promise<void> {
  const WorkerModule = await loadWorkerModule();
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.enableShutdownHooks();
}

void bootstrap();
