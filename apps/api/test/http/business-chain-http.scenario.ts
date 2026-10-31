import { runAttendanceStep } from './attendance-http.step';
import { seedBusinessFixture } from './business-chain-fixture';
import { runCertificateStep } from './certificate-http.step';
import { runEnrollmentStep } from './enrollment-http.step';
import { runHttpScenario } from './http-test-harness';

export async function runBusinessChainHttpScenario(): Promise<void> {
  await runHttpScenario(
    {
      permissions: [
        'enrollments.create',
        'enrollments.read',
        'enrollments.submit',
        'enrollments.activate',
        'attendance.qr.open',
        'attendance.record_manual',
        'attendance.correct',
        'attendance.correct_after_lock',
        'attendance.read',
        'certificates.read',
        'certificates.issue',
        'certificates.revoke',
      ],
    },
    async (context) => {
      const fixture = await seedBusinessFixture(context);
      const enrollmentId = await runEnrollmentStep(context, fixture);
      await runAttendanceStep(context, fixture, enrollmentId);
      await runCertificateStep(context, fixture, enrollmentId);
    },
  );
}
