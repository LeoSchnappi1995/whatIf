import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

import { WhatifService } from './whatif.service';

class CreateStoryDraftDto {
  @IsOptional()
  @IsIn(['home_create', 'work_remake'])
  source?: 'home_create' | 'work_remake';

  @IsOptional()
  @IsString()
  workId?: string;
}

class UpdateCastSettingDto {
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  characterIds!: string[];

  @IsOptional()
  @IsString()
  worldviewId?: string | null;

  @IsInt()
  draftVersion!: number;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
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

  @Get('api/story-drafts/:draftId/cast-setting')
  getCastSetting(@Param('draftId') draftId: string) {
    return this.whatifService.getCastSetting(draftId);
  }

  @Get('api/story-drafts/:draftId/character-candidates')
  getCharacterCandidates(
    @Param('draftId') draftId: string,
    @Query('cursor') cursor?: string,
    @Query('pageSize', new DefaultValuePipe(6), ParseIntPipe) pageSize = 6,
  ) {
    return this.whatifService.getCharacterCandidates(draftId, cursor, pageSize);
  }

  @Put('api/story-drafts/:draftId/cast-setting')
  updateCastSetting(
    @Param('draftId') draftId: string,
    @Body() body: UpdateCastSettingDto,
  ) {
    return this.whatifService.updateCastSetting(draftId, body);
  }
}
