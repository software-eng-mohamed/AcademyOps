import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { PaymobCustomer } from './paymob.client';
import { decryptPaymobSecret } from './paymob';
export type CheckoutResult = {
  attemptId: string;
  status: string;
  amount: string;
  currencyCode: 'EGP';
  checkoutUrl: string | null;
  paymentId: string | null;
};
export type PreparedCheckout = {
  attemptId: string;
  status: string;
  amount: string;
  ordinal: number;
  reference: string;
  encryptedSecret: string | null;
  paymentId: string | null;
  customer: PaymobCustomer;
  created: boolean;
};
@Injectable()
export class PaymobCheckoutHelper {
  assertCheckoutScope(access: AccessContext, homeBranchId: string, studentPersonId: string): void {
    const scopes = access.grants.get('payments.checkout');
    if (
      scopes?.has('O') ||
      (scopes?.has('B') && access.branchIds.has(homeBranchId)) ||
      (scopes?.has('S') && access.studentPersonId === studentPersonId)
    ) {
      return;
    }
    throw new ForbiddenException({
      code: 'RESOURCE_SCOPE_DENIED',
      messageKey: 'auth.resourceScopeDenied',
    });
  }
  async resolveCustomer(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    personId: string,
  ): Promise<PaymobCustomer> {
    const [person, contacts] = await Promise.all([
      transaction.person.findFirstOrThrow({ where: { id: personId, organizationId } }),
      transaction.personContact.findMany({
        where: { organizationId, personId, type: { in: ['EMAIL', 'PHONE'] } },
        orderBy: [{ isPrimary: 'desc' }, { verifiedAt: 'desc' }, { createdAt: 'asc' }],
      }),
    ]);
    const email = contacts.find((contact) => contact.type === 'EMAIL')?.normalizedValue;
    const phone = contacts.find((contact) => contact.type === 'PHONE')?.normalizedValue;
    if (!email || !phone) {
      throw new ConflictException({
        code: 'PAYMOB_CUSTOMER_CONTACT_REQUIRED',
        messageKey: 'finance.paymobCustomerContactRequired',
      });
    }
    const parts = (person.name || 'AcademyOps Student').trim().split(/\s+/);
    return {
      firstName: parts[0] || 'AcademyOps',
      lastName: parts.slice(1).join(' ') || 'Student',
      email,
      phone,
    };
  }
  replayCheckout(
    attempt: PreparedCheckout,
    publicKey: string,
    baseUrl: string,
    encryptionKey: string,
  ): CheckoutResult {
    if (attempt.status === 'PENDING' && attempt.encryptedSecret) {
      const secret = decryptPaymobSecret(attempt.encryptedSecret, encryptionKey);
      return {
        attemptId: attempt.attemptId,
        status: attempt.status,
        amount: attempt.amount,
        currencyCode: 'EGP',
        checkoutUrl: `${baseUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(publicKey)}&clientSecret=${encodeURIComponent(secret)}`,
        paymentId: attempt.paymentId,
      };
    }
    if (attempt.status === 'SUCCEEDED') {
      return {
        attemptId: attempt.attemptId,
        status: attempt.status,
        amount: attempt.amount,
        currencyCode: 'EGP',
        checkoutUrl: null,
        paymentId: attempt.paymentId,
      };
    }
    const requiresReconciliation = attempt.status === 'UNKNOWN' || attempt.status === 'CREATED';
    throw new ConflictException({
      code: requiresReconciliation
        ? 'PAYMOB_ATTEMPT_REQUIRES_RECONCILIATION'
        : 'PAYMOB_ATTEMPT_NOT_REPLAYABLE',
      messageKey: requiresReconciliation
        ? 'finance.paymobAttemptRequiresReconciliation'
        : 'finance.paymobAttemptNotReplayable',
    });
  }
  installmentNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'INSTALLMENT_NOT_FOUND',
      messageKey: 'finance.installmentNotFound',
    });
  }
  attemptNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PAYMOB_ATTEMPT_NOT_FOUND',
      messageKey: 'finance.paymobAttemptNotFound',
    });
  }
}
