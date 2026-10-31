import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

export const invalidQr = () =>
  new UnauthorizedException({
    code: 'QR_INVALID_OR_EXPIRED',
    messageKey: 'attendance.qrInvalidOrExpired',
  });

export const windowNotOpen = () =>
  new ConflictException({
    code: 'ATTENDANCE_WINDOW_NOT_OPEN',
    messageKey: 'attendance.windowNotOpen',
  });

export const notInRoster = () =>
  new ForbiddenException({
    code: 'NOT_IN_SESSION_ROSTER',
    messageKey: 'attendance.notInRoster',
  });

export const attendanceNotFound = () =>
  new NotFoundException({
    code: 'ATTENDANCE_NOT_FOUND',
    messageKey: 'attendance.notFound',
  });

export const versionConflict = () =>
  new ConflictException({
    code: 'VERSION_CONFLICT',
    messageKey: 'errors.versionConflict',
  });
