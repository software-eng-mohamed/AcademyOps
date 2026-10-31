import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../iam/authorization/decorators';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { FileStorageService } from './file-storage.service';

@ApiTags('files')
@Controller({ path: 'files', version: '1' })
export class FilesController {
  constructor(private readonly files: FileStorageService) {}

  @Public()
  @RateLimit({ name: 'files.signed_download', limit: 120, windowSeconds: 60 })
  @Get(':id/content')
  content(
    @Param('id') id: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
  ) {
    return this.files.localContent(id, expires, signature);
  }
}
