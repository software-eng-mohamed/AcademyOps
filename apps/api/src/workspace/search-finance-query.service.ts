import { Injectable } from '@nestjs/common';
import type { AccessContext, PermissionCode } from '@academyops/contracts';
import { FinanceAccessService } from '../finance/finance-access.service';
import { PrismaService } from '../platform/database/prisma.service';
import { searchResult, type SearchResult } from './search-contract';
import { SearchScopeService } from './search-scope.service';
import type { SearchEntityType } from './workspace.dto';

@Injectable()
export class SearchFinanceQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAccess: FinanceAccessService,
    private readonly scope: SearchScopeService,
  ) {}

  async search(
    access: AccessContext,
    type: SearchEntityType,
    query: string,
    limit: number,
    permission: PermissionCode,
  ): Promise<SearchResult[]> {
    const visibleEnrollmentIds = await this.financeAccess.visibleEnrollmentIds(
      this.prisma,
      access,
      permission,
    );
    if (type === 'PAYMENT') {
      const payments = await this.prisma.payment.findMany({
        where: {
          organizationId: access.organizationId,
          ...(visibleEnrollmentIds === undefined
            ? {}
            : { enrollmentId: { in: visibleEnrollmentIds } }),
          OR: [
            { externalReference: { contains: query, mode: 'insensitive' } },
            { idempotencyKey: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: limit,
        orderBy: { receivedAt: 'desc' },
      });
      return payments.map((payment) =>
        searchResult(
          type,
          payment.id,
          `${payment.amount.toFixed(2)} EGP`,
          `${payment.amount.toFixed(2)} EGP`,
          payment.externalReference,
          payment.status,
        ),
      );
    }
    if (type === 'INVOICE') {
      const billingIds = await this.scope.billingIds(access.organizationId, visibleEnrollmentIds);
      const invoiceSearch = [
        ...(query.match(/^[0-9a-f-]{36}$/i) ? [{ id: query }] : []),
        ...(/^\d+$/.test(query) ? [{ serialNumber: BigInt(query) }] : []),
      ];
      if (!invoiceSearch.length) return [];
      const invoices = await this.prisma.internalInvoice.findMany({
        where: {
          organizationId: access.organizationId,
          billingAccountId: { in: billingIds },
          OR: invoiceSearch,
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
      });
      return invoices.map((invoice) =>
        searchResult(
          type,
          invoice.id,
          `Invoice ${invoice.serialNumber}`,
          `Invoice ${invoice.serialNumber}`,
          invoice.totalAmount.toFixed(2),
          invoice.status,
        ),
      );
    }
    if (type === 'RECEIPT') {
      const billingIds = await this.scope.billingIds(access.organizationId, visibleEnrollmentIds);
      const receipts = await this.prisma.internalReceipt.findMany({
        where: {
          organizationId: access.organizationId,
          billingAccountId: { in: billingIds },
          ...(/^\d+$/.test(query) ? { serialNumber: BigInt(query) } : {}),
        },
        take: limit,
        orderBy: { issuedAt: 'desc' },
      });
      return receipts.map((receipt) =>
        searchResult(
          type,
          receipt.id,
          `Receipt ${receipt.serialNumber}`,
          `Receipt ${receipt.serialNumber}`,
          receipt.amount.toFixed(2),
          'ISSUED',
        ),
      );
    }
    const certificates = await this.prisma.certificate.findMany({
      where: {
        organizationId: access.organizationId,
        ...(visibleEnrollmentIds === undefined
          ? {}
          : { enrollmentId: { in: visibleEnrollmentIds } }),
        serial: { contains: query, mode: 'insensitive' },
      },
      take: limit,
      orderBy: { issuedAt: 'desc' },
    });
    return certificates.map((certificate) =>
      searchResult(
        type,
        certificate.id,
        certificate.serial,
        certificate.serial,
        certificate.pdfStatus,
        certificate.validityStatus,
      ),
    );
  }
}
