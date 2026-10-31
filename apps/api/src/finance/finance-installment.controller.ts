import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { CurrentAccess, RequirePermission } from '../iam/authorization/decorators';
import { FinanceInstallmentReadService } from './finance-installment-read.service';
import { ListInstallmentsDto } from './finance.dto';
import { InstallmentsPageDto } from '../common/student-response.dto';

@ApiTags('finance')
@Controller({ path: 'enrollments', version: '1' })
export class FinanceInstallmentController {
  constructor(private readonly installments: FinanceInstallmentReadService) {}

  @RequirePermission('finance.balance.read')
  @ApiOkResponse({ type: InstallmentsPageDto })
  @Get(':id/installments')
  list(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Query() query: ListInstallmentsDto,
  ) {
    return this.installments.listInstallments(access, id, query);
  }
}
