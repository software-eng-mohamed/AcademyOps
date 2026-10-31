import { Type } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class ListImportBatchesDto {
  @IsOptional()
  @IsIn(['STAGED', 'VALIDATED', 'RECONCILED', 'FINALIZED'])
  status?: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class ListImportIssuesDto {
  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED', 'IGNORED'])
  status?: string;

  @IsOptional()
  @IsIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
  severity?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  code?: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class ListLegacyArchiveDto {
  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  category?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  sheetName?: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class ResolveImportIssueDto {
  @Equals('plg-import-correction/v1')
  schemaVersion!: 'plg-import-correction/v1';

  @IsIn(['CORRECT', 'EXCLUDE'])
  decision!: 'CORRECT' | 'EXCLUDE';

  @Matches(/^[a-f0-9]{64}$/i)
  expectedRowHash!: string;

  @Matches(/^[A-Z][A-Z0-9_]*$/)
  expectedIssueCode!: string;

  @Equals(1)
  expectedIssueVersion!: 1;

  @IsOptional()
  @IsObject()
  correction?: Record<string, unknown>;

  @IsString()
  @Length(3, 1000)
  note!: string;
}

export class ArchiveQuarantinedRowsDto {
  @IsString()
  @Length(10, 1000)
  note!: string;
}
