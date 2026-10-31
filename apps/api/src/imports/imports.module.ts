import { Module } from '@nestjs/common';
import { ImportsController, LegacyArchiveController } from './imports.controller';
import { ImportsService } from './imports.service';
import { PlatformModule } from '../platform/platform.module';
import { ImportAttendanceWriter } from './import-attendance-writer';
import { ImportCatalogWriter } from './import-catalog-writer';
import { ImportCatalogBuilder } from './import-catalog-builder';
import { ImportFinalizerService } from './import-finalizer.service';
import { ImportFinanceWriter } from './import-finance-writer';
import { ImportQueryService } from './import-query.service';
import { ImportStagingService } from './import-staging.service';
import { ImportStudentWriter } from './import-student-writer';
import { ImportValidationService } from './import-validation.service';
import { ImportArchiveWriter } from './import-archive-writer';
import { ImportStudentAccountWriter } from './import-student-account-writer';
import { ImportLifecycleEventsService } from './import-lifecycle-events.service';
import { ImportQuarantineService } from './import-quarantine.service';
import { LegacyArchiveService } from './legacy-archive.service';

@Module({
  imports: [PlatformModule],
  controllers: [ImportsController, LegacyArchiveController],
  providers: [
    ImportsService,
    ImportAttendanceWriter,
    ImportArchiveWriter,
    ImportCatalogBuilder,
    ImportCatalogWriter,
    ImportFinalizerService,
    ImportLifecycleEventsService,
    ImportFinanceWriter,
    ImportQueryService,
    ImportQuarantineService,
    ImportStagingService,
    ImportStudentWriter,
    ImportStudentAccountWriter,
    ImportValidationService,
    LegacyArchiveService,
  ],
})
export class ImportsModule {}
