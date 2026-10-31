import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { PaymobCheckoutService } from './paymob-checkout.service';
import { PaymobWebhookService } from './paymob-webhook.service';

@Injectable()
export class PaymobPaymentsService {
  constructor(
    private readonly checkoutService: PaymobCheckoutService,
    private readonly webhookService: PaymobWebhookService,
  ) {}

  async createCheckout(
    access: AccessContext,
    installmentId: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.checkoutService.createCheckout(
      access,
      installmentId,
      idempotencyKey,
      correlationId,
    );
  }

  async readCheckout(access: AccessContext, attemptId: string) {
    return this.checkoutService.readCheckout(access, attemptId);
  }

  async handleWebhook(payload: unknown, suppliedHmac: string, correlationId: string) {
    return this.webhookService.handleWebhook(payload, suppliedHmac, correlationId);
  }
}
