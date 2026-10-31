import { BadRequestException, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { isUUID } from 'class-validator';

const UUID_PARAMETER_NAMES = new Set(['id', 'factorId', 'issueId']);
const UUID_FORMAT_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export class IdentifierParamPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'param' || !metadata.data || !UUID_PARAMETER_NAMES.has(metadata.data)) {
      return value;
    }
    if (typeof value === 'string' && (UUID_FORMAT_REGEX.test(value) || isUUID(value))) return value;
    throw new BadRequestException({
      code: 'INVALID_IDENTIFIER',
      messageKey: 'errors.invalidIdentifier',
    });
  }
}
