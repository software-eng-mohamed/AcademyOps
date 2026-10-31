import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CrmModule } from './crm/crm.module';
import { IamModule } from './iam/iam.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { FinanceModule } from './finance/finance.module';
import { AttendanceModule } from './attendance/attendance.module';
import { CertificatesModule } from './certificates/certificates.module';
import { ImportsModule } from './imports/imports.module';
import { AcademicModule } from './academic/academic.module';
import { StudentsModule } from './students/students.module';
import { PlatformModule } from './platform/platform.module';
import { ReportingModule } from './reporting/reporting.module';
import { validateEnvironment } from './config/environment';
import { WorkspaceModule } from './workspace/workspace.module';
import { RealtimeModule } from './realtime/realtime.module';
import { MessagingModule } from './messaging/messaging.module';
import { environmentFilePaths } from './config/environment-files';
import { ObservabilityModule } from './observability/observability.module';
import { DevOnlyModule } from './dev-only/dev-only.module';

const configurationModule = ConfigModule.forRoot({
  isGlobal: true,
  cache: true,
  envFilePath: environmentFilePaths(),
  validate: validateEnvironment,
});

export function developmentOnlyModules(nodeEnvironment = process.env.NODE_ENV) {
  return nodeEnvironment === 'development' ? [DevOnlyModule] : [];
}

@Module({
  imports: [
    configurationModule,
    ...developmentOnlyModules(),
    PlatformModule,
    IamModule,
    CrmModule,
    EnrollmentModule,
    FinanceModule,
    AttendanceModule,
    CertificatesModule,
    ImportsModule,
    AcademicModule,
    StudentsModule,
    ReportingModule,
    WorkspaceModule,
    RealtimeModule,
    ObservabilityModule,
    MessagingModule,
  ],
})
export class AppModule {}
