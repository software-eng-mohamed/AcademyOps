import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT = 'plg:rate-limit';

export type RateLimitRule = {
  name: string;
  limit: number;
  ipLimit?: number;
  windowSeconds: number;
  subject?: 'LOGIN_IDENTIFIER' | 'EMAIL' | 'PHONE' | 'REGISTRATION' | 'RESET_TOKEN' | 'PAYMOB_HMAC';
};

export const RateLimit = (rule: RateLimitRule): MethodDecorator => SetMetadata(RATE_LIMIT, rule);
