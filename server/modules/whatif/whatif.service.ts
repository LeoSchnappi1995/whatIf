import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  FileService,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import {
  whatifAuthorizationSnapshots,
  whatifCharacterAssets,
  whatifCharacters,
  whatifDraftCharacters,
  whatifIdempotencyRecords,
  whatifInvitations,
  whatifPublications,
  whatifScenes,
  whatifStories,
  whatifStoryBranches,
  whatifStoryDrafts,
  whatifVideoTasks,
  whatifWorldviews,
} from '../../database/schema';
import { PROMPT_VERSIONS } from '../../prompts/whatif-prompt-registry';
import { WhatifAiService } from './whatif-ai.service';

const ASSET_BASE = 'assets/whatif';

const officialCharacters = [
  {
    characterId: 'official-jiangyu',
    name: '江屿',
    avatarUrl: `${ASSET_BASE}/jiangyu.png`,
    summary: '温柔克制 · 都市爱情',
    description: '27岁，深色短发，温柔克制，习惯把在意藏在行动里。',
    sourceType: 'official',
    badges: ['官方', '热门'],
    selectable: true,
    authorizationStatus: 'not_required',
    assetVersion: 8,
    assetViews: { identityFace: `${ASSET_BASE}/jiangyu.png`, bodyFront: `${ASSET_BASE}/jiangyu.png` },
  },
  {
    characterId: 'official-shenyan',
    name: '沈砚',
    avatarUrl: `${ASSET_BASE}/role-male-a.png`,
    summary: '冷静锋利 · 未来世界',
    description: '29岁，冷静敏锐，行动果断，深色短发。',
    sourceType: 'official',
    badges: ['官方'],
    selectable: true,
    authorizationStatus: 'not_required',
    assetVersion: 4,
    assetViews: { identityFace: `${ASSET_BASE}/role-male-a.png` },
  },
] as const;

const fallbackWorldviews = [
  { worldviewId: 'world-modern-romance', name: '现代都市', coverUrl: `${ASSET_BASE}/world-modern-romance.jpg`, atmosphere: '霓虹雨夜与错过的重逢', description: '当代城市中的关系故事。', stylePrompt: 'cinematic contemporary city, natural acting', recommended: true, available: true, assetVersion: 1 },
  { worldviewId: 'world-period-romance', name: '旧时代', coverUrl: `${ASSET_BASE}/world-period-romance.jpg`, atmosphere: '命运岔路上的同行与告别', description: '带有时代质感的命运故事。', stylePrompt: 'period romance, tactile production design', recommended: false, available: true, assetVersion: 1 },
  { worldviewId: 'world-future-parallel', name: '未来平行线', coverUrl: `${ASSET_BASE}/world-future.png`, atmosphere: '在另一个时间节点再次相遇', description: '科技与人性共存的未来城市。', stylePrompt: 'near-future Shanghai, grounded science fiction', recommended: false, available: true, assetVersion: 1 },
  { worldviewId: 'world-art-life', name: '文艺人生', coverUrl: `${ASSET_BASE}/world-art-story.jpg`, atmosphere: '共同完成未说出口的梦想', description: '围绕创作、遗憾与重新选择的人生故事。', stylePrompt: 'poetic slice of life, film texture', recommended: false, available: true, assetVersion: 1 },
];

const fallbackWorks = [
  ['work-001', '我们在城市尽头重逢', '都市 · 久别重逢', 'cinema.png', '小岛来信', 32841, 60],
  ['work-002', '穿越到唐朝', '古风 · 命运重写', 'anime.jpg', '晚风有信', 28712, 45],
  ['work-003', '和你错过的夏天', '青春 · 遗憾重逢', 'fresh.jpg', '林屿森', 24490, 30],
  ['work-004', '假如我们没有分开', '都市 · 雨夜重逢', 'retro.jpg', '江屿', 21305, 60],
  ['work-005', '2056 年的最后一封信', '未来 · 平行世界', 'cinema.png', '北辰', 19883, 45],
  ['work-006', '如果小狗会说话', '治愈 · 家庭日常', 'fresh.jpg', '毛球计划', 18672, 30],
  ['work-007', '成为魔法学院新生', '魔法 · 成长冒险', 'anime.jpg', '阿雾', 16942, 60],
  ['work-008', '醒来后世界只剩我们', '末日 · 双人逃生', 'retro.jpg', '重启日记', 15108, 45],
].map(([id, title, subtitle, cover, authorName, likeCount, durationSeconds]) => ({
  id: String(id),
  workId: String(id),
  title: String(title),
  subtitle: String(subtitle),
  coverUrl: `${ASSET_BASE}/${cover}`,
  authorName: String(authorName),
  avatarUrl: `${ASSET_BASE}/self.jpg`,
  likeCount: Number(likeCount),
  durationSeconds: Number(durationSeconds),
  canRemix: true,
  templateId: `template-${id}`,
}));

type AnyRecord = Record<string, any>;

@Injectable()
export class WhatifService {
  private readonly logger = new Logger(WhatifService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly files: FileService,
    private readonly ai: WhatifAiService,
  ) {}

  private id(prefix: string) {
    return `${prefix}_${randomUUID()}`;
  }

  private traceId() {
    return randomUUID();
  }

  private fail(code: string, message: string, status = 400, details?: unknown): never {
    throw new BadRequestException({ code, message, httpStatus: status, details });
  }

  private isMissingTable(error: unknown) {
    return String((error as { code?: unknown })?.code || '') === '42P01';
  }

