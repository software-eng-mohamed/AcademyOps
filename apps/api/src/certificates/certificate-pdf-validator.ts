import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { CertificateUploadFile } from './certificate-upload.service';

const MAXIMUM_BYTES = 10 * 1024 * 1024;
const FORBIDDEN_FEATURES = [
  '/JavaScript',
  '/JS',
  '/OpenAction',
  '/AA',
  '/Launch',
  '/EmbeddedFile',
  '/RichMedia',
  '/AcroForm',
  '/XFA',
  '/ObjStm',
  '/Encrypt',
  '/Filespec',
  '/GoToR',
  '/SubmitForm',
  '/ImportData',
  '/Sound',
  '/Movie',
  '/RichMediaExecute',
  '/3D',
];

export function validateCertificatePdf(file: CertificateUploadFile | undefined): {
  bytes: Buffer;
  sha256: string;
} {
  if (!file?.buffer?.length) throw invalid('CERTIFICATE_FILE_REQUIRED', 'fileRequired');
  if (file.size !== file.buffer.byteLength || file.size > MAXIMUM_BYTES) {
    throw invalid('CERTIFICATE_FILE_TOO_LARGE', 'fileTooLarge');
  }
  if (file.mimetype !== 'application/pdf' || !file.originalname.toLowerCase().endsWith('.pdf')) {
    throw invalid('CERTIFICATE_PDF_INVALID', 'pdfInvalid');
  }
  if (file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw invalid('CERTIFICATE_PDF_INVALID', 'pdfInvalid');
  }
  const tail = file.buffer.subarray(Math.max(0, file.buffer.byteLength - 2048)).toString('latin1');
  if (!tail.includes('%%EOF')) throw invalid('CERTIFICATE_PDF_INVALID', 'pdfInvalid');
  const eofAt = file.buffer.lastIndexOf(Buffer.from('%%EOF'));
  if (eofAt < 0 || !/^\s*$/.test(file.buffer.subarray(eofAt + 5).toString('latin1'))) {
    throw invalid('CERTIFICATE_PDF_INVALID', 'pdfInvalid');
  }
  const source = file.buffer
    .toString('latin1')
    .replace(/#([\da-f]{2})/gi, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
  if (
    FORBIDDEN_FEATURES.some((token) =>
      new RegExp(`${token.replace('/', '\\/')}\\b`, 'i').test(source),
    )
  ) {
    throw invalid('CERTIFICATE_PDF_ACTIVE_CONTENT_REJECTED', 'activeContentRejected');
  }
  return {
    bytes: file.buffer,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
  };
}

function invalid(code: string, key: string): BadRequestException {
  return new BadRequestException({ code, messageKey: `certificates.${key}` });
}
