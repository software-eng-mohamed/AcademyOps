import { Injectable } from '@nestjs/common';
import type { AccessContext, PermissionCode } from '@academyops/contracts';
import { FinanceAccessService } from '../finance/finance-access.service';
import { PrismaService } from '../platform/database/prisma.service';
import { searchResult, type SearchResult } from './search-contract';
import type { SearchEntityType } from './workspace.dto';

@Injectable()
export class SearchFinanceResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAccess: FinanceAccessService,
  ) {}

  async resolve(
    access: AccessContext,
    type: SearchEntityType,
    id: string,
    permission: PermissionCode,
  ): Promise<SearchResult | null> {
    const visibleEnrollmentIds = await this.financeAccess.visibleEnrollmentIds(
      this.prisma,
      access,
      permission,
    );
    if (type === 'PAYMENT') {
      const payment = await this.prisma.payment.findFirst({
        where: {
          id,
          organizationId: access.organizationId,
          ...(visibleEnrollmentIds === undefined
            ? {}
            : { enrollmentId: { in: visibleEnrollmentIds } }),
        },
      });
      return payment
        ? searchResult(
            type,
            payment.id,
            `${payment.amount.toFixed(2)} EGP`,
            `${payment.amount.toFixed(2)} EGP`,
            payment.externalReference,
            payment.status,
          )
        : null;
    }
    if (type === 'CERTIFICATE') {
      const certificate = await this.prisma.certificate.findFirst({
        where: {
          id,
          organizationId: access.organizationId,
          ...(visibleEnrollmentIds === undefined
            ? {}
            : { enrollmentId: { in: visibleEnrollmentIds } }),
        },
      });
      return certificate
        ? searchResult(
            type,
            certificate.id,
            certificate.serial,
            certificate.serial,
            certificate.pdfStatus,
            certificate.validityStatus,
          )
        : null;
    }
    const visibleBillingIds = await this.financeAccess.visibleBillingAccountIds(
      this.prisma,
      access,
      permission,
    );
    if (type === 'INVOICE') {
      const invoice = await this.prisma.internalInvoice.findFirst({
        where: {
          id,
          organizationId: access.organizationId,
          ...(visibleBillingIds === undefined
            ? {}
            : { billingAccountId: { in: visibleBillingIds } }),
        },
      });
      return invoice
        ? searchResult(
            type,
            invoice.id,
            `Invoice ${invoice.serialNumber}`,
            `Invoice ${invoice.serialNumber}`,
            invoice.totalAmount.toFixed(2),
            invoice.status,
          )
        : null;
    }
    const receipt = await this.prisma.internalReceipt.findFirst({
      where: {
        id,
        organizationId: access.organizationId,
        ...(visibleBillingIds === undefined ? {} : { billingAccountId: { in: visibleBillingIds } }),
      },
    });
    return receipt
      ? searchResult(
          type,
          receipt.id,
          `Receipt ${receipt.serialNumber}`,
          `Receipt ${receipt.serialNumber}`,
          receipt.amount.toFixed(2),
          'ISSUED',
        )
      : null;
  }
}
