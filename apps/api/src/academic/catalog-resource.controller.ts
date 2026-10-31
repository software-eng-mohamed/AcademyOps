import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '@academyops/contracts';
import { requireVersion } from '../common/http/headers';
import { CurrentAccess, RequirePermission } from '../iam/authorization/decorators';
import { CalendarQueryDto } from './catalog-calendar.dto';
import {
  CreateRoomDto,
  CreateTrainerDto,
  ListCatalogDto,
  UpdateRoomDto,
  UpdateTrainerDto,
} from './catalog.dto';
import { CatalogService } from './catalog.service';

@ApiTags('academic-resources')
@Controller({ path: 'rooms', version: '1' })
export class RoomsController {
  constructor(private readonly catalog: CatalogService) {}

  @RequirePermission('academic.catalog.read')
  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() query: ListCatalogDto) {
    return this.catalog.listRooms(access, query);
  }

  @RequirePermission('academic.cohorts.manage')
  @Post()
  create(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateRoomDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.catalog.createRoom(access, input, correlationId);
  }

  @RequirePermission('academic.cohorts.manage')
  @Patch(':id')
  update(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: UpdateRoomDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.catalog.updateRoom(access, id, input, requireVersion(ifMatch), correlationId);
  }
}

@ApiTags('academic-resources')
@Controller({ path: 'trainers', version: '1' })
export class TrainersController {
  constructor(private readonly catalog: CatalogService) {}

  @RequirePermission('academic.catalog.read')
  @Get()
  list(@CurrentAccess() access: AccessContext, @Query() query: ListCatalogDto) {
    return this.catalog.listTrainers(access, query);
  }

  @RequirePermission('academic.catalog.read')
  @Get(':id')
  read(@CurrentAccess() access: AccessContext, @Param('id') id: string) {
    return this.catalog.readTrainer(access, id);
  }

  @RequirePermission('academic.programs.manage')
  @Post()
  create(
    @CurrentAccess() access: AccessContext,
    @Body() input: CreateTrainerDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.catalog.createTrainer(access, input, correlationId);
  }

  @RequirePermission('academic.programs.manage')
  @Patch(':id')
  update(
    @CurrentAccess() access: AccessContext,
    @Param('id') id: string,
    @Body() input: UpdateTrainerDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.catalog.updateTrainer(access, id, input, requireVersion(ifMatch), correlationId);
  }
}

@ApiTags('academic-calendar')
@Controller({ path: 'calendar', version: '1' })
export class CalendarController {
  constructor(private readonly catalog: CatalogService) {}

  @RequirePermission('academic.catalog.read')
  @Get()
  read(@CurrentAccess() access: AccessContext, @Query() query: CalendarQueryDto) {
    return this.catalog.readCalendar(access, query);
  }
}
