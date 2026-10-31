import { runHttpScenario } from './http-test-harness';
import { runImportsRemainingStep } from './imports-remaining-http.step';
import { runPlatformRemainingStep } from './platform-remaining-http.step';

export async function runPlatformHttpScenario(): Promise<void> {
  await runHttpScenario(
    {
      roleCode: 'OWNER',
      permissions: [
        'imports.execute',
        'imports.preview',
        'imports.finalize',
        'legacy_archive.read',
        'messaging.otp.read',
        'messaging.otp.manage',
      ],
    },
    async (context) => {
      await runImportsRemainingStep(context);
      await runPlatformRemainingStep(context);
    },
  );
}
