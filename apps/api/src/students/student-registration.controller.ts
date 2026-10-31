import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type AccessContext } from '@academyops/contracts';
import { requireVersion } from '../common/http/headers';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator';
import { CurrentAccess, Public, RequirePermission } from '../iam/authorization/decorators';
import {
  RegisterStudentDto,
  RegistrationResponseDto,
  ListStudentRegistrationsQueryDto,
  StudentRegistrationDetailDto,
  StudentRegistrationsPageDto,
  ApproveStudentRegistrationDto,
  RejectStudentRegistrationDto,
} from './student-registration.dto';
import { StudentRegistrationService } from './student-registration.service';
import { StudentRegistrationReviewService } from './student-registration-review.service';

@ApiTags('students')
@Controller({ path: 'student-registrations', version: '1' })
export class StudentRegistrationController {
  constructor(
    private readonly service: StudentRegistrationService,
    private readonly reviewService: StudentRegistrationReviewService,
  ) {}

  @Public()
  @RateLimit({
    name: 'student_registration',
    limit: 5,
    ipLimit: 30,
    windowSeconds: 900,
    subject: 'REGISTRATION',
  })
  @Post()
  @HttpCode(202)
  @ApiResponse({ status: 202, type: RegistrationResponseDto })
  async register(
    @Body() input: RegisterStudentDto,
    @Headers('x-correlation-id') correlationId = 'public-registration',
  ): Promise<RegistrationResponseDto> {
    return this.service.register(input, correlationId);
  }

  @RequirePermission('students.registration.manage')
  @Get()
  @ApiOkResponse({ type: StudentRegistrationsPageDto })
  async list(
    @CurrentAccess() access: AccessContext,
    @Query() query: ListStudentRegistrationsQueryDto,
  ): Promise<StudentRegistrationsPageDto> {
    return this.service.list(access, query);
  }

  @RequirePermission('students.registration.manage')
  @Get(':id')
  @ApiOkResponse({ type: StudentRegistrationDetailDto })
  async getOne(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
  ): Promise<StudentRegistrationDetailDto> {
    return this.service.getOne(access, id);
  }

  @RequirePermission('students.registration.manage')
  @Post(':id/approve')
  @HttpCode(200)
  @ApiOkResponse({ type: StudentRegistrationDetailDto })
  async approve(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: ApproveStudentRegistrationDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId = 'registration-approval',
  ): Promise<StudentRegistrationDetailDto> {
    const version = requireVersion(ifMatch);
    return this.reviewService.approve(access, id, version, input, correlationId);
  }

  @RequirePermission('students.registration.manage')
  @Post(':id/reject')
  @HttpCode(200)
  @ApiOkResponse({ type: StudentRegistrationDetailDto })
  async reject(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: RejectStudentRegistrationDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId = 'registration-rejection',
  ): Promise<StudentRegistrationDetailDto> {
    const version = requireVersion(ifMatch);
    return this.reviewService.reject(access, id, version, input.reason, correlationId);
  }
}
