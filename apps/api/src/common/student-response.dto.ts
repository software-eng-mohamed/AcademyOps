import { ApiProperty } from '@nestjs/swagger';

export class InstallmentItemDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 1 })
  ordinal!: number;

  @ApiProperty({ example: '2026-08-15' })
  dueDate!: string;

  @ApiProperty({ example: '1000.00' })
  originalAmount!: string;

  @ApiProperty({ example: '200.00' })
  allocatedAmount!: string;

  @ApiProperty({ example: '800.00' })
  outstandingAmount!: string;

  @ApiProperty({ example: 'EGP' })
  currency!: string;

  @ApiProperty({
    enum: ['PAID', 'PARTIALLY_PAID', 'OVERDUE', 'DUE', 'UPCOMING'],
    example: 'DUE',
  })
  state!: 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'DUE' | 'UPCOMING';

  @ApiProperty({ example: true })
  payable!: boolean;
}

export class InstallmentsPageDto {
  @ApiProperty({ type: [InstallmentItemDto] })
  items!: InstallmentItemDto[];

  @ApiProperty({ type: String, nullable: true, example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' })
  nextCursor!: string | null;
}

export class CertificateEligibilityDto {
  @ApiProperty({ type: String, nullable: true, example: '0.8500' })
  attendanceRatio!: string | null;

  @ApiProperty({ example: '0.8000' })
  minimumRatio!: string;

  @ApiProperty({ enum: ['ELIGIBLE', 'INELIGIBLE'], example: 'ELIGIBLE' })
  academicEligibility!: 'ELIGIBLE' | 'INELIGIBLE';

  @ApiProperty({ example: false })
  financialHold!: boolean;

  @ApiProperty({ example: '0.00' })
  outstanding!: string;

  @ApiProperty({ example: true })
  completionSatisfied!: boolean;

  @ApiProperty({ example: true })
  overallEligibility!: boolean;

  @ApiProperty({ example: 'b0fa733d-c584-482d-8b01-523c09033328' })
  ruleId!: string;
}

export class CertificateDownloadResultDto {
  @ApiProperty({ example: 'https://storage.googleapis.com/bucket/path-to-cert.pdf' })
  url!: string;

  @ApiProperty({ example: '2026-08-11T16:30:00.000Z' })
  expiresAt!: string;
}
