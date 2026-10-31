import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CertificateTokenService {
  constructor(private readonly config: ConfigService) {}

  tokenFor(certificateId: string): string {
    const signature = createHmac('sha256', this.config.getOrThrow<string>('FILE_SIGNING_SECRET'))
      .update(`certificate:${certificateId}`)
      .digest('base64url');
    return `${certificateId}.${signature}`;
  }

  digest(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  parseAndValidate(token: string): string | null {
    const [certificateId, signature, extra] = token.split('.');
    if (!certificateId || !signature || extra || !this.isUuid(certificateId)) return null;
    const expected = Buffer.from(this.tokenFor(certificateId));
    const actual = Buffer.from(token);
    return expected.length === actual.length && timingSafeEqual(expected, actual)
      ? certificateId
      : null;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}
