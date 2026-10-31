import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { egpToPiasters } from './paymob';

const intentionResponseSchema = z.object({
  id: z.union([z.string(), z.number()]),
  client_secret: z.string().min(1),
});

export type PaymobCustomer = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export type CreatePaymobIntention = {
  amount: string;
  attemptId: string;
  installmentOrdinal: number;
  reference: string;
  customer: PaymobCustomer;
};

export type PaymobIntentionResult = {
  intentionId: string;
  clientSecret: string;
  checkoutUrl: string;
};

export class PaymobRequestError extends Error {
  constructor(
    message: string,
    readonly outcomeUnknown: boolean,
    readonly code: string,
  ) {
    super(message);
  }
}

@Injectable()
export class PaymobClient {
  constructor(private readonly config: ConfigService) {}

  async createIntention(input: CreatePaymobIntention): Promise<PaymobIntentionResult> {
    const configuration = this.configuration();
    const amount = egpToPiasters(input.amount);
    let response: Response;
    try {
      response = await fetch(`${configuration.baseUrl}/v1/intention/`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${configuration.secretKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          amount,
          currency: 'EGP',
          payment_methods: configuration.paymentMethodIds,
          items: [
            {
              name: `AcademyOps installment ${input.installmentOrdinal}`,
              amount,
              description: `Installment ${input.installmentOrdinal}`,
              quantity: 1,
            },
          ],
          billing_data: {
            apartment: 'NA',
            first_name: input.customer.firstName,
            last_name: input.customer.lastName,
            street: 'NA',
            building: 'NA',
            phone_number: input.customer.phone,
            city: 'NA',
            country: 'EG',
            email: input.customer.email,
            floor: 'NA',
            state: 'NA',
          },
          customer: {
            first_name: input.customer.firstName,
            last_name: input.customer.lastName,
            email: input.customer.email,
          },
          special_reference: input.reference,
          notification_url: configuration.notificationUrl,
          redirection_url: this.redirectionUrl(configuration.redirectionUrl, input.attemptId),
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new PaymobRequestError(
        'Paymob request outcome is unknown',
        true,
        'NETWORK_OUTCOME_UNKNOWN',
      );
    }

    if (!response.ok) {
      throw new PaymobRequestError(
        `Paymob rejected intention creation with HTTP ${response.status}`,
        false,
        `HTTP_${response.status}`,
      );
    }
    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      throw new PaymobRequestError('Paymob returned invalid JSON', true, 'INVALID_RESPONSE');
    }
    const parsed = intentionResponseSchema.safeParse(responseBody);
    if (!parsed.success) {
      throw new PaymobRequestError(
        'Paymob returned an invalid intention',
        true,
        'INVALID_RESPONSE',
      );
    }
    const baseUrl = configuration.baseUrl;
    return {
      intentionId: String(parsed.data.id),
      clientSecret: parsed.data.client_secret,
      checkoutUrl: `${baseUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(configuration.publicKey)}&clientSecret=${encodeURIComponent(parsed.data.client_secret)}`,
    };
  }

  configuration() {
    const values = {
      baseUrl: (this.config.get<string>('PAYMOB_BASE_URL') ?? 'https://accept.paymob.com').replace(
        /\/+$/,
        '',
      ),
      secretKey: this.config.get<string>('PAYMOB_SECRET_KEY'),
      publicKey: this.config.get<string>('PAYMOB_PUBLIC_KEY'),
      hmacSecret: this.config.get<string>('PAYMOB_HMAC_SECRET'),
      paymentMethodIds: this.paymentMethodIds(),
      notificationUrl: this.config.get<string>('PAYMOB_NOTIFICATION_URL'),
      redirectionUrl: this.config.get<string>('PAYMOB_REDIRECTION_URL'),
      encryptionKey: this.config.get<string>('PAYMOB_CHECKOUT_ENCRYPTION_KEY'),
    };
    if (
      !values.secretKey ||
      !values.publicKey ||
      !values.hmacSecret ||
      values.paymentMethodIds.length === 0 ||
      !values.notificationUrl ||
      !values.redirectionUrl ||
      !values.encryptionKey
    ) {
      throw new ServiceUnavailableException({
        code: 'PAYMOB_NOT_CONFIGURED',
        messageKey: 'finance.paymobNotConfigured',
      });
    }
    return {
      ...values,
      secretKey: values.secretKey,
      publicKey: values.publicKey,
      hmacSecret: values.hmacSecret,
      notificationUrl: values.notificationUrl,
      redirectionUrl: values.redirectionUrl,
      encryptionKey: values.encryptionKey,
    };
  }

  private paymentMethodIds(): number[] {
    const value = this.config.get<string>('PAYMOB_PAYMENT_METHOD_IDS');
    if (!value) return [];
    return value.split(',').map((item) => Number(item));
  }

  private redirectionUrl(configuredUrl: string, attemptId: string): string {
    const url = new URL(configuredUrl);
    url.searchParams.set('attempt', attemptId);
    return url.toString();
  }
}