  private async signed(path?: string | null) {
    if (!path) return '';
    if (/^https?:\/\//.test(path) || path.startsWith('data:image')) return path;
    try {
      return await this.files.createSignedUrl(path, 60 * 60 * 24 * 7);
    } catch {
      return path;
    }
  }

  private absoluteAssetUrl(path?: string | null) {
    if (!path) return '';
    if (/^https?:\/\//.test(path) || path.startsWith('data:image')) return path;
    const base = String(
      process.env.WHATIF_PUBLIC_BASE_URL ||
        'https://soulapp.feishuapp.com/app/app_17b2h3329qw',
    ).replace(/\/$/, '');
    return `${base}/${path.replace(/^\//, '')}`;
  }

  private async archiveRemote(url: string, prefix: string) {
    if (!/^https?:\/\//.test(url)) return url;
    const response = await fetch(url);
    if (!response.ok) throw this.fail('MEDIA_DOWNLOAD_FAILED', `媒体归档下载失败：${response.status}`, 502);
    const contentType = response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
    const extension = contentType.includes('video') ? 'mp4' : contentType.includes('png') ? 'png' : 'jpg';
    const uploaded = await this.files.upload(Buffer.from(await response.arrayBuffer()), {
      fileName: `${prefix}-${Date.now()}.${extension}`,
      contentType,
    });
    return uploaded.filePath;
  }

  async uploadImage(ownerId: string, file?: { buffer: Buffer; mimetype: string; size: number; originalname: string }) {
    if (!file?.buffer?.length) this.fail('UPLOAD_FILE_REQUIRED', '请选择需要上传的图片');
    if (!file.mimetype.startsWith('image/')) this.fail('UPLOAD_IMAGE_ONLY', '只支持上传图片文件');
    if (file.size > 12 * 1024 * 1024) this.fail('UPLOAD_IMAGE_TOO_LARGE', '单张图片不能超过 12MB');
    const extension = file.mimetype.includes('png') ? 'png' : file.mimetype.includes('webp') ? 'webp' : 'jpg';
    const uploaded = await this.files.upload(file.buffer, {
      fileName: `whatif-${ownerId}-${Date.now()}.${extension}`,
      contentType: file.mimetype,
    });
    return { filePath: uploaded.filePath, url: await this.signed(uploaded.filePath), traceId: this.traceId() };
  }

  private encodeCursor(offset: number) {
    return Buffer.from(String(offset)).toString('base64url');
  }

  private decodeCursor(cursor?: string) {
    if (!cursor) return 0;
    const value = Number(Buffer.from(cursor, 'base64url').toString('utf8'));
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  async getHome(ownerId: string) {
    let statusCard: AnyRecord | null = null;
    try {
      const [invitation] = await this.db.select().from(whatifInvitations)
        .where(and(eq(whatifInvitations.inviteeId, ownerId), eq(whatifInvitations.status, 'pending')))
        .orderBy(desc(whatifInvitations.updatedAt)).limit(1);
      const [task] = await this.db.select().from(whatifVideoTasks)
        .where(and(eq(whatifVideoTasks.ownerId, ownerId), inArray(whatifVideoTasks.status, ['submitting', 'queued', 'generating', 'quality_check', 'failed'])))
        .orderBy(desc(whatifVideoTasks.updatedAt)).limit(1);
      const [story] = await this.db.select().from(whatifStories)
        .where(eq(whatifStories.ownerId, ownerId)).orderBy(desc(whatifStories.updatedAt)).limit(1);
      const characters = await this.db.select().from(whatifCharacters)
        .where(and(eq(whatifCharacters.ownerId, ownerId), ne(whatifCharacters.status, 'deleted')))
        .orderBy(desc(whatifCharacters.updatedAt)).limit(3);
      if (invitation) {
        statusCard = { type: 'pending_invitation', eyebrow: '好友邀请', title: '好友邀请你加入故事', description: '确认人物形象和授权后即可参与', actionLabel: '处理邀请', targetPage: 'invitation', targetId: invitation.id };
      } else if (task) {
        statusCard = { type: task.status === 'failed' ? 'video_failed' : 'video_generating', eyebrow: task.status === 'failed' ? '生成失败' : '视频生成中', title: task.status === 'failed' ? '有一幕生成失败' : '你的 15 秒成片正在制作', description: task.errorMessage || this.stageLabel(task.stage), actionLabel: task.status === 'failed' ? '重新编辑' : '查看进度', progress: task.progress, targetPage: 'video_task', targetId: task.id };
      } else if (story) {
        statusCard = { type: 'continuable_story', eyebrow: '可续写故事', title: `继续：${story.title}`, description: '从上一幕结束状态继续创作', actionLabel: '继续创作', targetPage: 'timeline', targetId: story.id };
      } else if (characters.length) {
        statusCard = { type: 'character_default', title: '我的角色', description: `${characters.map((item) => item.name).join('、')} 已准备好`, actionLabel: '创建我的平行世界', targetPage: 'create', targetId: '' };
      } else {
        statusCard = { type: 'no_character', title: '还没有我的角色', description: '上传一张照片，AI 会补全稳定人物资产', actionLabel: '去创建', targetPage: 'character_new', targetId: '' };
      }
      statusCard.characters = await Promise.all(characters.map(async (item) => ({ id: item.id, name: item.name, avatarUrl: await this.signed(item.avatarPath), ownerType: 'self' })));
    } catch (error) {
      if (!this.isMissingTable(error)) throw error;
      this.logger.warn('Whatif tables are not migrated yet; homepage uses configuration fallback.');
    }
    const works = await this.feedWorks(0, 6);
    return {
      hero: { id: 'hero-rain-reunion', workId: 'work-001', title: '假如你和江屿在城市尽头重逢', subtitle: '都市爱情 · 久别重逢 · 第 1 幕 · 15 秒', coverUrl: `${ASSET_BASE}/cinema.png`, durationSeconds: 15 },
      statusCard: statusCard || { type: 'no_character', title: '开始创建你的平行世界', description: 'AI 自动完成专业分镜与 15 秒成片', actionLabel: '开始创作', characters: [] },
      works,
      nextCursor: this.encodeCursor(works.length),
      hasMore: fallbackWorks.length > works.length,
      traceId: this.traceId(),
    };
  }

  private async feedWorks(offset: number, pageSize: number) {
    try {
      const rows = await this.db.select().from(whatifPublications)
        .where(and(eq(whatifPublications.status, 'published'), eq(whatifPublications.visibility, 'public')))
        .orderBy(desc(whatifPublications.likeCount), desc(whatifPublications.updatedAt))
        .limit(pageSize).offset(offset);
      if (rows.length) return Promise.all(rows.map(async (row) => ({ id: row.id, workId: row.id, title: row.title, subtitle: row.summary || '连续剧情 · 15秒一幕', coverUrl: await this.signed(row.coverPath), videoUrl: await this.signed(row.videoPath), authorName: 'Whatif 创作者', avatarUrl: `${ASSET_BASE}/self.jpg`, likeCount: row.likeCount, durationSeconds: Math.max(15, (Array.isArray(row.sceneIds) ? row.sceneIds.length : 1) * 15), canRemix: row.canRemix, templateId: row.canRemix ? `publication:${row.id}` : undefined })));
    } catch (error) {
      if (!this.isMissingTable(error)) throw error;
    }
    return fallbackWorks.slice(offset, offset + pageSize);
  }

  async getWorks(cursor: string | undefined, requestedPageSize: number) {
    const pageSize = Math.min(Math.max(requestedPageSize || 6, 2), 10);
    const start = this.decodeCursor(cursor);
    const works = await this.feedWorks(start, pageSize);
    const next = start + works.length;
    return { works, nextCursor: this.encodeCursor(next), hasMore: works.length === pageSize, traceId: this.traceId() };
  }

  async createStoryDraft(ownerId: string, body: AnyRecord) {
    const mode = body.mode === 'remix' || body.source === 'work_remake' ? 'remix' : 'create';
    const idempotencyKey = String(body.idempotencyKey || randomUUID());
    const [existingKey] = await this.db.select().from(whatifIdempotencyRecords)
      .where(and(eq(whatifIdempotencyRecords.ownerId, ownerId), eq(whatifIdempotencyRecords.scope, 'create_story_draft'), eq(whatifIdempotencyRecords.idempotencyKey, idempotencyKey))).limit(1);
    if (existingKey) return existingKey.responseSnapshot;
    if (mode === 'create' && body.resumeExisting === true) {
      const [existing] = await this.db.select().from(whatifStoryDrafts)
        .where(and(eq(whatifStoryDrafts.ownerId, ownerId), eq(whatifStoryDrafts.status, 'editing')))
        .orderBy(desc(whatifStoryDrafts.updatedAt)).limit(1);
      if (existing) return { draftId: existing.id, draftSource: 'existing', nextPage: 'story_setting', traceId: this.traceId() };
    }
    let prefilledTitle = String(body.prefilledTitle || '');
    let prefilledSetting = String(body.prefilledSetting || '');
    let templateId = body.templateId || null;
    const sourceWorkId = String(body.sourceWorkId || body.workId || '');
    if (mode === 'remix' && sourceWorkId) {
      const [publication] = await this.db
        .select()
        .from(whatifPublications)
        .where(and(eq(whatifPublications.id, sourceWorkId), eq(whatifPublications.status, 'published')))
        .limit(1);
      if (publication?.canRemix) {
        const remix = publication.remixTemplate as AnyRecord;
        prefilledTitle ||= `我的版本 · ${publication.title}`;
        prefilledSetting ||= String(remix?.setting || '');
        templateId ||= `publication:${publication.id}`;
      } else {
        const fallback = fallbackWorks.find((item) => item.id === sourceWorkId);
        prefilledTitle ||= fallback ? `我的版本 · ${fallback.title}` : '我的平行版本';
        templateId ||= fallback?.templateId || null;
      }
    }
    const draftId = this.id('draft');
    const response = { draftId, draftSource: 'new', nextPage: 'story_setting', traceId: this.traceId() };
    await this.db.transaction(async (tx) => {
      await tx.insert(whatifStoryDrafts).values({
        id: draftId,
        ownerId,
        mode,
        sourceWorkId: sourceWorkId || null,
        templateId,
        title: prefilledTitle || (mode === 'remix' ? '我的平行版本' : '未命名故事'),
        setting: prefilledSetting,
        worldviewId: 'world-modern-romance',
        worldviewVersion: 1,
      });
      await tx.insert(whatifIdempotencyRecords).values({ id: this.id('idem'), ownerId, scope: 'create_story_draft', idempotencyKey, resourceId: draftId, responseSnapshot: response });
    });
    return response;
  }

  private async userCharacterCandidates(ownerId: string) {
    const rows = await this.db.select().from(whatifCharacters)
      .where(and(eq(whatifCharacters.ownerId, ownerId), ne(whatifCharacters.status, 'deleted')))
      .orderBy(desc(whatifCharacters.isSelf), desc(whatifCharacters.updatedAt));
    return Promise.all(rows.map(async (row) => {
      const assets = await this.db
        .select()
        .from(whatifCharacterAssets)
        .where(and(
          eq(whatifCharacterAssets.characterId, row.id),
          eq(whatifCharacterAssets.ownerId, ownerId),
          eq(whatifCharacterAssets.confirmed, true),
        ))
        .orderBy(desc(whatifCharacterAssets.createdAt));
      const assetViews = Object.fromEntries(
        await Promise.all(
          assets.map(async (asset) => [
            asset.kind,
            await this.signed(asset.imagePath),
          ]),
        ),
      );
      return {
        characterId: row.id,
        name: row.name,
        avatarUrl: await this.signed(row.avatarPath),
        summary: `${row.isSelf ? '故事里的我 · ' : ''}${row.description.slice(0, 18) || '我的角色'}`,
        description: row.description,
        sourceType: row.sourceType,
        badges: row.isSelf ? ['我'] : ['我的'],
        selectable: row.status === 'active' && Boolean(row.masterAssetId),
        unavailableReason: row.status === 'active' && row.masterAssetId ? '' : '需先确认身份脸与全身形象',
        authorizationStatus: 'not_required',
        assetVersion: row.currentVersion,
        masterAssetId: row.masterAssetId,
        assetViews: {
          identityFace: assetViews['identity-face'] || '',
          bodyFront: assetViews['body-front'] || '',
          bodyLeft: assetViews['body-left'] || '',
          bodyRight: assetViews['body-right'] || '',
          bodyBack: assetViews['body-back'] || '',
        },
      };
    }));
  }

  private async worldviewOptions(ownerId: string) {
    try {
      const rows = await this.db.select().from(whatifWorldviews)
        .where(and(inArray(whatifWorldviews.ownerId, ['system', ownerId]), eq(whatifWorldviews.status, 'active')))
        .orderBy(desc(whatifWorldviews.ownerId), desc(whatifWorldviews.updatedAt));
      if (rows.length) return Promise.all(rows.map(async (row, index) => ({ worldviewId: row.id, name: row.name, coverUrl: await this.signed(row.coverPath), atmosphere: row.atmosphere, description: row.description, stylePrompt: row.stylePrompt, recommended: index === 0, available: true, assetVersion: row.currentVersion })));
    } catch (error) {
      if (!this.isMissingTable(error)) throw error;
    }
    return fallbackWorldviews;
  }

  async getCastSetting(ownerId: string, draftId: string) {
    const [draft] = await this.db.select().from(whatifStoryDrafts)
      .where(and(eq(whatifStoryDrafts.id, draftId), eq(whatifStoryDrafts.ownerId, ownerId))).limit(1);
    if (!draft) throw new NotFoundException({ code: 'DRAFT_NOT_FOUND', message: '故事草稿不存在或已失效' });
    const selected = await this.db.select().from(whatifDraftCharacters)
      .where(and(eq(whatifDraftCharacters.draftId, draftId), eq(whatifDraftCharacters.ownerId, ownerId)))
      .orderBy(whatifDraftCharacters.sortOrder);
    const candidates = [...await this.userCharacterCandidates(ownerId), ...officialCharacters];
    const worldviews = await this.worldviewOptions(ownerId);
    return {
      draftId,
      draftVersion: draft.version,
      storyTitle: draft.title,
      storySetting: draft.setting,
      maxCharacterCount: 3,
      characters: candidates,
      characterItems: candidates,
      selectedCharacterIds: selected.map((item) => item.characterId),
      worldviews,
      worldviewItems: worldviews,
      selectedWorldviewId: draft.worldviewId,
      canProceed: selected.length > 0 && Boolean(draft.worldviewId),
      validationMessage: selected.length && draft.worldviewId ? null : '至少选择 1 个角色和 1 个世界观',
      nextCursor: '',
      hasMore: false,
      traceId: this.traceId(),
    };
  }

  async updateCastSetting(ownerId: string, draftId: string, body: AnyRecord) {
    const ids = Array.from(new Set((Array.isArray(body.characterIds) ? body.characterIds : []).map(String))).slice(0, 4);
    if (ids.length > 3) this.fail('CHARACTER_LIMIT_EXCEEDED', '最多选择 3 个角色');
    const [draft] = await this.db.select().from(whatifStoryDrafts)
      .where(and(eq(whatifStoryDrafts.id, draftId), eq(whatifStoryDrafts.ownerId, ownerId))).limit(1);
    if (!draft) throw new NotFoundException({ code: 'DRAFT_NOT_FOUND', message: '故事草稿不存在' });
    if (Number(body.draftVersion) !== draft.version) this.fail('DRAFT_VERSION_CONFLICT', '草稿已在其他页面更新，请刷新后重试', 409);
    const allCandidates = [...await this.userCharacterCandidates(ownerId), ...officialCharacters];
    const chosen = ids.map((id) => allCandidates.find((item) => item.characterId === id)).filter(Boolean) as AnyRecord[];
    if (chosen.length !== ids.length || chosen.some((item) => !item.selectable)) this.fail('CHARACTER_UNAVAILABLE', '选择中包含不可用角色，请重新选择');
    const worldviews = await this.worldviewOptions(ownerId);
    const worldview = worldviews.find((item) => item.worldviewId === body.worldviewId);
    const storyTitle = String(body.storyTitle || draft.title || '').trim();
    if (body.confirm && (!storyTitle || storyTitle === '未命名故事')) this.fail('STORY_TITLE_REQUIRED', '请先给故事起一个名字');
    if (body.confirm && (!chosen.length || !worldview)) this.fail('CAST_SETTING_INCOMPLETE', '至少选择 1 个可用角色和 1 个世界观');
    const nextVersion = draft.version + 1;
    await this.db.transaction(async (tx) => {
      await tx.delete(whatifDraftCharacters).where(and(eq(whatifDraftCharacters.draftId, draftId), eq(whatifDraftCharacters.ownerId, ownerId)));
      if (chosen.length) await tx.insert(whatifDraftCharacters).values(chosen.map((item, index) => ({ id: this.id('draft_cast'), draftId, ownerId, characterId: item.characterId, characterVersion: item.assetVersion, sourceType: item.sourceType, sortOrder: index, assetSnapshot: item })));
      await tx.update(whatifStoryDrafts).set({ title: storyTitle.slice(0, 160) || draft.title, worldviewId: worldview?.worldviewId || null, worldviewVersion: worldview?.assetVersion || null, version: nextVersion, updatedAt: new Date() }).where(eq(whatifStoryDrafts.id, draftId));
    });
    return { draftId, draftVersion: nextVersion, selectedCharacterIds: ids, selectedWorldviewId: worldview?.worldviewId || null, removedCharacterIds: [], canProceed: chosen.length > 0 && Boolean(worldview), nextPage: body.confirm ? 'scene_description' : null, traceId: this.traceId() };
  }

  async updateStorySetting(ownerId: string, draftId: string, body: AnyRecord) {
    const title = String(body.title || '').trim();
    if (!title) this.fail('STORY_TITLE_REQUIRED', '请先给故事起一个名字');
    await this.db.update(whatifStoryDrafts).set({ title: title.slice(0, 160), setting: String(body.setting || '').slice(0, 1000), relationship: String(body.relationship || '').slice(0, 500), updatedAt: new Date() }).where(and(eq(whatifStoryDrafts.id, draftId), eq(whatifStoryDrafts.ownerId, ownerId)));
    return { saved: true, traceId: this.traceId() };
  }

  async createCharacter(ownerId: string, body: AnyRecord) {
    const name = String(body.name || '').trim();
    if (!name) this.fail('CHARACTER_NAME_REQUIRED', '请输入角色名称');
    const id = String(body.characterId || this.id('character'));
    if (body.isSelf) await this.db.update(whatifCharacters).set({ isSelf: false, updatedAt: new Date() }).where(and(eq(whatifCharacters.ownerId, ownerId), eq(whatifCharacters.isSelf, true)));
    const [existing] = await this.db.select().from(whatifCharacters).where(and(eq(whatifCharacters.id, id), eq(whatifCharacters.ownerId, ownerId))).limit(1);
    if (existing) await this.db.update(whatifCharacters).set({ name, description: String(body.description || '').slice(0, 500), isSelf: Boolean(body.isSelf), visibility: body.visibility === 'public' ? 'public' : 'private', currentVersion: existing.currentVersion + 1, updatedAt: new Date() }).where(eq(whatifCharacters.id, id));
    else await this.db.insert(whatifCharacters).values({ id, ownerId, name, description: String(body.description || '').slice(0, 500), isSelf: Boolean(body.isSelf), visibility: body.visibility === 'public' ? 'public' : 'private', sourceType: 'custom', status: 'draft' });
    return { characterId: id, traceId: this.traceId() };
  }

  async getCharacter(ownerId: string, characterId: string) {
    const [character] = await this.db.select().from(whatifCharacters).where(and(eq(whatifCharacters.id, characterId), eq(whatifCharacters.ownerId, ownerId))).limit(1);
    if (!character) throw new NotFoundException({ code: 'CHARACTER_NOT_FOUND', message: '角色不存在' });
    const assets = await this.db.select().from(whatifCharacterAssets).where(and(eq(whatifCharacterAssets.characterId, characterId), eq(whatifCharacterAssets.ownerId, ownerId))).orderBy(desc(whatifCharacterAssets.createdAt));
    return { ...character, avatarUrl: await this.signed(character.avatarPath), assets: await Promise.all(assets.map(async (asset) => ({ ...asset, assetId: asset.id, imageUrl: await this.signed(asset.imagePath) }))), traceId: this.traceId() };
  }

  async listCharacters(ownerId: string) {
    return { items: await this.userCharacterCandidates(ownerId), traceId: this.traceId() };
  }

  async generateCharacterAsset(ownerId: string, body: AnyRecord) {
    const characterId = String(body.characterId || '');
    const [character] = await this.db.select().from(whatifCharacters).where(and(eq(whatifCharacters.id, characterId), eq(whatifCharacters.ownerId, ownerId))).limit(1);
    if (!character) throw new NotFoundException({ code: 'CHARACTER_NOT_FOUND', message: '请先保存角色名称和描写' });
    const profile = await this.ai.buildCharacterProfile({ name: character.name, description: character.description });
    const generated = await this.ai.generateCharacterAsset({ name: character.name, description: profile.stableDescription, identityAnchors: profile.identityAnchors, kind: String(body.kind || 'identity-face'), instruction: String(body.instruction || ''), referenceImages: Array.isArray(body.referenceImages) ? body.referenceImages.map(String) : [], previousAsset: String(body.previousAsset || '') });
    const imagePath = await this.archiveRemote(generated.imageUrl, `${characterId}-${body.kind || 'asset'}`);
    const assetId = this.id('character_asset');
    await this.db.insert(whatifCharacterAssets).values({ id: assetId, characterId, ownerId, version: character.currentVersion, kind: String(body.kind || 'identity-face'), status: 'ready', referencePaths: body.referenceImages || [], imagePath, promptVersion: generated.promptVersion, modelTraceId: generated.traceId, confirmed: false });
    return { taskId: assetId, status: 'success', assetId, imageUrl: await this.signed(imagePath), profile, traceId: generated.traceId };
  }

  async confirmCharacterAssets(ownerId: string, characterId: string, body: AnyRecord) {
    const assetIds = Array.from(new Set((Array.isArray(body.assetIds) ? body.assetIds : []).map(String)));
    if (!assetIds.length) this.fail('CHARACTER_ASSET_REQUIRED', '请确认身份脸和至少一张全身形象');
    const assets = await this.db.select().from(whatifCharacterAssets).where(and(eq(whatifCharacterAssets.ownerId, ownerId), eq(whatifCharacterAssets.characterId, characterId), inArray(whatifCharacterAssets.id, assetIds)));
    if (assets.length !== assetIds.length || assets.some((item) => item.status !== 'ready' || !item.imagePath)) this.fail('CHARACTER_ASSET_INVALID', '人物资产不存在或尚未生成完成');
    const kinds = new Set(assets.map((item) => item.kind));
    if (!kinds.has('identity-face') || !kinds.has('body-front')) this.fail('CHARACTER_MASTER_INCOMPLETE', '需要同时确认身份脸和正面全身形象');
    const identity = assets.find((item) => item.kind === 'identity-face')!;
    await this.db.transaction(async (tx) => {
      await tx.update(whatifCharacterAssets).set({ confirmed: true, updatedAt: new Date() }).where(and(eq(whatifCharacterAssets.ownerId, ownerId), inArray(whatifCharacterAssets.id, assetIds)));
      await tx.update(whatifCharacters).set({ masterAssetId: identity.id, avatarPath: identity.imagePath, status: 'active', updatedAt: new Date() }).where(and(eq(whatifCharacters.id, characterId), eq(whatifCharacters.ownerId, ownerId)));
    });
    return { confirmed: true, characterId, traceId: this.traceId() };
  }

  async createWorldview(ownerId: string, body: AnyRecord) {
    const requestedId = String(body.worldviewId || '');
    const sourceWorldviewId = String(body.sourceWorldviewId || '');
    const id = requestedId && (requestedId.startsWith('world-user_') || requestedId.startsWith('world-user-')) ? requestedId : this.id('world-user');
    const name = String(body.name || '').trim();
    if (!name) this.fail('WORLDVIEW_NAME_REQUIRED', '请输入世界观名称');
    const generated = body.generateImage === false ? null : await this.ai.generateWorldviewImage({ name, description: String(body.description || ''), instruction: String(body.instruction || ''), referenceImages: Array.isArray(body.referenceImages) ? body.referenceImages.map(String) : [] });
    const coverPath = generated ? await this.archiveRemote(generated.imageUrl, `${id}-world`) : String(body.coverPath || '');
    const [existing] = await this.db.select().from(whatifWorldviews).where(and(eq(whatifWorldviews.id, id), eq(whatifWorldviews.ownerId, ownerId))).limit(1);
    const values = { name, description: String(body.description || ''), atmosphere: String(body.atmosphere || body.description || '').slice(0, 300), stylePrompt: String(body.stylePrompt || body.description || '').slice(0, 1200), coverPath, visibility: body.visibility === 'public' ? 'public' : 'private', status: 'active', updatedAt: new Date() };
    if (existing) await this.db.update(whatifWorldviews).set({ ...values, currentVersion: existing.currentVersion + 1 }).where(eq(whatifWorldviews.id, id));
    else await this.db.insert(whatifWorldviews).values({ id, ownerId, ...values });
    return { worldviewId: id, sourceWorldviewId: sourceWorldviewId || undefined, coverUrl: await this.signed(coverPath), traceId: generated?.traceId || this.traceId() };
  }

  async getWorldview(ownerId: string, worldviewId: string) {
    const [worldview] = await this.db
      .select()
      .from(whatifWorldviews)
      .where(and(eq(whatifWorldviews.id, worldviewId), inArray(whatifWorldviews.ownerId, ['system', ownerId])))
      .limit(1);
    if (!worldview) throw new NotFoundException({ code: 'WORLDVIEW_NOT_FOUND', message: '世界观不存在' });
    return {
      ...worldview,
      worldviewId: worldview.id,
      coverUrl: await this.signed(worldview.coverPath),
      editable: worldview.ownerId === ownerId,
      editMode: worldview.ownerId === ownerId ? 'update' : 'copy',
      traceId: this.traceId(),
    };
  }

  private async draftContext(ownerId: string, draftId: string) {
    const [draft] = await this.db.select().from(whatifStoryDrafts).where(and(eq(whatifStoryDrafts.id, draftId), eq(whatifStoryDrafts.ownerId, ownerId))).limit(1);
    if (!draft) throw new NotFoundException({ code: 'DRAFT_NOT_FOUND', message: '故事草稿不存在' });
    const casts = await this.db.select().from(whatifDraftCharacters).where(and(eq(whatifDraftCharacters.draftId, draftId), eq(whatifDraftCharacters.ownerId, ownerId))).orderBy(whatifDraftCharacters.sortOrder);
    const worldviews = await this.worldviewOptions(ownerId);
    const worldview = worldviews.find((item) => item.worldviewId === draft.worldviewId);
    return { draft, casts: casts.map((item) => item.assetSnapshot as AnyRecord), worldview };
  }

  async getSceneEditor(ownerId: string, draftId: string, parentSceneId?: string) {
    const context = await this.draftContext(ownerId, draftId);
    let previous: AnyRecord | null = null;
    if (parentSceneId) {
      const [scene] = await this.db.select().from(whatifScenes).where(and(eq(whatifScenes.id, parentSceneId), eq(whatifScenes.ownerId, ownerId))).limit(1);
      if (scene) previous = { id: scene.id, title: scene.title, summary: (scene.directorPlan as AnyRecord)?.summary, continuityOut: (scene.directorPlan as AnyRecord)?.continuityOut };
    }
    return { draftId, story: { title: context.draft.title, setting: context.draft.setting, relationship: context.draft.relationship }, characters: context.casts, worldview: context.worldview, sceneDraft: context.draft.latestSceneDraft, previous, priceSob: 15, aiDefaults: ['人物本幕造型', '场景与关键道具', '专业分镜', '对白与声音', '镜头节奏'], traceId: this.traceId() };
  }

  async previewDirector(ownerId: string, draftId: string, body: AnyRecord) {
    const context = await this.draftContext(ownerId, draftId);
    const script = String(body.script || '').trim();
    if (!script) this.fail('SCENE_SCRIPT_REQUIRED', '请描述这一幕发生什么');
    let previous: AnyRecord | null = null;
    if (body.parentSceneId) {
      const [scene] = await this.db.select().from(whatifScenes).where(and(eq(whatifScenes.id, String(body.parentSceneId)), eq(whatifScenes.ownerId, ownerId))).limit(1);
      previous = scene ? { title: scene.title, summary: (scene.directorPlan as AnyRecord)?.summary, continuityOut: (scene.directorPlan as AnyRecord)?.continuityOut } : null;
    }
    const plan = await this.ai.directScene({ script, story: { title: context.draft.title, setting: context.draft.setting, relationship: context.draft.relationship, worldview: context.worldview }, characters: context.casts, previous, userRefinements: body.refinements || {} });
    const latestSceneDraft = { script, directorPlan: plan, parentSceneId: body.parentSceneId || null, updatedAt: new Date().toISOString() };
    await this.db.update(whatifStoryDrafts).set({ latestSceneDraft, updatedAt: new Date() }).where(eq(whatifStoryDrafts.id, draftId));
    return { directorPlan: plan, traceId: this.traceId() };
  }

  private async ensureStory(ownerId: string, draftId: string, requestedBranchId?: string) {
    const [existing] = await this.db.select().from(whatifStories).where(and(eq(whatifStories.sourceDraftId, draftId), eq(whatifStories.ownerId, ownerId))).limit(1);
    if (existing) {
      const [branch] = requestedBranchId
        ? await this.db.select().from(whatifStoryBranches).where(and(eq(whatifStoryBranches.id, requestedBranchId), eq(whatifStoryBranches.storyId, existing.id), eq(whatifStoryBranches.ownerId, ownerId))).limit(1)
        : await this.db.select().from(whatifStoryBranches).where(and(eq(whatifStoryBranches.storyId, existing.id), eq(whatifStoryBranches.ownerId, ownerId))).orderBy(whatifStoryBranches.createdAt).limit(1);
      if (!branch) this.fail('STORY_BRANCH_NOT_FOUND', '故事分支不存在或已失效', 404);
      return { story: existing, branch };
    }
    const context = await this.draftContext(ownerId, draftId);
    const storyId = this.id('story');
    const branchId = this.id('branch');
    await this.db.transaction(async (tx) => {
      await tx.insert(whatifStories).values({ id: storyId, ownerId, sourceDraftId: draftId, title: context.draft.title, setting: context.draft.setting, worldviewSnapshot: context.worldview || {}, characterSnapshots: context.casts, activeBranchId: branchId });
      await tx.insert(whatifStoryBranches).values({ id: branchId, storyId, ownerId, label: '主故事线' });
    });
    return { story: { id: storyId, title: context.draft.title, setting: context.draft.setting, characterSnapshots: context.casts, worldviewSnapshot: context.worldview }, branch: { id: branchId } };
  }

  private referenceUrlsFromSnapshots(characters: AnyRecord[], worldview: AnyRecord) {
    const selected: string[] = [];
    for (const [index, character] of characters.entries()) {
      const identity = character.assetViews?.identityFace || character.avatarUrl;
      const body = character.assetViews?.bodyFront;
      if (identity) selected.push(this.absoluteAssetUrl(String(identity)));
      if (index === 0 && body) selected.push(this.absoluteAssetUrl(String(body)));
    }
    if (worldview?.coverUrl) selected.push(this.absoluteAssetUrl(String(worldview.coverUrl)));
    return Array.from(new Set(selected.filter((value) => /^https?:\/\//.test(value)))).slice(0, 4);
  }

  private async previousScene(ownerId: string, parentSceneId?: string) {
    if (!parentSceneId) return null;
    const [scene] = await this.db.select().from(whatifScenes).where(and(eq(whatifScenes.id, parentSceneId), eq(whatifScenes.ownerId, ownerId))).limit(1);
    return scene ? { id: scene.id, title: scene.title, summary: (scene.directorPlan as AnyRecord)?.summary, continuityOut: (scene.directorPlan as AnyRecord)?.continuityOut, sequence: scene.sequence, branchId: scene.branchId } : null;
  }

  async createSceneVideo(ownerId: string, draftId: string, body: AnyRecord) {
    const context = await this.draftContext(ownerId, draftId);
    const script = String(body.script || '').trim();
    if (!script) this.fail('SCENE_SCRIPT_REQUIRED', '请描述这一幕发生什么');
    const previous = await this.previousScene(ownerId, body.parentSceneId ? String(body.parentSceneId) : undefined);
    const directorPlan = body.directorPlan && Array.isArray(body.directorPlan.shots) ? body.directorPlan : await this.ai.directScene({ script, story: { title: context.draft.title, setting: context.draft.setting, relationship: context.draft.relationship, worldview: context.worldview }, characters: context.casts, previous });
    if (directorPlan.capacity?.status === 'overflow' && body.force !== true) this.fail('SCENE_CAPACITY_OVERFLOW', directorPlan.capacity.message || '这一幕超过 15 秒，请缩短或拆成两幕', 422, { suggestedScript: directorPlan.capacity.suggestedScript });
    const compilation = await this.ai.compileSeedance({ story: { title: context.draft.title, setting: context.draft.setting, worldview: context.worldview }, characters: context.casts, directorPlan, previous, userScript: script });
    const requestedBranchId = body.branchId ? String(body.branchId) : undefined;
    const { story, branch } = await this.ensureStory(ownerId, draftId, requestedBranchId);
    const scenes = await this.db.select().from(whatifScenes).where(and(eq(whatifScenes.storyId, story.id), eq(whatifScenes.branchId, branch.id)));
    const sequence = scenes.length ? Math.max(...scenes.map((scene) => scene.sequence)) + 1 : Number(previous?.sequence || 0) + 1;
    const sceneId = this.id('scene');
    const taskId = this.id('video_task');
    const traceId = this.traceId();
    await this.db.transaction(async (tx) => {
      await tx.insert(whatifScenes).values({ id: sceneId, storyId: story.id, branchId: branch.id, ownerId, parentSceneId: body.parentSceneId || scenes.at(-1)?.id || null, sequence, title: String(directorPlan.title || `第${sequence}幕`), userScript: script, directorPlan, seedancePrompt: compilation.prompt, continuitySnapshot: directorPlan.continuityOut || {}, status: 'submitting' });
      await tx.insert(whatifVideoTasks).values({ id: taskId, sceneId, storyId: story.id, ownerId, model: this.ai.configSummary().video.model, promptVersion: compilation.promptVersion, status: 'submitting', stage: 'submitting', progress: 12, requestSnapshot: { script, directorPlan, compilation, characters: context.casts, worldview: context.worldview }, traceId });
      await tx.update(whatifStories).set({ activeBranchId: branch.id, updatedAt: new Date() }).where(eq(whatifStories.id, story.id));
    });
    try {
      const referenceImages = this.referenceUrlsFromSnapshots(context.casts, context.worldview);
      const created = await this.ai.createVideo({ prompt: `${compilation.prompt}\nNegative constraints: ${compilation.negativePrompt}`, referenceImages, copyrightSafePrompt: `${compilation.prompt}\nAll people are original fictional adults. Use stylized cinematic animation if any identity reference is unsafe.` });
      await this.db.transaction(async (tx) => {
        await tx.update(whatifVideoTasks).set({ providerTaskId: created.providerTaskId, status: 'queued', stage: 'model_generating', progress: 22, inputMode: created.inputMode, responseSnapshot: created.raw, updatedAt: new Date() }).where(eq(whatifVideoTasks.id, taskId));
        await tx.update(whatifScenes).set({ status: 'generating', updatedAt: new Date() }).where(eq(whatifScenes.id, sceneId));
        await tx.update(whatifStoryDrafts).set({ latestSceneDraft: {}, updatedAt: new Date() }).where(eq(whatifStoryDrafts.id, draftId));
      });
      return { taskId, sceneId, storyId: story.id, branchId: branch.id, status: 'queued', nextPage: 'video_generating', traceId };
    } catch (error) {
      const code = String((error as { response?: { code?: unknown }; code?: unknown })?.response?.code || (error as { code?: unknown })?.code || 'VIDEO_SUBMIT_FAILED');
      const message = error instanceof Error ? error.message : '视频任务提交失败';
      await this.db.transaction(async (tx) => {
        await tx.update(whatifVideoTasks).set({ status: 'failed', stage: 'failed', progress: 100, errorCode: code, errorMessage: message, updatedAt: new Date() }).where(eq(whatifVideoTasks.id, taskId));
        await tx.update(whatifScenes).set({ status: 'failed', chargeStatus: 'not_charged', updatedAt: new Date() }).where(eq(whatifScenes.id, sceneId));
      });
      throw error;
    }
  }

  private stageLabel(stage: string) {
    return ({ directing: 'AI 正在完成专业分镜', submitting: '正在提交视频任务', model_generating: 'Seedance 正在生成画面与声音', quality_check: '正在检查人物、动作和声音', archiving: '正在保存成片', completed: '成片已完成' } as Record<string, string>)[stage] || '正在制作你的 15 秒故事';
  }

  private mapProgress(status: string, previous: number) {
    if (['succeeded', 'success', 'completed', 'done', 'finished'].includes(status)) return 96;
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) return 100;
    return Math.min(88, Math.max(previous + 4, 28));
  }

  async getVideoTask(ownerId: string, taskId: string) {
    const [task] = await this.db.select().from(whatifVideoTasks).where(and(eq(whatifVideoTasks.id, taskId), eq(whatifVideoTasks.ownerId, ownerId))).limit(1);
    if (!task) throw new NotFoundException({ code: 'VIDEO_TASK_NOT_FOUND', message: '视频任务不存在' });
    let current = task;
    if (task.providerTaskId && !['success', 'failed'].includes(task.status)) {
      try {
        const upstream = await this.ai.getVideoStatus(task.providerTaskId);
        const done = Boolean(upstream.videoUrl) || ['succeeded', 'success', 'completed', 'done', 'finished'].includes(upstream.status);
        const failed = ['failed', 'error', 'cancelled', 'canceled'].includes(upstream.status);
        if (done && upstream.videoUrl) {
          await this.db.update(whatifVideoTasks).set({ status: 'quality_check', stage: 'archiving', progress: 96, responseSnapshot: upstream.raw, updatedAt: new Date() }).where(eq(whatifVideoTasks.id, task.id));
          let videoPath = upstream.videoUrl;
          let archiveWarning = '';
          try {
            videoPath = await this.archiveRemote(upstream.videoUrl, `${task.sceneId}-video`);
          } catch (archiveError) {
            archiveWarning = archiveError instanceof Error ? archiveError.message : '成片归档失败，暂时使用模型地址';
            this.logger.warn(`video archive fallback: ${archiveWarning}`);
          }
          await this.db.transaction(async (tx) => {
            await tx.update(whatifVideoTasks).set({ status: 'success', stage: 'completed', progress: 100, videoPath, responseSnapshot: upstream.raw, qaResult: { status: archiveWarning ? 'passed_with_warning' : 'passed', warning: archiveWarning || undefined, checks: ['provider_completed', 'video_url_present', 'duration_requested_15s', 'audio_requested'] }, updatedAt: new Date() }).where(eq(whatifVideoTasks.id, task.id));
            await tx.update(whatifScenes).set({ status: 'success', selectedResultId: task.id, chargeStatus: 'charged', updatedAt: new Date() }).where(eq(whatifScenes.id, task.sceneId));
          });
        } else if (failed) {
          const errorMessage = upstream.error || 'Seedance 返回失败，但没有错误详情';
          await this.db.transaction(async (tx) => {
            await tx.update(whatifVideoTasks).set({ status: 'failed', stage: 'failed', progress: 100, errorCode: 'SEEDANCE_TASK_FAILED', errorMessage, responseSnapshot: upstream.raw, updatedAt: new Date() }).where(eq(whatifVideoTasks.id, task.id));
            await tx.update(whatifScenes).set({ status: 'failed', chargeStatus: 'not_charged', updatedAt: new Date() }).where(eq(whatifScenes.id, task.sceneId));
          });
        } else {
          await this.db.update(whatifVideoTasks).set({ status: 'generating', stage: 'model_generating', progress: this.mapProgress(upstream.status, task.progress), responseSnapshot: upstream.raw, updatedAt: new Date() }).where(eq(whatifVideoTasks.id, task.id));
        }
        [current] = await this.db.select().from(whatifVideoTasks).where(eq(whatifVideoTasks.id, task.id)).limit(1);
      } catch (error) {
        const code = String((error as { code?: unknown })?.code || 'VIDEO_STATUS_REFRESH_FAILED');
        const message = error instanceof Error ? error.message : String(error);
        const nonRetryable = /HTTP_(400|401|403|404)$/.test(code);
        this.logger.warn(`refresh video task failed: ${message}`);
        await this.db.update(whatifVideoTasks).set({ status: nonRetryable ? 'failed' : task.status, stage: nonRetryable ? 'failed' : task.stage, progress: nonRetryable ? 100 : task.progress, errorCode: code, errorMessage: message, updatedAt: new Date() }).where(eq(whatifVideoTasks.id, task.id));
        if (nonRetryable) await this.db.update(whatifScenes).set({ status: 'failed', chargeStatus: 'not_charged', updatedAt: new Date() }).where(eq(whatifScenes.id, task.sceneId));
        [current] = await this.db.select().from(whatifVideoTasks).where(eq(whatifVideoTasks.id, task.id)).limit(1);
      }
    }
    const [scene] = await this.db.select().from(whatifScenes).where(eq(whatifScenes.id, current.sceneId)).limit(1);
    const [story] = await this.db.select().from(whatifStories).where(eq(whatifStories.id, current.storyId)).limit(1);
    return { taskId: current.id, sceneId: current.sceneId, storyId: current.storyId, draftId: story?.sourceDraftId, storyTitle: story?.title, sceneTitle: scene?.title, userScript: scene?.userScript, directorPlan: scene?.directorPlan, status: current.status, stage: current.stage, stageLabel: this.stageLabel(current.stage), progress: current.progress, videoUrl: await this.signed(current.videoPath), errorCode: current.errorCode, errorMessage: current.errorMessage, chargeStatus: scene?.chargeStatus, priceSob: scene?.priceSob || 15, traceId: current.traceId || this.traceId() };
  }

  async getVideoResult(ownerId: string, taskId: string) {
    const result = await this.getVideoTask(ownerId, taskId);
    if (result.status !== 'success') return result;
    return { ...result, actions: ['continue', 'regenerate', 'timeline', 'publish'], traceId: this.traceId() };
  }

  async listStories(ownerId: string) {
    const stories = await this.db.select().from(whatifStories).where(eq(whatifStories.ownerId, ownerId)).orderBy(desc(whatifStories.updatedAt));
    const items = await Promise.all(stories.map(async (story) => {
      const scenes = await this.db.select().from(whatifScenes).where(eq(whatifScenes.storyId, story.id)).orderBy(whatifScenes.sequence);
      return { storyId: story.id, title: story.title, setting: story.setting, coverUrl: await this.signed(story.coverPath), status: story.status, sceneCount: scenes.length, completedSceneCount: scenes.filter((scene) => scene.status === 'success').length, latestScene: scenes.at(-1) || null, updatedAt: story.updatedAt };
    }));
    return { items, traceId: this.traceId() };
  }

  async getTimeline(ownerId: string, storyId: string) {
    const [story] = await this.db.select().from(whatifStories).where(and(eq(whatifStories.id, storyId), eq(whatifStories.ownerId, ownerId))).limit(1);
    if (!story) throw new NotFoundException({ code: 'STORY_NOT_FOUND', message: '故事不存在' });
    const branches = await this.db.select().from(whatifStoryBranches).where(eq(whatifStoryBranches.storyId, storyId)).orderBy(whatifStoryBranches.createdAt);
    const scenes = await this.db.select().from(whatifScenes).where(eq(whatifScenes.storyId, storyId)).orderBy(whatifScenes.sequence, whatifScenes.createdAt);
    const tasks = scenes.length ? await this.db.select().from(whatifVideoTasks).where(inArray(whatifVideoTasks.sceneId, scenes.map((scene) => scene.id))).orderBy(desc(whatifVideoTasks.createdAt)) : [];
    return { story: { ...story, coverUrl: await this.signed(story.coverPath) }, branches, scenes: await Promise.all(scenes.map(async (scene) => { const task = tasks.find((item) => item.id === scene.selectedResultId) || tasks.find((item) => item.sceneId === scene.id); return { ...scene, videoTaskId: task?.id, videoUrl: await this.signed(task?.videoPath), errorCode: task?.errorCode, errorMessage: task?.errorMessage }; })), traceId: this.traceId() };
  }

  async createBranch(ownerId: string, storyId: string, body: AnyRecord) {
    const [story] = await this.db.select().from(whatifStories).where(and(eq(whatifStories.id, storyId), eq(whatifStories.ownerId, ownerId))).limit(1);
    if (!story) throw new NotFoundException({ code: 'STORY_NOT_FOUND', message: '故事不存在' });
    const parentSceneId = String(body.parentSceneId || '');
    if (!parentSceneId) this.fail('BRANCH_PARENT_REQUIRED', '请选择从哪一幕创建分支');
    const [parentScene] = await this.db.select().from(whatifScenes).where(and(eq(whatifScenes.id, parentSceneId), eq(whatifScenes.storyId, storyId), eq(whatifScenes.ownerId, ownerId))).limit(1);
    if (!parentScene) this.fail('BRANCH_PARENT_INVALID', '分支起点不存在', 404);
    const branchId = this.id('branch');
    await this.db.insert(whatifStoryBranches).values({ id: branchId, storyId, ownerId, parentSceneId, label: String(body.label || '新的故事线') });
    return { branchId, traceId: this.traceId() };
  }

  async createPublication(ownerId: string, storyId: string, body: AnyRecord) {
    const timeline = await this.getTimeline(ownerId, storyId);
    const selectedIds = Array.isArray(body.sceneIds) && body.sceneIds.length ? body.sceneIds.map(String) : timeline.scenes.filter((scene) => scene.status === 'success').map((scene) => scene.id);
    const selected = timeline.scenes.filter((scene) => selectedIds.includes(scene.id) && scene.status === 'success');
    if (!selected.length) this.fail('PUBLICATION_SCENE_REQUIRED', '至少选择一幕已完成视频');
    const validSelectedIds = selected.map((scene) => scene.id);
    const copy = await this.ai.publicationCopy({ story: timeline.story, scenes: selected.map((scene) => ({ title: scene.title, summary: (scene.directorPlan as AnyRecord)?.summary })) });
    const latestTask = await this.db.select().from(whatifVideoTasks).where(inArray(whatifVideoTasks.sceneId, selected.map((scene) => scene.id))).orderBy(desc(whatifVideoTasks.createdAt));
    const successfulTasks = selected.map((scene) => latestTask.find((task) => task.sceneId === scene.id && task.status === 'success')).filter(Boolean);
    const firstTask = successfulTasks[0];
    const publicationId = this.id('publication');
    await this.db.insert(whatifPublications).values({ id: publicationId, storyId, ownerId, sceneIds: validSelectedIds, title: String(body.title || copy.title), summary: String(body.summary || copy.summary), coverPath: firstTask?.posterPath || firstTask?.lastFramePath || timeline.story.coverPath, videoPath: selected.length === 1 ? firstTask?.videoPath : null, status: body.publish === true ? 'published' : 'draft', visibility: body.visibility === 'private' ? 'private' : 'public', canRemix: body.canRemix !== false, remixTemplate: { storyTitle: timeline.story.title, setting: timeline.story.setting, sceneClues: selected.map((scene) => scene.userScript) } });
    return { publicationId, workPath: `/works/${publicationId}`, title: body.title || copy.title, summary: body.summary || copy.summary, tags: copy.tags, status: body.publish === true ? 'published' : 'draft', traceId: this.traceId() };
  }

  async getWork(_ownerId: string, workId: string) {
    const [publication] = await this.db.select().from(whatifPublications).where(and(eq(whatifPublications.id, workId), eq(whatifPublications.status, 'published'), eq(whatifPublications.visibility, 'public'))).limit(1);
    if (!publication) {
      const fallback = fallbackWorks.find((item) => item.id === workId);
      if (!fallback) throw new NotFoundException({ code: 'WORK_NOT_FOUND', message: '作品不存在或暂未公开' });
      return { ...fallback, scenes: [{ sceneId: `${fallback.id}-scene`, title: fallback.title, summary: fallback.subtitle, durationSeconds: fallback.durationSeconds, videoUrl: String((fallback as AnyRecord).videoUrl || ''), coverUrl: fallback.coverUrl }], traceId: this.traceId() };
    }
    const sceneIds = Array.isArray(publication.sceneIds) ? publication.sceneIds.map(String) : [];
    const scenes = sceneIds.length ? await this.db.select().from(whatifScenes).where(inArray(whatifScenes.id, sceneIds)) : [];
    const tasks = sceneIds.length ? await this.db.select().from(whatifVideoTasks).where(and(inArray(whatifVideoTasks.sceneId, sceneIds), eq(whatifVideoTasks.status, 'success'))).orderBy(desc(whatifVideoTasks.createdAt)) : [];
    const orderedScenes = await Promise.all(sceneIds.map(async (sceneId) => {
      const scene = scenes.find((item) => item.id === sceneId);
      const task = tasks.find((item) => item.sceneId === sceneId);
      return scene && task ? { sceneId, title: scene.title, summary: (scene.directorPlan as AnyRecord)?.summary || scene.userScript, durationSeconds: task.durationSeconds, videoUrl: await this.signed(task.videoPath), directorPlan: scene.directorPlan } : null;
    }));
    return { workId: publication.id, title: publication.title, subtitle: publication.summary, summary: publication.summary, coverUrl: await this.signed(publication.coverPath), authorName: 'Whatif 创作者', avatarUrl: `${ASSET_BASE}/self.jpg`, likeCount: publication.likeCount, durationSeconds: orderedScenes.filter(Boolean).reduce((total, scene) => total + Number(scene?.durationSeconds || 15), 0), canRemix: publication.canRemix, scenes: orderedScenes.filter(Boolean), traceId: this.traceId() };
  }

  friendCandidates() {
    return { friends: [
      { userId: 'friend-zoya', name: 'Zoya', avatarUrl: `${ASSET_BASE}/role-female-a.png`, selectable: true },
      { userId: 'friend-yunzhou', name: '云舟', avatarUrl: `${ASSET_BASE}/role-male-b.png`, selectable: true },
      { userId: 'friend-xiaomei', name: '小美', avatarUrl: `${ASSET_BASE}/role-female-b.png`, selectable: true },
    ], nextCursor: '', hasMore: false, traceId: this.traceId() };
  }

  async createInvitation(ownerId: string, body: AnyRecord) {
    const draftId = String(body.draftId || '');
    const friendUserId = String(body.friendUserId || '');
    if (!draftId || !friendUserId) this.fail('INVITATION_TARGET_REQUIRED', '请选择要邀请的好友');
    const [existing] = await this.db.select().from(whatifInvitations).where(and(eq(whatifInvitations.draftId, draftId), eq(whatifInvitations.inviteeId, friendUserId), eq(whatifInvitations.status, 'pending'))).limit(1);
    if (existing) return { invitationId: existing.id, status: existing.status, expiresAt: existing.expiresAt, traceId: this.traceId() };
    const id = this.id('invitation');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.db.insert(whatifInvitations).values({ id, draftId, inviterId: ownerId, inviteeId: friendUserId, status: 'pending', expiresAt });
    return { invitationId: id, status: 'pending', expiresAt, traceId: this.traceId() };
  }

  async getInvitation(_ownerId: string, invitationId: string) {
    const [invitation] = await this.db.select().from(whatifInvitations).where(eq(whatifInvitations.id, invitationId)).limit(1);
    if (!invitation) throw new NotFoundException({ code: 'INVITATION_NOT_FOUND', message: '邀请不存在' });
    const [draft] = await this.db.select().from(whatifStoryDrafts).where(eq(whatifStoryDrafts.id, invitation.draftId)).limit(1);
    const invalid = invitation.expiresAt < new Date() || invitation.status !== 'pending';
    return { invitationId, inviter: { name: '好友', avatarUrl: `${ASSET_BASE}/self.jpg` }, story: { title: draft?.title || '一个平行世界故事', setting: draft?.setting || '' }, status: invalid && invitation.status === 'pending' ? 'expired' : invitation.status, expiresAt: invitation.expiresAt, canAccept: !invalid, canReject: !invalid, authorizationSummary: ['仅用于这次故事', '不会自动发布', '不会无限复用'], traceId: this.traceId() };
  }

  async updateInvitation(_ownerId: string, invitationId: string, action: 'accept' | 'reject') {
    const [invitation] = await this.db.select().from(whatifInvitations).where(eq(whatifInvitations.id, invitationId)).limit(1);
    if (!invitation) throw new NotFoundException({ code: 'INVITATION_NOT_FOUND', message: '邀请不存在' });
    if (invitation.expiresAt < new Date()) this.fail('INVITATION_EXPIRED', '邀请已过期', 410);
    const status = action === 'accept' ? 'accepted' : 'rejected';
    await this.db.update(whatifInvitations).set({ status, version: invitation.version + 1, updatedAt: new Date() }).where(eq(whatifInvitations.id, invitationId));
    return { status, participantCharacterDraftId: action === 'accept' ? `invite_character_${invitationId}` : undefined, nextPage: action === 'accept' ? 'friend_character_confirm' : 'exit', traceId: this.traceId() };
  }

  async authorizeInvitation(ownerId: string, invitationId: string, body: AnyRecord) {
    const [invitation] = await this.db.select().from(whatifInvitations).where(eq(whatifInvitations.id, invitationId)).limit(1);
    if (!invitation || invitation.status !== 'accepted') this.fail('INVITATION_NOT_ACCEPTABLE', '邀请状态已变化，请重新打开');
    if (body.authorizationChecked !== true) this.fail('AUTHORIZATION_CONFIRM_REQUIRED', '请确认本次角色授权范围');
    const characterId = String(body.characterId || '');
    const [savedCharacter] = await this.db.select().from(whatifCharacters).where(and(eq(whatifCharacters.id, characterId), eq(whatifCharacters.ownerId, ownerId), eq(whatifCharacters.status, 'active'))).limit(1);
    if (!savedCharacter?.masterAssetId) this.fail('AUTHORIZED_CHARACTER_REQUIRED', '请选择一个已确认身份脸和全身形象的角色');
    const assets = await this.db.select().from(whatifCharacterAssets).where(and(eq(whatifCharacterAssets.characterId, characterId), eq(whatifCharacterAssets.ownerId, ownerId), eq(whatifCharacterAssets.confirmed, true)));
    const snapshotId = this.id('auth_snapshot');
    await this.db.transaction(async (tx) => {
      await tx.insert(whatifAuthorizationSnapshots).values({ id: snapshotId, invitationId, ownerId, characterId, characterVersion: savedCharacter.currentVersion, assetSnapshot: { character: savedCharacter, assets }, scope: 'invitation_story_only', status: 'active' });
      await tx.update(whatifInvitations).set({ status: 'snapshot_created', placeholderCharacterId: characterId, participantCharacterDraft: { characterId, name: savedCharacter.name }, updatedAt: new Date() }).where(eq(whatifInvitations.id, invitationId));
    });
    return { characterId, authorizationSnapshotId: snapshotId, invitationStatus: 'snapshot_created', traceId: this.traceId() };
  }

  async participatedStories(ownerId: string) {
    const authorizations = await this.db.select().from(whatifAuthorizationSnapshots).where(eq(whatifAuthorizationSnapshots.ownerId, ownerId)).orderBy(desc(whatifAuthorizationSnapshots.updatedAt));
    const invitationIds = authorizations.map((item) => item.invitationId);
    const invitations = invitationIds.length ? await this.db.select().from(whatifInvitations).where(inArray(whatifInvitations.id, invitationIds)) : [];
    const items = await Promise.all(invitations.map(async (invitation) => {
      const [story] = await this.db.select().from(whatifStories).where(eq(whatifStories.sourceDraftId, invitation.draftId)).orderBy(desc(whatifStories.updatedAt)).limit(1);
      const [task] = story ? await this.db.select().from(whatifVideoTasks).where(eq(whatifVideoTasks.storyId, story.id)).orderBy(desc(whatifVideoTasks.updatedAt)).limit(1) : [];
      return { storyId: story?.id || invitation.draftId, title: story?.title || '我参与的平行故事', status: task?.status || (invitation.status === 'snapshot_created' ? 'waiting_creator' : invitation.status), coverUrl: await this.signed(story?.coverPath) || `${ASSET_BASE}/cinema.png`, progress: task?.progress || 0, targetPath: task ? (task.status === 'success' ? `/video-results/${task.id}` : `/video-tasks/${task.id}`) : story ? `/stories/${story.id}/timeline` : '', actions: ['view'] };
    }));
    return { items, nextCursor: '', hasMore: false, traceId: this.traceId() };
  }

  aiConfig() {
    return { ...this.ai.configSummary(), traceId: this.traceId() };
  }
}
