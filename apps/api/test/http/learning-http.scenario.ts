import { seedBusinessFixture } from './business-chain-fixture';
import { runAttendanceStep } from './attendance-http.step';
import { runAttendanceRemainingStep } from './attendance-remaining-http.step';
import { runCertificateStep } from './certificate-http.step';
import {
  assertDeterministicCleanPdfScan,
  runCertificateRemainingStep,
} from './certificate-remaining-http.step';
import { runEnrollmentStep } from './enrollment-http.step';
import { runEnrollmentRemainingStep } from './enrollment-remaining-http.step';
import { runHttpScenario } from './http-test-harness';
import { ClamavScannerService } from '../../src/certificates/clamav-scanner.service';

export async function runLearningHttpScenario(): Promise<void> {
  await runHttpScenario(
    {
      roleCode: 'OWNER',
      permissions: [
        'enrollments.create',
        'enrollments.read',
        'enrollments.submit',
        'enrollments.activate',
        'enrollments.transfer',
        'enrollments.postpone',
        'enrollments.resume',
        'enrollments.complete',
        'enrollments.cancel.request',
        'enrollments.cancel.approve',
        'enrollments.retake',
        'attendance.qr.open',
        'attendance.record_manual',
        'attendance.correct',
        'attendance.correct_after_lock',
        'attendance.read',
        'academic.programs.manage',
        'reports.operations.read',
        'certificate_rules.manage',
        'certificates.read',
        'certificates.issue',
        'certificates.revoke',
        'certificates.upload',
        'certificates.collect',
      ],
      overrides: [
        {
          token: ClamavScannerService,
          value: { scan: assertDeterministicCleanPdfScan },
        },
      ],
    },
    async (context) => {
      const fixture = await seedBusinessFixture(context);
      const enrollmentId = await runEnrollmentStep(context, fixture);
      await runAttendanceStep(context, fixture, enrollmentId);
      await runAttendanceRemainingStep(context, fixture, enrollmentId);
      await runCertificateStep(context, fixture, enrollmentId);
      await runCertificateRemainingStep(context, fixture, enrollmentId);
      await runEnrollmentRemainingStep(context, fixture, enrollmentId);
    },
  );
}
