import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import { CertificateAccessService } from './certificate-access.service';
import { CertificateEligibilityService } from './certificate-eligibility.service';
import { CertificateReadService } from './certificate-read.service';
import { CertificateRulesService } from './certificate-rules.service';
import { CertificateTokenService } from './certificate-token.service';
import { CertificateUploadService } from './certificate-upload.service';
import { ClamavScannerService } from './clamav-scanner.service';
import { CertificateRulesController, CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { CertificateIssueService } from './certificate-issue.service';
import { CertificateRevocationService } from './certificate-revocation.service';
import { CertificateFulfillmentService } from './certificate-fulfillment.service';

@Module({
  imports: [PlatformModule],
  controllers: [CertificatesController, CertificateRulesController],
  providers: [
    CertificateAccessService,
    CertificateEligibilityService,
    CertificateUploadService,
    ClamavScannerService,
    CertificateReadService,
    CertificateRulesService,
    CertificateTokenService,
    CertificateIssueService,
    CertificateRevocationService,
    CertificateFulfillmentService,
    CertificatesService,
  ],
})
export class CertificatesModule {}
