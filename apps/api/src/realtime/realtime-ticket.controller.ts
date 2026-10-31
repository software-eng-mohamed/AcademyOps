import { Controller, Post, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../iam/authorization/decorators';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator';
import { RealtimeTicketService } from './realtime-ticket.service';

class RealtimeTicketResponseDto {
  @ApiProperty()
  ticket!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}

@ApiTags('realtime')
@Controller({ path: 'realtime', version: '1' })
export class RealtimeTicketController {
  constructor(private readonly tickets: RealtimeTicketService) {}

  @Post('ticket')
  @RateLimit({ name: 'realtime.ticket', limit: 10, windowSeconds: 60 })
  @ApiCreatedResponse({ type: RealtimeTicketResponseDto })
  issue(@Req() request: AuthenticatedRequest) {
    if (!request.sessionId || !request.accessContext) {
      throw new Error('SessionGuard did not populate realtime ticket context');
    }
    return this.tickets.issue(request.sessionId, request.accessContext);
  }
}
