import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';

import { WhatifService } from './whatif.service';

@Controller()
export class WhatifController {
  constructor(private readonly whatif: WhatifService) {}

  private owner(req: Request) {
    return String(req.userContext?.userId || req.headers['x-demo-user-id'] || 'anonymous');
  }

  @Get('api/whatif/home')
  getHome(@Req() req: Request) {
    return this.whatif.getHome(this.owner(req));
  }

  @Get('api/whatif/works')
  getWorks(
    @Query('cursor') cursor?: string,
    @Query('pageSize', new DefaultValuePipe(6), ParseIntPipe) pageSize = 6,
  ) {
    return this.whatif.getWorks(cursor, pageSize);
  }

  @Get('api/whatif/ai-config')
  getAiConfig() {
    return this.whatif.aiConfig();
  }

  @Post('api/uploads/images')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  uploadImage(
    @Req() req: Request,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number; originalname: string },
  ) {
    return this.whatif.uploadImage(this.owner(req), file);
  }

  @Post('api/story-drafts')
  createStoryDraft(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.whatif.createStoryDraft(this.owner(req), body);
  }

  @Get('api/story-drafts/:draftId/cast-setting')
  getCastSetting(@Req() req: Request, @Param('draftId') draftId: string) {
    return this.whatif.getCastSetting(this.owner(req), draftId);
  }

  @Get('api/story-drafts/:draftId/character-candidates')
  getCharacterCandidates(@Req() req: Request, @Param('draftId') draftId: string) {
    return this.whatif.getCastSetting(this.owner(req), draftId).then((result) => ({
      characters: result.characters,
      nextCursor: '',
      hasMore: false,
      traceId: result.traceId,
    }));
  }

  @Put('api/story-drafts/:draftId/cast-setting')
  updateCastSetting(
    @Req() req: Request,
    @Param('draftId') draftId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.whatif.updateCastSetting(this.owner(req), draftId, body);
  }

  @Patch('api/story-drafts/:draftId/story-setting')
  updateStorySetting(
    @Req() req: Request,
    @Param('draftId') draftId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.whatif.updateStorySetting(this.owner(req), draftId, body);
  }

  @Get('api/story-drafts/:draftId/scene-editor')
  getSceneEditor(
    @Req() req: Request,
    @Param('draftId') draftId: string,
    @Query('parentSceneId') parentSceneId?: string,
  ) {
    return this.whatif.getSceneEditor(this.owner(req), draftId, parentSceneId);
  }

  @Post('api/story-drafts/:draftId/director-preview')
  previewDirector(
    @Req() req: Request,
    @Param('draftId') draftId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.whatif.previewDirector(this.owner(req), draftId, body);
  }

  @Post('api/story-drafts/:draftId/scenes/generate')
  generateScene(
    @Req() req: Request,
    @Param('draftId') draftId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.whatif.createSceneVideo(this.owner(req), draftId, body);
  }

  @Get('api/video-tasks/:taskId')
  getVideoTask(@Req() req: Request, @Param('taskId') taskId: string) {
    return this.whatif.getVideoTask(this.owner(req), taskId);
  }

  @Get('api/video-results/:taskId')
  getVideoResult(@Req() req: Request, @Param('taskId') taskId: string) {
    return this.whatif.getVideoResult(this.owner(req), taskId);
  }

  @Post('api/characters')
  createCharacter(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.whatif.createCharacter(this.owner(req), body);
  }

  @Get('api/characters/:characterId')
  getCharacter(@Req() req: Request, @Param('characterId') characterId: string) {
    return this.whatif.getCharacter(this.owner(req), characterId);
  }

  @Patch('api/characters/:characterId')
  updateCharacter(
    @Req() req: Request,
    @Param('characterId') characterId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.whatif.createCharacter(this.owner(req), { ...body, characterId });
  }

  @Get('api/me/characters')
  listCharacters(@Req() req: Request) {
    return this.whatif.listCharacters(this.owner(req));
  }

  @Post('api/character-assets/tasks')
  generateCharacterAsset(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.whatif.generateCharacterAsset(this.owner(req), body);
  }

  @Post('api/characters/:characterId/confirm-assets')
  confirmCharacterAssets(
    @Req() req: Request,
    @Param('characterId') characterId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.whatif.confirmCharacterAssets(this.owner(req), characterId, body);
  }

  @Post('api/worldviews')
  createWorldview(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.whatif.createWorldview(this.owner(req), body);
  }

  @Get('api/worldviews/:worldviewId')
  getWorldview(@Req() req: Request, @Param('worldviewId') worldviewId: string) {
    return this.whatif.getWorldview(this.owner(req), worldviewId);
  }

  @Get('api/works/:workId')
  getWork(@Req() req: Request, @Param('workId') workId: string) {
    return this.whatif.getWork(this.owner(req), workId);
  }

  @Get('api/stories')
  listStories(@Req() req: Request) {
    return this.whatif.listStories(this.owner(req));
  }

  @Get('api/stories/:storyId/timeline')
  getTimeline(@Req() req: Request, @Param('storyId') storyId: string) {
    return this.whatif.getTimeline(this.owner(req), storyId);
  }

  @Post('api/stories/:storyId/branches')
  createBranch(
    @Req() req: Request,
    @Param('storyId') storyId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.whatif.createBranch(this.owner(req), storyId, body);
  }

  @Post('api/stories/:storyId/publications')
  createPublication(
    @Req() req: Request,
    @Param('storyId') storyId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.whatif.createPublication(this.owner(req), storyId, body);
  }

  @Get('api/story-drafts/:draftId/invite-candidates')
  inviteCandidates() {
    return this.whatif.friendCandidates();
  }

  @Post('api/story-invitations')
  createInvitation(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.whatif.createInvitation(this.owner(req), body);
  }

  @Get('api/story-invitations/:invitationId')
  getInvitation(@Req() req: Request, @Param('invitationId') invitationId: string) {
    return this.whatif.getInvitation(this.owner(req), invitationId);
  }

  @Post('api/story-invitations/:invitationId/accept')
  acceptInvitation(@Req() req: Request, @Param('invitationId') invitationId: string) {
    return this.whatif.updateInvitation(this.owner(req), invitationId, 'accept');
  }

  @Post('api/story-invitations/:invitationId/reject')
  rejectInvitation(@Req() req: Request, @Param('invitationId') invitationId: string) {
    return this.whatif.updateInvitation(this.owner(req), invitationId, 'reject');
  }

  @Post('api/story-invitations/:invitationId/authorizations')
  authorizeInvitation(
    @Req() req: Request,
    @Param('invitationId') invitationId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.whatif.authorizeInvitation(this.owner(req), invitationId, body);
  }

  @Get('api/me/participated-stories')
  participatedStories(@Req() req: Request) {
    return this.whatif.participatedStories(this.owner(req));
  }
}
