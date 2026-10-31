import { BadRequestException, ConflictException } from '@nestjs/common';

export function assertCertificateUploadable(
  certificate: { version: number; validityStatus: string; fulfillmentStatus: string },
  expectedVersion: number,
): void {
  if (certificate.version !== expectedVersion) {
    throw new ConflictException({ code: 'VERSION_CONFLICT', messageKey: 'errors.versionConflict' });
  }
  if (certificate.validityStatus !== 'ISSUED') {
    throw new ConflictException({
      code: 'CERTIFICATE_NOT_ACTIVE',
      messageKey: 'certificates.notActive',
    });
  }
  if (certificate.fulfillmentStatus !== 'NOT_PRINTED') {
    throw new ConflictException({
      code: 'CERTIFICATE_FILE_LOCKED_AFTER_PRINT',
      messageKey: 'certificates.fileLockedAfterPrint',
    });
  }
}

export function certificateUploadInProgress(): ConflictException {
  return new ConflictException({
    code: 'CERTIFICATE_UPLOAD_IN_PROGRESS',
    messageKey: 'certificates.uploadInProgress',
  });
}

export function certificateScanFailureStatus(error: unknown): 'FAILED' | 'REJECTED' {
  if (error instanceof BadRequestException) {
    const response = error.getResponse();
    if (typeof response === 'object' && response && 'code' in response) return 'REJECTED';
  }
  return 'FAILED';
}
