import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';

import { WhatifService } from './whatif.service';

class CreateStoryDraftDto {
  @IsOptional()
  @IsIn(['home_create', 'work_remake'])
  source?: 'home_create' | 'work_remake';

  @IsOptional()
  @IsString()
  workId?: string;
}

@Controller()
export class WhatifController {
  constructor(private readonly whatifService: WhatifService) {}

  @Get('api/whatif/home')
  getHome() {
    return this.whatifService.getHome();
  }

  @Get('api/whatif/works')
  getWorks(
    @Query('cursor') cursor?: string,
    @Query('pageSize', new DefaultValuePipe(6), ParseIntPipe) pageSize = 6,
  ) {
    return this.whatifService.getWorks(cursor, pageSize);
  }

  @Post('api/story-drafts')
  createStoryDraft(@Body() body: CreateStoryDraftDto) {
    return this.whatifService.createStoryDraft(body.source, body.workId);
  }
}
