import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Collection } from 'mongodb';
import * as ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { MONGO, type WhatifMongo } from '../../mongo/mongo.module';
import { CompatDb, and, desc, eq, inArray, ne } from '../../mongo/db';
import { FilesService } from '../../files/files.service';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

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
import { findWhatifVoicePreset, type WhatifVoiceProfile } from '../../../shared/whatif-voices';
import { WhatifVoiceService } from './whatif-voice.service';

const ASSET_BASE = 'assets/whatif';
const FFMPEG_PATH = ffmpegInstaller.path;
const BUILTIN_CAST_MODEL_CDN_BASE = process.env.WHATIF_BUILTIN_CAST_CDN_BASE
  || 'https://lf-miaoda-static.feishucdn.com/app_17b2h3329qw/cc71beed83032f9e1d221618a6defaf23cd1e414/client/assets/whatif/generated-cast';
const MODEL_ASSET_PATHS = {
  officialJiangyu: '/1872109747097770.png',
  officialShenyan: '/1872109769788425.png',
  worldModern: '/1872111125764106.jpg',
  worldPeriod: '/1872111125764122.jpg',
  worldFuture: '/1872108341537802.png',
  worldArt: '/1872109769788441.jpg',
} as const;

const WORLDVIEW_MODEL_PATHS: Record<string, string> = {
  'world-modern-romance': MODEL_ASSET_PATHS.worldModern,
  'world-period-romance': MODEL_ASSET_PATHS.worldPeriod,
  'world-future-parallel': MODEL_ASSET_PATHS.worldFuture,
  'world-art-life': MODEL_ASSET_PATHS.worldArt,
};

const BUILTIN_CAST_ASSET_PATHS = {
  linxia: `${BUILTIN_CAST_MODEL_CDN_BASE}/linxia.png`,
  sunian: `${BUILTIN_CAST_MODEL_CDN_BASE}/sunian.png`,
  tangyou: `${BUILTIN_CAST_MODEL_CDN_BASE}/tangyou.png`,
  guyan: `${BUILTIN_CAST_MODEL_CDN_BASE}/guyan.png`,
  zhouye: `${BUILTIN_CAST_MODEL_CDN_BASE}/zhouye.png`,
  luchen: `${BUILTIN_CAST_MODEL_CDN_BASE}/luchen.png`,
} as const;

const BUILTIN_CAST_AVATAR_PATHS = {
  linxia: `${ASSET_BASE}/generated-cast/thumbs/linxia.jpg`,
  sunian: `${ASSET_BASE}/generated-cast/thumbs/sunian.jpg`,
  tangyou: `${ASSET_BASE}/generated-cast/thumbs/tangyou.jpg`,
  guyan: `${ASSET_BASE}/generated-cast/thumbs/guyan.jpg`,
  zhouye: `${ASSET_BASE}/generated-cast/thumbs/zhouye.jpg`,
  luchen: `${ASSET_BASE}/generated-cast/thumbs/luchen.jpg`,
} as const;

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
    assetViews: { identityFace: MODEL_ASSET_PATHS.officialJiangyu, bodyFront: MODEL_ASSET_PATHS.officialJiangyu },
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
    assetViews: { identityFace: MODEL_ASSET_PATHS.officialShenyan },
  },
  {
    characterId: 'builtin-linxia',
    name: '林夏',
    avatarUrl: BUILTIN_CAST_AVATAR_PATHS.linxia,
    summary: '温柔坚定 · 都市生活',
    description: '26岁，黑色长发，温柔真诚但有自己的坚持，擅长在细节里表达关心。',
    sourceType: 'official',
    badges: ['内置', '都市'],
    selectable: true,
    authorizationStatus: 'not_required',
    assetVersion: 1,
    assetViews: { identityFace: BUILTIN_CAST_ASSET_PATHS.linxia, bodyFront: BUILTIN_CAST_ASSET_PATHS.linxia },
  },
  {
    characterId: 'builtin-sunian',
    name: '苏念',
    avatarUrl: BUILTIN_CAST_AVATAR_PATHS.sunian,
    summary: '冷静清醒 · 都市职场',
    description: '29岁，深棕色中长发，理性干练、观察敏锐，习惯用行动解决问题。',
    sourceType: 'official',
    badges: ['内置', '都市'],
    selectable: true,
    authorizationStatus: 'not_required',
    assetVersion: 1,
    assetViews: { identityFace: BUILTIN_CAST_ASSET_PATHS.sunian, bodyFront: BUILTIN_CAST_ASSET_PATHS.sunian },
  },
  {
    characterId: 'builtin-tangyou',
    name: '唐柚',
    avatarUrl: BUILTIN_CAST_AVATAR_PATHS.tangyou,
    summary: '明亮率真 · 都市青春',
    description: '24岁，黑色短发，直率活泼、情绪鲜明，面对喜欢的事情会主动向前。',
    sourceType: 'official',
    badges: ['内置', '都市'],
    selectable: true,
    authorizationStatus: 'not_required',
    assetVersion: 1,
    assetViews: { identityFace: BUILTIN_CAST_ASSET_PATHS.tangyou, bodyFront: BUILTIN_CAST_ASSET_PATHS.tangyou },
  },
  {
    characterId: 'builtin-guyan',
    name: '顾言',
    avatarUrl: BUILTIN_CAST_AVATAR_PATHS.guyan,
    summary: '温和可靠 · 都市爱情',
    description: '28岁，黑色短发，温和细致、情绪稳定，擅长在关键时刻给出明确回应。',
    sourceType: 'official',
    badges: ['内置', '都市'],
    selectable: true,
    authorizationStatus: 'not_required',
    assetVersion: 1,
    assetViews: { identityFace: BUILTIN_CAST_ASSET_PATHS.guyan, bodyFront: BUILTIN_CAST_ASSET_PATHS.guyan },
  },
  {
    characterId: 'builtin-zhouye',
    name: '周野',
    avatarUrl: BUILTIN_CAST_AVATAR_PATHS.zhouye,
    summary: '直接热烈 · 都市青春',
    description: '26岁，利落短发，坦率有行动力，喜欢把复杂的事情用最直接的方式说清楚。',
    sourceType: 'official',
    badges: ['内置', '都市'],
    selectable: true,
    authorizationStatus: 'not_required',
    assetVersion: 1,
    assetViews: { identityFace: BUILTIN_CAST_ASSET_PATHS.zhouye, bodyFront: BUILTIN_CAST_ASSET_PATHS.zhouye },
  },
  {
    characterId: 'builtin-luchen',
    name: '陆沉',
    avatarUrl: BUILTIN_CAST_AVATAR_PATHS.luchen,
    summary: '成熟克制 · 都市悬念',
    description: '31岁，深色短发，沉着克制、判断果断，很少解释自己但会承担结果。',
    sourceType: 'official',
    badges: ['内置', '都市'],
    selectable: true,
    authorizationStatus: 'not_required',
    assetVersion: 1,
    assetViews: { identityFace: BUILTIN_CAST_ASSET_PATHS.luchen, bodyFront: BUILTIN_CAST_ASSET_PATHS.luchen },
  },
] as const;

const fallbackWorldviews = [
  { worldviewId: 'world-modern-romance', name: '现代都市', coverUrl: `${ASSET_BASE}/world-modern-romance.jpg`, atmosphere: '霓虹雨夜与错过的重逢', description: '当代城市中的关系故事。', stylePrompt: 'cinematic contemporary city, natural acting', recommended: true, available: true, assetVersion: 1 },
  { worldviewId: 'world-period-romance', name: '旧时代', coverUrl: `${ASSET_BASE}/world-period-romance.jpg`, atmosphere: '命运岔路上的同行与告别', description: '带有时代质感的命运故事。', stylePrompt: 'period romance, tactile production design', recommended: false, available: true, assetVersion: 1 },
  { worldviewId: 'world-future-parallel', name: '未来平行线', coverUrl: `${ASSET_BASE}/world-future.png`, atmosphere: '在另一个时间节点再次相遇', description: '科技与人性共存的未来城市。', stylePrompt: 'near-future Shanghai, grounded science fiction', recommended: false, available: true, assetVersion: 1 },
  { worldviewId: 'world-art-life', name: '文艺人生', coverUrl: `${ASSET_BASE}/world-art-story.jpg`, atmosphere: '共同完成未说出口的梦想', description: '围绕创作、遗憾与重新选择的人生故事。', stylePrompt: 'poetic slice of life, film texture', recommended: false, available: true, assetVersion: 1 },
];

const fallbackWorks = [
  ['work-001', '如果今天重新开始', '都市 · 健身房 · 自我重启', 'gym-restart.png', '第二世界实验室', 32841, 15, 'gym-restart.m4v'],
  ['work-002', '聚光灯熄灭以后', '都市 · 后台 · 心动重逢', 'backstage-reunion.png', '星光来信', 28712, 15, 'backstage-reunion.m4v'],
  ['work-003', '2056 年的最后一班车', '未来 · 雨夜 · 平行世界', 'future-pod.png', '北辰', 24490, 15, 'future-pod.m4v'],
  ['work-004', '雨停以前抱紧你', '动画电影 · 旧书店 · 久别重逢', 'rain-library-embrace.png', '江屿', 21305, 15, 'rain-library-embrace.m4v'],
  ['work-005', '旧书店门口的约定', '动画电影 · 雨夜 · 心动故事', 'rain-umbrella-promise.png', '小岛来信', 19883, 15, 'rain-umbrella-promise.m4v'],
  ['work-006', '终于在城市尽头重逢', '电影感 · 都市 · 命运重写', 'city-reunion.png', '晚风有信', 18672, 15, 'city-reunion.m4v'],
].map(([id, title, subtitle, cover, authorName, likeCount, durationSeconds, video]) => ({
  id: String(id),
  workId: String(id),
  title: String(title),
  subtitle: String(subtitle),
  coverUrl: `${ASSET_BASE}/demo-covers/${cover}`,
  videoUrl: `${ASSET_BASE}/demo-videos/${video}`,
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
  private readonly bundledModelReferenceCache = new Map<string, Promise<string>>();

  private readonly db: CompatDb;
  constructor(
    @Inject(MONGO) private readonly mongo: WhatifMongo,
    private readonly files: FilesService,
    private readonly ai: WhatifAiService,
    private readonly voices: WhatifVoiceService,
  ) {
    const colls: Record<string, Collection> = {
      whatif_characters: mongo.characters,
      whatif_character_assets: mongo.characterAssets,
      whatif_worldviews: mongo.worldviews,
      whatif_story_drafts: mongo.storyDrafts,
      whatif_draft_characters: mongo.draftCharacters,
      whatif_stories: mongo.stories,
      whatif_story_branches: mongo.storyBranches,
      whatif_scenes: mongo.scenes,
      whatif_video_tasks: mongo.videoTasks,
      whatif_invitations: mongo.invitations,
      whatif_authorization_snapshots: mongo.authorizationSnapshots,
      whatif_publications: mongo.publications,
      whatif_idempotency_records: mongo.idempotencyRecords,
    };
    this.db = new CompatDb(colls);
  }

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

  private defaultVoiceIdForCharacter(input: { name?: unknown; description?: unknown }) {
    const text = `${String(input.name || '')} ${String(input.description || '')}`;
    if (/男|少年|先生|哥哥|弟弟|男声|短发|低沉|成熟|克制|沉稳/.test(text)) {
      return /少年|青春|明亮|热烈|冲劲|弟弟/.test(text) ? 'whatif_bright_young_male' : 'whatif_steady_low_male';
    }
    if (/旁白|叙述|神秘|命运|系统|时间/.test(text)) return 'whatif_cinematic_narrator';
    if (/活泼|元气|轻快|直率|明亮|主动/.test(text)) return 'whatif_lively_female';
    if (/冷静|理性|成熟|克制|清醒|低柔/.test(text)) return 'whatif_calm_low_female';
    return 'whatif_warm_clear_female';
  }

  private normalizeVoiceProfile(value: unknown, fallbackInput: { name?: unknown; description?: unknown } = {}): WhatifVoiceProfile {
    const raw = value && typeof value === 'object' ? value as Partial<WhatifVoiceProfile> : {};
    const fallback = findWhatifVoicePreset(raw.voiceId || this.defaultVoiceIdForCharacter(fallbackInput));
    return this.voices.normalizeVoiceProfile(raw, fallback);
  }

  private voiceProfileFromAsset(asset: { referencePaths?: unknown } | undefined) {
    const entries = Array.isArray(asset?.referencePaths) ? asset.referencePaths : [];
    const entry = entries.find((item) => item && typeof item === 'object' && (item as AnyRecord).type === 'voice_profile');
    return entry && typeof entry === 'object' ? (entry as AnyRecord).voiceProfile || entry : null;
  }

  private voiceProfileFromAssets(assets: Array<{ kind: string; referencePaths?: unknown }>, fallbackInput: { name?: unknown; description?: unknown }) {
    return this.normalizeVoiceProfile(this.voiceProfileFromAsset(assets.find((asset) => asset.kind === 'voice-profile')), fallbackInput);
  }

  private async latestVoiceProfile(ownerId: string, characterId: string, fallbackInput: { name?: unknown; description?: unknown }) {
    const [asset] = await this.db.select().from(whatifCharacterAssets)
      .where(and(
        eq(whatifCharacterAssets.ownerId, ownerId),
        eq(whatifCharacterAssets.characterId, characterId),
        eq(whatifCharacterAssets.kind, 'voice-profile'),
        eq(whatifCharacterAssets.status, 'ready'),
        eq(whatifCharacterAssets.confirmed, true),
      ))
      .orderBy(desc(whatifCharacterAssets.createdAt)).limit(1);
    return this.normalizeVoiceProfile(this.voiceProfileFromAsset(asset), fallbackInput);
  }

  private async saveVoiceProfileAsset(ownerId: string, characterId: string, version: number, voiceProfile: WhatifVoiceProfile) {
    await this.db.insert(whatifCharacterAssets).values({
      id: this.id('character_asset'),
      characterId,
      ownerId,
      version,
      kind: 'voice-profile',
      status: 'ready',
      referencePaths: [{ type: 'voice_profile', voiceProfile }],
      promptVersion: 'whatif-voice-profile-v1',
      confirmed: true,
    });
  }

  private async signed(path?: string | null) {
    if (!path) return '';
    if (/^https?:\/\//.test(path) || path.startsWith('data:image')) return path;
    try {
      return await this.files.createSignedUrl(path, 60 * 60 * 24 * 7);
    } catch (error) {
      // Bundled public assets are valid relative URLs. Uploaded media paths are
      // not: returning a bare filename here makes the client resolve it under
      // the versioned `/client/` bundle and produces a guaranteed 404.
      if (path.startsWith(`${ASSET_BASE}/`)) return path;
      this.logger.warn(`Unable to sign media path ${path}: ${error instanceof Error ? error.message : error}`);
      return '';
    }
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

  private async archiveOptionalRemote(url: string, prefix: string, label: string) {
    if (!url) return { path: '', warning: '' };
    try {
      return { path: await this.archiveRemote(url, prefix), warning: '' };
    } catch (error) {
      const warning = error instanceof Error ? error.message : `${label}归档失败`;
      this.logger.warn(`${label} archive fallback: ${warning}`);
      return { path: '', warning };
    }
  }

  private runFfmpeg(args: string[], timeoutMs = 180_000) {
    if (!FFMPEG_PATH) return Promise.reject(new Error('ffmpeg binary is not available for this runtime'));
    return new Promise<void>((resolveRun, rejectRun) => {
      const child = spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      const stderr: Buffer[] = [];
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        rejectRun(new Error('ffmpeg compose timed out'));
      }, timeoutMs);
      child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
      child.on('error', (error) => {
        clearTimeout(timer);
        rejectRun(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolveRun();
        else rejectRun(new Error(`ffmpeg exited ${code}: ${Buffer.concat(stderr).toString('utf8').slice(-2000)}`));
      });
    });
  }

  private async downloadVideoToFile(videoPath: string, targetPath: string) {
    const url = await this.signed(videoPath);
    if (!url) throw new Error('video path is empty');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`video download failed: ${response.status}`);
    await writeFile(targetPath, Buffer.from(await response.arrayBuffer()));
  }

  private async composePublicationVideo(tasks: Array<{ videoPath?: string | null }>, publicationId: string) {
    if (!tasks.length || tasks.some((task) => !task.videoPath)) return '';
    if (tasks.length === 1) return tasks[0].videoPath || '';
    const dir = await mkdtemp(join(tmpdir(), 'whatif-compose-'));
    try {
      const inputPaths: string[] = [];
      for (const [index, task] of tasks.entries()) {
        const inputPath = join(dir, `scene-${index + 1}.mp4`);
        await this.downloadVideoToFile(String(task.videoPath), inputPath);
        inputPaths.push(inputPath);
      }
      const concatListPath = join(dir, 'concat.txt');
      await writeFile(concatListPath, inputPaths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join('\n'));
      const outputPath = join(dir, 'story.mp4');
      try {
        await this.runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', '-movflags', '+faststart', outputPath]);
      } catch (copyError) {
        this.logger.warn(`publication video stream-copy compose failed, retrying with transcode: ${copyError instanceof Error ? copyError.message : copyError}`);
        await this.runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outputPath], 300_000);
      }
      const uploaded = await this.files.upload(await readFile(outputPath), {
        fileName: `${publicationId}-story.mp4`,
        contentType: 'video/mp4',
      });
      return uploaded.filePath;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private providerUrlExpiresAt(url: string) {
    try {
      const parsed = new URL(url);
      const signedAt = parsed.searchParams.get('X-Tos-Date');
      const expiresSeconds = Number(parsed.searchParams.get('X-Tos-Expires') || 0);
      if (!signedAt || !expiresSeconds) return new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();
      const matched = signedAt.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
      if (!matched) return new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();
      const [, year, month, day, hour, minute, second] = matched;
      const startedAt = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
      return new Date(startedAt + expiresSeconds * 1000).toISOString();
    } catch {
      return new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();
    }
  }

  private providerMetadata(asset: { referencePaths?: unknown } | undefined) {
    const entries = Array.isArray(asset?.referencePaths) ? asset.referencePaths : [];
    return entries.find((entry) => entry && typeof entry === 'object' && ('providerSourceUrl' in entry || 'provenance' in entry)) as AnyRecord | undefined;
  }

  private activeProviderSource(asset: { referencePaths?: unknown } | undefined) {
    const metadata = this.providerMetadata(asset);
    const url = String(metadata?.providerSourceUrl || '');
    const expiresAt = Date.parse(String(metadata?.providerExpiresAt || ''));
    return /^https?:\/\//.test(url) && Number.isFinite(expiresAt) && expiresAt > Date.now() + 5 * 60 * 1000 ? url : '';
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
    const feed = await this.feedWorks(ownerId, 0, 6);
    return {
      hero: {
        id: 'hero-gym-restart',
        workId: 'work-001',
        title: '如果今天重新开始',
        subtitle: '都市成长 · 健身房 · 第 1 幕 · 15 秒',
        coverUrl: `${ASSET_BASE}/demo-covers/gym-restart.png`,
        videoUrl: `${ASSET_BASE}/demo-videos/gym-restart.m4v`,
        durationSeconds: 15,
      },
      statusCard: statusCard || { type: 'no_character', title: '开始创建你的平行世界', description: 'AI 自动完成专业分镜与 15 秒成片', actionLabel: '开始创作', characters: [] },
      works: feed.works,
      nextCursor: feed.nextCursor,
      hasMore: feed.hasMore,
      traceId: this.traceId(),
    };
  }

  private async generatedStoryWorks(ownerId: string) {
    try {
      const stories = await this.db.select().from(whatifStories)
        .where(eq(whatifStories.ownerId, ownerId))
        .orderBy(desc(whatifStories.updatedAt));
      if (!stories.length) return [];
      const storyIds = stories.map((story) => story.id);
      const scenes = await this.db.select().from(whatifScenes)
        .where(and(eq(whatifScenes.ownerId, ownerId), inArray(whatifScenes.storyId, storyIds)))
        .orderBy(whatifScenes.sequence, whatifScenes.createdAt);
      if (!scenes.length) return [];
      const tasks = await this.db.select().from(whatifVideoTasks)
        .where(and(eq(whatifVideoTasks.ownerId, ownerId), inArray(whatifVideoTasks.sceneId, scenes.map((scene) => scene.id)), eq(whatifVideoTasks.status, 'success')))
        .orderBy(desc(whatifVideoTasks.updatedAt));
      const taskForScene = (sceneId: string, selectedResultId?: string | null) => (
        tasks.find((task) => task.id === selectedResultId)
        || tasks.find((task) => task.sceneId === sceneId)
      );
      return Promise.all(stories.map(async (story) => {
        const storyScenes = scenes.filter((scene) => scene.storyId === story.id);
        const successfulScenes = storyScenes
          .map((scene) => ({ scene, task: taskForScene(scene.id, scene.selectedResultId) }))
          .filter((item) => item.task);
        if (!successfulScenes.length) return null;
        const first = successfulScenes[0];
        const latest = successfulScenes.at(-1) || first;
        const firstMedia = this.ai.videoMedia(first.task?.responseSnapshot);
        const coverUrl = await this.signed(first.task?.posterPath)
          || await this.signed(first.task?.lastFramePath)
          || firstMedia.firstFrameUrl
          || firstMedia.lastFrameUrl
          || await this.signed(story.coverPath)
          || `${ASSET_BASE}/cinema.png`;
        const subtitle = [
          `${successfulScenes.length}幕已生成`,
          story.setting || (latest.scene.directorPlan as AnyRecord)?.summary || latest.scene.userScript || '',
        ].filter(Boolean).join(' · ');
        return {
          id: `story-work:${story.id}`,
          workId: story.id,
          targetPath: `/stories/${story.id}/timeline`,
          sourceType: 'generated_story',
          title: story.title,
          subtitle,
          coverUrl,
          videoUrl: await this.signed(latest.task?.videoPath),
          authorName: '我的故事',
          avatarUrl: `${ASSET_BASE}/self.jpg`,
          likeCount: 0,
          durationSeconds: successfulScenes.reduce((total, item) => total + Number(item.task?.durationSeconds || 15), 0),
          canRemix: false,
          sceneCount: successfulScenes.length,
          updatedAt: story.updatedAt,
        };
      })).then((items) => items.filter(Boolean) as AnyRecord[]);
    } catch (error) {
      if (!this.isMissingTable(error)) throw error;
      return [];
    }
  }

  private async feedWorks(ownerId: string, offset: number, pageSize: number) {
    const generated = await this.generatedStoryWorks(ownerId);
    const publicWorks: AnyRecord[] = [];
    try {
      const rows = await this.db.select().from(whatifPublications)
        .where(and(eq(whatifPublications.status, 'published'), eq(whatifPublications.visibility, 'public')))
        .orderBy(desc(whatifPublications.likeCount), desc(whatifPublications.updatedAt))
        .limit(pageSize + offset + 1);
      publicWorks.push(...await Promise.all(rows.map(async (row) => ({ id: row.id, workId: row.id, title: row.title, subtitle: row.summary || '连续剧情 · 15秒一幕', coverUrl: await this.signed(row.coverPath) || `${ASSET_BASE}/cinema.png`, videoUrl: await this.signed(row.videoPath), authorName: 'Whatif 创作者', avatarUrl: `${ASSET_BASE}/self.jpg`, likeCount: row.likeCount, durationSeconds: Math.max(15, (Array.isArray(row.sceneIds) ? row.sceneIds.length : 1) * 15), canRemix: row.canRemix, templateId: row.canRemix ? `publication:${row.id}` : undefined }))));
    } catch (error) {
      if (!this.isMissingTable(error)) throw error;
    }
    const fallback = fallbackWorks.map((work) => ({ ...work, sourceType: 'template' }));
    const combined = [...generated, ...publicWorks, ...fallback];
    const page = combined.slice(offset, offset + pageSize);
    const next = offset + page.length;
    return {
      works: page,
      nextCursor: combined.length > next ? this.encodeCursor(next) : null,
      hasMore: combined.length > next,
    };
  }

  async getWorks(ownerId: string, cursor: string | undefined, requestedPageSize: number) {
    const pageSize = Math.min(Math.max(requestedPageSize || 6, 2), 10);
    const start = this.decodeCursor(cursor);
    const page = await this.feedWorks(ownerId, start, pageSize);
    return { ...page, traceId: this.traceId() };
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
        voiceProfile: this.voiceProfileFromAssets(assets, row),
        sourceType: row.sourceType,
        badges: row.isSelf ? ['我'] : row.sourceType === 'seedance_asset' ? ['Seedance角色资产'] : ['我的'],
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
          seedanceMaster: assetViews['seedance-master'] || '',
        },
      };
    }));
  }

  private async characterCandidates(ownerId: string) {
    const userCharacters = await this.userCharacterCandidates(ownerId);
    const libraryMasters = await this.db.select().from(whatifCharacterAssets)
      .where(and(
        eq(whatifCharacterAssets.ownerId, 'system'),
        eq(whatifCharacterAssets.kind, 'seedance-master'),
        eq(whatifCharacterAssets.status, 'ready'),
        eq(whatifCharacterAssets.confirmed, true),
      ))
      .orderBy(desc(whatifCharacterAssets.createdAt));
    const latestLibraryMaster = new Map<string, typeof libraryMasters[number]>();
    libraryMasters.forEach((asset) => {
      if (!latestLibraryMaster.has(asset.characterId)) latestLibraryMaster.set(asset.characterId, asset);
    });
    const libraryCharacters = await Promise.all(officialCharacters.map(async (item) => {
      const master = latestLibraryMaster.get(item.characterId);
      const voiceProfile = this.normalizeVoiceProfile(null, item);
      if (!master?.imagePath || master.promptVersion !== PROMPT_VERSIONS.seedanceCharacterMaster) return { ...item, voiceProfile };
      const masterUrl = await this.signed(master.imagePath);
      return {
        ...item,
        voiceProfile,
        avatarUrl: masterUrl,
        badges: Array.from(new Set([...item.badges, 'Seedance角色资产'])),
        assetViews: {
          ...item.assetViews,
          identityFace: masterUrl,
          bodyFront: masterUrl,
          seedanceMaster: masterUrl,
        },
      };
    }));
    const builtInCharacters = libraryCharacters.filter((item) => item.characterId.startsWith('builtin-'));
    const brandedCharacters = libraryCharacters.filter((item) => !item.characterId.startsWith('builtin-'));
    return [...builtInCharacters, ...userCharacters, ...brandedCharacters];
  }

  private async worldviewOptions(ownerId: string) {
    const defaults = await Promise.all(
      fallbackWorldviews.map(async (item) => ({
        ...item,
        coverUrl: await this.signed(WORLDVIEW_MODEL_PATHS[item.worldviewId] || item.coverUrl),
      })),
    );
    try {
      const rows = await this.db.select().from(whatifWorldviews)
        .where(and(inArray(whatifWorldviews.ownerId, ['system', ownerId]), eq(whatifWorldviews.status, 'active')))
        .orderBy(desc(whatifWorldviews.ownerId), desc(whatifWorldviews.updatedAt));
      if (rows.length) {
        const configured = await Promise.all(rows.map(async (row) => ({ worldviewId: row.id, name: row.name, coverUrl: await this.signed(WORLDVIEW_MODEL_PATHS[row.id] || row.coverPath), atmosphere: row.atmosphere, description: row.description, stylePrompt: row.stylePrompt, recommended: row.id === 'world-modern-romance', available: true, assetVersion: row.currentVersion })));
        const configuredIds = new Set(configured.map((item) => item.worldviewId));
        return [...configured, ...defaults.filter((item) => !configuredIds.has(item.worldviewId))];
      }
    } catch (error) {
      if (!this.isMissingTable(error)) throw error;
    }
    return defaults;
  }

  async getCastSetting(ownerId: string, draftId: string) {
    const [draft] = await this.db.select().from(whatifStoryDrafts)
      .where(and(eq(whatifStoryDrafts.id, draftId), eq(whatifStoryDrafts.ownerId, ownerId))).limit(1);
    if (!draft) throw new NotFoundException({ code: 'DRAFT_NOT_FOUND', message: '故事草稿不存在或已失效' });
    const selected = await this.db.select().from(whatifDraftCharacters)
      .where(and(eq(whatifDraftCharacters.draftId, draftId), eq(whatifDraftCharacters.ownerId, ownerId)))
      .orderBy(whatifDraftCharacters.sortOrder);
    const candidates = await this.characterCandidates(ownerId);
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
    const allCandidates = await this.characterCandidates(ownerId);
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
    const sourceType = body.sourceType === 'seedance_asset' ? 'seedance_asset' : 'custom';
    const voiceProfile = this.normalizeVoiceProfile(body.voiceProfile, { name, description: body.description });
    if (body.isSelf) await this.db.update(whatifCharacters).set({ isSelf: false, updatedAt: new Date() }).where(and(eq(whatifCharacters.ownerId, ownerId), eq(whatifCharacters.isSelf, true)));
    const [existing] = await this.db.select().from(whatifCharacters).where(and(eq(whatifCharacters.id, id), eq(whatifCharacters.ownerId, ownerId))).limit(1);
    const nextVersion = existing ? existing.currentVersion + 1 : 1;
    if (existing) await this.db.update(whatifCharacters).set({ name, description: String(body.description || '').slice(0, 500), isSelf: Boolean(body.isSelf), visibility: body.visibility === 'public' ? 'public' : 'private', currentVersion: nextVersion, updatedAt: new Date() }).where(eq(whatifCharacters.id, id));
    else await this.db.insert(whatifCharacters).values({ id, ownerId, name, description: String(body.description || '').slice(0, 500), isSelf: Boolean(body.isSelf), visibility: body.visibility === 'public' ? 'public' : 'private', sourceType, status: 'draft' });
    await this.saveVoiceProfileAsset(ownerId, id, nextVersion, voiceProfile);
    return { characterId: id, traceId: this.traceId() };
  }

  async getCharacter(ownerId: string, characterId: string) {
    const [character] = await this.db.select().from(whatifCharacters).where(and(eq(whatifCharacters.id, characterId), eq(whatifCharacters.ownerId, ownerId))).limit(1);
    if (!character) throw new NotFoundException({ code: 'CHARACTER_NOT_FOUND', message: '角色不存在' });
    const assets = await this.db.select().from(whatifCharacterAssets).where(and(eq(whatifCharacterAssets.characterId, characterId), eq(whatifCharacterAssets.ownerId, ownerId))).orderBy(desc(whatifCharacterAssets.createdAt));
    const visibleAssets = assets.filter((asset) => asset.kind !== 'voice-profile');
    const voiceOptions = await this.voices.voiceOptions();
    return { ...character, voiceProfile: this.voiceProfileFromAssets(assets, character), voiceOptions: voiceOptions.items, voiceOptionsSource: voiceOptions.source, avatarUrl: await this.signed(character.avatarPath), assets: await Promise.all(visibleAssets.map(async (asset) => ({ ...asset, assetId: asset.id, imageUrl: await this.signed(asset.imagePath) }))), traceId: this.traceId() };
  }

  async listCharacters(ownerId: string) {
    return { items: await this.userCharacterCandidates(ownerId), traceId: this.traceId() };
  }

  async generateCharacterAsset(ownerId: string, body: AnyRecord) {
    const characterId = String(body.characterId || '');
    const [character] = await this.db.select().from(whatifCharacters).where(and(eq(whatifCharacters.id, characterId), eq(whatifCharacters.ownerId, ownerId))).limit(1);
    if (!character) throw new NotFoundException({ code: 'CHARACTER_NOT_FOUND', message: '请先保存角色名称和描写' });
    const kind = String(body.kind || 'identity-face');
    const instruction = String(body.instruction || '');
    const referenceImages = Array.isArray(body.referenceImages) ? body.referenceImages.map(String) : [];
    const previousAsset = String(body.previousAsset || '');
    const assetId = this.id('character_asset');
    const requestReferencePaths = [
      ...referenceImages,
      { instruction, previousAsset, provenance: 'seedream-generation-request' },
    ];
    await this.db.insert(whatifCharacterAssets).values({ id: assetId, characterId, ownerId, version: character.currentVersion, kind, status: 'processing', referencePaths: requestReferencePaths, confirmed: false });
    try {
      const profile = await this.ai.buildCharacterProfile({ name: character.name, description: character.description });
      const generated = await this.ai.generateCharacterAsset({ name: character.name, description: profile.stableDescription, identityAnchors: profile.identityAnchors, kind, instruction, referenceImages, previousAsset });
      const imagePath = await this.archiveRemote(generated.imageUrl, `${characterId}-${kind || 'asset'}`);
      await this.db.update(whatifCharacterAssets).set({ status: 'ready', referencePaths: [...referenceImages, { provider: generated.provider, providerModel: generated.providerModel, provenance: 'seedream-generated', instruction, previousAsset }], imagePath, promptVersion: generated.promptVersion, modelTraceId: generated.traceId, errorCode: null, errorMessage: null, updatedAt: new Date() }).where(eq(whatifCharacterAssets.id, assetId));
      return { taskId: assetId, status: 'success', assetId, kind, imageUrl: await this.signed(imagePath), profile, traceId: generated.traceId };
    } catch (error) {
      const code = String((error as { code?: unknown })?.code || 'CHARACTER_IMAGE_FAILED');
      const message = error instanceof Error ? error.message : '人物图片生成失败';
      await this.db.update(whatifCharacterAssets).set({ status: 'failed', errorCode: code, errorMessage: message, referencePaths: [...requestReferencePaths, { provenance: 'seedream-generation-failed', code, message }], updatedAt: new Date() }).where(eq(whatifCharacterAssets.id, assetId));
      throw error;
    }
  }

  async confirmCharacterAssets(ownerId: string, characterId: string, body: AnyRecord) {
    const assetIds = Array.from(new Set((Array.isArray(body.assetIds) ? body.assetIds : []).map(String)));
    if (!assetIds.length) this.fail('CHARACTER_ASSET_REQUIRED', '请确认身份脸和至少一张全身形象');
    const assets = await this.db.select().from(whatifCharacterAssets).where(and(eq(whatifCharacterAssets.ownerId, ownerId), eq(whatifCharacterAssets.characterId, characterId), inArray(whatifCharacterAssets.id, assetIds)));
    if (assets.length !== assetIds.length || assets.some((item) => item.status !== 'ready' || !item.imagePath)) this.fail('CHARACTER_ASSET_INVALID', '人物资产不存在或尚未生成完成');
    const kinds = new Set(assets.map((item) => item.kind));
    if (!kinds.has('identity-face') || !kinds.has('body-front')) this.fail('CHARACTER_MASTER_INCOMPLETE', '需要同时确认身份脸和正面全身形象');
    const [character] = await this.db.select().from(whatifCharacters).where(and(eq(whatifCharacters.id, characterId), eq(whatifCharacters.ownerId, ownerId))).limit(1);
    if (!character) throw new NotFoundException({ code: 'CHARACTER_NOT_FOUND', message: '角色不存在' });
    const identity = assets.find((item) => item.kind === 'identity-face')!;
    const bodyFront = assets.find((item) => item.kind === 'body-front')!;
    const sourceImage = await this.signed(bodyFront.imagePath);
    const seedanceMaster = await this.ai.generateSeedanceCharacterMaster({ name: character.name, description: character.description, sourceImage });
    const seedanceMasterPath = await this.archiveRemote(seedanceMaster.imageUrl, `${characterId}-seedance-master`);
    const seedanceMasterId = this.id('character_asset');
    await this.db.transaction(async (tx) => {
      await tx.update(whatifCharacterAssets).set({ confirmed: true, updatedAt: new Date() }).where(and(eq(whatifCharacterAssets.ownerId, ownerId), inArray(whatifCharacterAssets.id, assetIds)));
      await tx.insert(whatifCharacterAssets).values({ id: seedanceMasterId, characterId, ownerId, version: character.currentVersion, kind: 'seedance-master', status: 'ready', referencePaths: [{ sourceAssetId: bodyFront.id, provider: seedanceMaster.provider, providerModel: seedanceMaster.providerModel, provenance: 'seedream-normalized-for-seedance', providerSourceUrl: seedanceMaster.imageUrl, providerExpiresAt: this.providerUrlExpiresAt(seedanceMaster.imageUrl) }], imagePath: seedanceMasterPath, promptVersion: seedanceMaster.promptVersion, modelTraceId: seedanceMaster.traceId, confirmed: true });
      await tx.update(whatifCharacters).set({ masterAssetId: identity.id, avatarPath: identity.imagePath, status: 'active', updatedAt: new Date() }).where(and(eq(whatifCharacters.id, characterId), eq(whatifCharacters.ownerId, ownerId)));
    });
    return { confirmed: true, characterId, seedanceAssetId: seedanceMasterId, traceId: this.traceId() };
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
      if (scene) previous = {
        id: scene.id,
        title: scene.title,
        summary: (scene.directorPlan as AnyRecord)?.summary,
        continuityOut: (scene.directorPlan as AnyRecord)?.continuityOut,
        ...await this.previousSceneFrameSummary(ownerId, scene.id),
      };
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

  private async modelReference(value: unknown) {
    const source = String(value || '').trim();
    if (!source) return '';
    if (/^https?:\/\//.test(source) || source.startsWith('data:image')) return source;
    const relativeSource = source.replace(/^\/+/, '');
    if (relativeSource.startsWith(`${ASSET_BASE}/`)) return this.bundledModelReference(relativeSource);
    try {
      const signed = await this.signed(source);
      return /^https?:\/\//.test(signed) ? signed : '';
    } catch (error) {
      this.logger.warn(`Unable to sign model reference ${source}: ${error instanceof Error ? error.message : error}`);
      return '';
    }
  }

  private async bundledModelReference(relativeSource: string) {
    if (!relativeSource.startsWith(`${ASSET_BASE}/`) || relativeSource.includes('..')) return '';
    const cached = this.bundledModelReferenceCache.get(relativeSource);
    if (cached) {
      try {
        return await cached;
      } catch (error) {
        this.bundledModelReferenceCache.delete(relativeSource);
        this.logger.warn(`Unable to reuse bundled model reference ${relativeSource}: ${error instanceof Error ? error.message : error}`);
        return '';
      }
    }

    const pending = (async () => {
      const candidates = [
        resolve(process.cwd(), 'client/public', relativeSource),
        resolve(process.cwd(), 'client', relativeSource),
      ];
      let buffer: Buffer | null = null;
      for (const candidate of candidates) {
        try {
          buffer = await readFile(candidate);
          break;
        } catch {
          // Try the next development/production asset location.
        }
      }
      if (!buffer) throw new Error(`Bundled asset not found: ${relativeSource}`);
      const uploaded = await this.files.upload(buffer, {
        fileName: `whatif-builtin-${basename(relativeSource)}`,
        contentType: relativeSource.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
      });
      return this.signed(uploaded.filePath);
    })();
    this.bundledModelReferenceCache.set(relativeSource, pending);
    try {
      return await pending;
    } catch (error) {
      this.bundledModelReferenceCache.delete(relativeSource);
      this.logger.warn(`Unable to prepare bundled model reference ${relativeSource}: ${error instanceof Error ? error.message : error}`);
      return '';
    }
  }

  private async ensureSeedanceCharacterMaster(ownerId: string, character: AnyRecord) {
    const characterId = String(character.characterId || character.id || '');
    if (!characterId) this.fail('CHARACTER_ID_MISSING', '人物资产缺少角色标识');
    const isLibraryCharacter = character.sourceType === 'official' || characterId.startsWith('builtin-') || characterId.startsWith('official-');
    const assetOwnerId = isLibraryCharacter ? 'system' : ownerId;
    const [existing] = await this.db.select().from(whatifCharacterAssets)
      .where(and(eq(whatifCharacterAssets.ownerId, assetOwnerId), eq(whatifCharacterAssets.characterId, characterId), eq(whatifCharacterAssets.kind, 'seedance-master'), eq(whatifCharacterAssets.status, 'ready'), eq(whatifCharacterAssets.confirmed, true)))
      .orderBy(desc(whatifCharacterAssets.createdAt)).limit(1);
    const existingMetadata = this.providerMetadata(existing);
    const isCurrentLibraryMaster = isLibraryCharacter
      && existing?.imagePath
      && existing.promptVersion === PROMPT_VERSIONS.seedanceCharacterMaster
      && existingMetadata?.provenance === 'seedream-text-original'
      && existingMetadata?.source === 'text-only-original-character';
    if (isCurrentLibraryMaster) return this.signed(existing.imagePath);
    const activeProviderSource = isLibraryCharacter ? '' : this.activeProviderSource(existing);
    if (activeProviderSource) return activeProviderSource;

    const source = isLibraryCharacter ? '' : existing?.imagePath || character.assetViews?.bodyFront || character.assetViews?.identityFace || character.avatarUrl;
    const sourceImage = source ? await this.modelReference(source) : '';
    if (!isLibraryCharacter && !sourceImage) this.fail('SEEDANCE_CHARACTER_SOURCE_MISSING', `${String(character.name || '所选人物')}缺少可用人物图，请重新选择或生成人物资产`);
    const generated = await this.ai.generateSeedanceCharacterMaster({ name: String(character.name || '故事角色'), description: String(character.description || character.summary || ''), sourceImage });
    const imagePath = await this.archiveRemote(generated.imageUrl, `${characterId}-seedance-master`);
    await this.db.insert(whatifCharacterAssets).values({ id: this.id('character_asset'), characterId, ownerId: assetOwnerId, version: Number(character.assetVersion || character.characterVersion || 1), kind: 'seedance-master', status: 'ready', referencePaths: [{ source: sourceImage || 'text-only-original-character', provider: generated.provider, providerModel: generated.providerModel, provenance: isLibraryCharacter ? 'seedream-text-original' : 'seedream-normalized-for-seedance', providerSourceUrl: generated.imageUrl, providerExpiresAt: this.providerUrlExpiresAt(generated.imageUrl) }], imagePath, promptVersion: generated.promptVersion, modelTraceId: generated.traceId, confirmed: true });
    return isLibraryCharacter ? this.signed(imagePath) : generated.imageUrl;
  }

  private async referenceAssetsFromSnapshots(ownerId: string, characters: AnyRecord[], worldview: AnyRecord) {
    const selected: Array<{ source: unknown; purpose: string; category: 'character_identity' | 'character_body' | 'world_style' }> = [];
    const add = (source: unknown, purpose: string, category: 'character_identity' | 'character_body' | 'world_style') => {
      if (source) selected.push({ source, purpose, category });
    };

    // A single Seedream-normalized master per actor preserves the provider
    // provenance that Seedance uses to accept fictional identity references.
    const masters: string[] = [];
    for (let index = 0; index < characters.length; index += 2) {
      masters.push(...await Promise.all(characters.slice(index, index + 2).map((character) => this.ensureSeedanceCharacterMaster(ownerId, character))));
    }
    characters.forEach((character, index) => {
      add(
        masters[index],
        `${String(character.name || '该角色')}的 Seedance 人物身份与全身形象主参考，只允许绑定该角色，锁定脸、发型、成年年龄、体型和基础造型`,
        'character_identity',
      );
    });
    // Keep the story world available before optional body references consume the 9-image allowance.
    add(
      worldview?.coverUrl,
      `${String(worldview?.name || '本故事')}的世界与场景美术参考，只锁定时代、环境、材质、色彩与光线`,
      'world_style',
    );
    const resolved = await Promise.all(selected.map(async (item) => ({
      url: await this.modelReference(item.source),
      purpose: item.purpose,
      category: item.category,
    })));
    const deduplicated = new Map<string, { url: string; purpose: string; category: 'character_identity' | 'character_body' | 'world_style' }>();
    for (const item of resolved) {
      if (!item.url) continue;
      const existing = deduplicated.get(item.url);
      if (existing) existing.purpose = `${existing.purpose}；${item.purpose}`;
      else deduplicated.set(item.url, { ...item });
    }
    return Array.from(deduplicated.values()).slice(0, 9).map((item, index) => ({
      ...item,
      token: `@图片${index + 1}`,
      role: 'reference_image' as const,
    }));
  }

  private async previousScene(ownerId: string, parentSceneId?: string) {
    if (!parentSceneId) return null;
    const [scene] = await this.db.select().from(whatifScenes).where(and(eq(whatifScenes.id, parentSceneId), eq(whatifScenes.ownerId, ownerId))).limit(1);
    return scene ? { id: scene.id, title: scene.title, summary: (scene.directorPlan as AnyRecord)?.summary, continuityOut: (scene.directorPlan as AnyRecord)?.continuityOut, sequence: scene.sequence, branchId: scene.branchId } : null;
  }

  private async selectedVideoTaskForScene(ownerId: string, sceneId: string) {
    const [scene] = await this.db.select().from(whatifScenes).where(and(eq(whatifScenes.id, sceneId), eq(whatifScenes.ownerId, ownerId))).limit(1);
    if (!scene) return null;
    if (scene.selectedResultId) {
      const [selected] = await this.db.select().from(whatifVideoTasks).where(and(eq(whatifVideoTasks.id, scene.selectedResultId), eq(whatifVideoTasks.ownerId, ownerId))).limit(1);
      if (selected) return selected;
    }
    const [latestSuccess] = await this.db.select().from(whatifVideoTasks)
      .where(and(eq(whatifVideoTasks.sceneId, sceneId), eq(whatifVideoTasks.ownerId, ownerId), eq(whatifVideoTasks.status, 'success')))
      .orderBy(desc(whatifVideoTasks.updatedAt)).limit(1);
    return latestSuccess || null;
  }

  private async previousSceneFrameSummary(ownerId: string, sceneId: string) {
    const task = await this.selectedVideoTaskForScene(ownerId, sceneId);
    if (!task) return { lastFrameAvailable: false, lastFrameUrl: '', videoTaskId: '' };
    const media = this.ai.videoMedia(task.responseSnapshot);
    const lastFrameUrl = await this.signed(task.lastFramePath) || media.lastFrameUrl || '';
    return {
      lastFrameAvailable: Boolean(task.lastFramePath || media.lastFrameUrl),
      lastFrameUrl,
      videoTaskId: task.id,
    };
  }

  private async previousLastFrameReference(ownerId: string, sceneId: string) {
    const task = await this.selectedVideoTaskForScene(ownerId, sceneId);
    if (!task) return null;
    if (task.lastFramePath) {
      const url = await this.signed(task.lastFramePath);
      return url ? { url, path: task.lastFramePath, taskId: task.id } : null;
    }
    const media = this.ai.videoMedia(task.responseSnapshot);
    if (!media.lastFrameUrl) return null;
    const lastFramePath = await this.archiveRemote(media.lastFrameUrl, `${sceneId}-last-frame`);
    await this.db.update(whatifVideoTasks).set({ lastFramePath, updatedAt: new Date() }).where(eq(whatifVideoTasks.id, task.id));
    const url = await this.signed(lastFramePath);
    return url ? { url, path: lastFramePath, taskId: task.id } : null;
  }

  async createSceneVideo(ownerId: string, draftId: string, body: AnyRecord) {
    const context = await this.draftContext(ownerId, draftId);
    const script = String(body.script || '').trim();
    if (!script) this.fail('SCENE_SCRIPT_REQUIRED', '请描述这一幕发生什么');
    const requestedVideoProvider = String(body.videoProvider || '').trim().toLowerCase();
    const videoProvider = requestedVideoProvider
      ? ({ seedance: 'seedance', happyhorse: 'dashscope_happyhorse', dashscope_happyhorse: 'dashscope_happyhorse' } as Record<string, string>)[requestedVideoProvider]
      : undefined;
    if (requestedVideoProvider && !videoProvider) this.fail('VIDEO_PROVIDER_INVALID', '请选择 Seedance 或 HappyHorse 生成视频', 422);
    const videoProviderConfig = this.ai.videoProviderConfig(videoProvider);
    const traceId = this.traceId();
    this.logger.log(JSON.stringify({
      event: 'whatif.video.generate.received',
      traceId,
      draftId,
      request: body,
    }));
    const previous = await this.previousScene(ownerId, body.parentSceneId ? String(body.parentSceneId) : undefined);
    const inheritPreviousLastFrame = Boolean(previous && body.inheritPreviousLastFrame !== false);
    let previousLastFrame: { url: string; path: string; taskId: string } | null = null;
    if (inheritPreviousLastFrame && previous) {
      try {
        previousLastFrame = await this.previousLastFrameReference(ownerId, previous.id);
      } catch (error) {
        this.logger.warn(`previous last frame unavailable: ${error instanceof Error ? error.message : error}`);
      }
    }
    if (inheritPreviousLastFrame && !previousLastFrame) this.fail('PREVIOUS_LAST_FRAME_UNAVAILABLE', '上一幕最后一帧暂时不可用，请取消继承后重试', 422);
    const hasProfessionalPlan = Boolean(body.directorPlan && Array.isArray(body.directorPlan.shots));
    const directionInput = { script, story: { title: context.draft.title, setting: context.draft.setting, relationship: context.draft.relationship, worldview: context.worldview }, characters: context.casts, previous };
    // The storyboard preview is optional. When the user skips it, do not block
    // video creation on the text model: preserve the raw user direction as one
    // continuous shootable event and let the deterministic compiler continue.
    const directorPlan = hasProfessionalPlan
      ? this.ai.normalizeDirectorPlan(body.directorPlan, context.casts)
      : this.ai.buildDirectScene(directionInput);
    if (directorPlan.capacity?.status === 'overflow' && body.force !== true) this.fail('SCENE_CAPACITY_OVERFLOW', directorPlan.capacity.message || '这一幕超过 15 秒，请缩短或拆成两幕', 422, { suggestedScript: directorPlan.capacity.suggestedScript });
    const baseReferenceAssets = await this.referenceAssetsFromSnapshots(ownerId, context.casts, context.worldview);
    const referenceAssets = [
      ...baseReferenceAssets,
      ...(previousLastFrame ? [{
        url: previousLastFrame.url,
        purpose: '上一幕最后一帧，只用于继承上一幕结束时的场景、人物位置、道具状态和画面连续性，不改变已锁定的人物身份',
        category: 'world_style' as const,
      }] : []),
    ].slice(0, 9).map((asset, index) => ({
      ...asset,
      token: `@图片${index + 1}`,
      role: 'reference_image' as const,
    }));
    const compilationInput = {
      story: { title: context.draft.title, setting: context.draft.setting, worldview: context.worldview },
      characters: context.casts,
      directorPlan,
      previous,
      userScript: script,
      referenceAssets: referenceAssets.map(({ token, role, purpose, category }) => ({ token, role, purpose, category })),
    };
    const compilation = await this.ai.compileSeedance(compilationInput);
    const requestedBranchId = body.branchId ? String(body.branchId) : undefined;
    const { story, branch } = await this.ensureStory(ownerId, draftId, requestedBranchId);
    const scenes = await this.db.select().from(whatifScenes).where(and(eq(whatifScenes.storyId, story.id), eq(whatifScenes.branchId, branch.id)));
    const sequence = scenes.length ? Math.max(...scenes.map((scene) => scene.sequence)) + 1 : Number(previous?.sequence || 0) + 1;
    const sceneId = this.id('scene');
    const taskId = this.id('video_task');
    const referenceImages = referenceAssets.map((asset) => asset.url);
    const worldviewStyleLock = [
      context.worldview?.name,
      context.worldview?.stylePrompt,
      context.worldview?.atmosphere,
      context.worldview?.description,
    ].filter(Boolean).join('；');
    const styleLockPrompt = `STORY STYLE LOCK — preserve the same visual medium, production design, color palette, lighting logic, material texture and camera finish across every scene in this story. Never switch between live action, anime, 3D, illustration or stylized animation. Locked worldview: ${worldviewStyleLock || 'inherit the approved story worldview exactly'}.`;
    const baseRequestSnapshot = {
      httpRequest: { draftId, body },
      resolvedInput: {
        script,
        story: {
          title: context.draft.title,
          setting: context.draft.setting,
          relationship: context.draft.relationship,
          worldview: context.worldview,
        },
        characters: context.casts,
        previous,
        directorPlan,
        directionMode: hasProfessionalPlan ? 'approved_professional_storyboard' : 'direct_user_script',
        inheritPreviousLastFrame,
        previousLastFrame: previousLastFrame ? { taskId: previousLastFrame.taskId, path: previousLastFrame.path } : null,
        videoProvider: videoProviderConfig.provider,
      },
      compilation,
      referenceAssets,
      referenceImages,
    };
    this.logger.log(JSON.stringify({
      event: 'whatif.video.generate.compiled',
      traceId,
      taskId,
      sceneId,
      draftId,
      videoProvider: videoProviderConfig.provider,
      requestSnapshot: baseRequestSnapshot,
    }));
    await this.db.transaction(async (tx) => {
      await tx.insert(whatifScenes).values({ id: sceneId, storyId: story.id, branchId: branch.id, ownerId, parentSceneId: body.parentSceneId || scenes.at(-1)?.id || null, sequence, title: String(directorPlan.title || `第${sequence}幕`), userScript: script, directorPlan, seedancePrompt: compilation.prompt, continuitySnapshot: directorPlan.continuityOut || {}, status: 'submitting' });
      await tx.insert(whatifVideoTasks).values({ id: taskId, sceneId, storyId: story.id, ownerId, model: videoProviderConfig.model, promptVersion: compilation.promptVersion, status: 'submitting', stage: 'submitting', progress: 12, requestSnapshot: baseRequestSnapshot, traceId });
      await tx.update(whatifStories).set({ activeBranchId: branch.id, updatedAt: new Date() }).where(eq(whatifStories.id, story.id));
    });
    try {
      const created = await this.ai.createVideo({
        prompt: `${compilation.prompt}\n${styleLockPrompt}\nNegative constraints: ${compilation.negativePrompt}`,
        promptBody: `${compilation.promptBody}\n${styleLockPrompt}\nNegative constraints: ${compilation.negativePrompt}`,
        referenceImages,
        referenceAssets,
        videoProvider,
        traceId,
        taskId,
        sceneId,
      });
      await this.db.transaction(async (tx) => {
        await tx.update(whatifVideoTasks).set({ providerTaskId: created.providerTaskId, status: 'queued', stage: 'model_generating', progress: 22, inputMode: created.inputMode, requestSnapshot: { ...baseRequestSnapshot, video: created.requestLog }, responseSnapshot: created.raw, updatedAt: new Date() }).where(eq(whatifVideoTasks.id, taskId));
        await tx.update(whatifScenes).set({ status: 'generating', updatedAt: new Date() }).where(eq(whatifScenes.id, sceneId));
        await tx.update(whatifStoryDrafts).set({ latestSceneDraft: {}, updatedAt: new Date() }).where(eq(whatifStoryDrafts.id, draftId));
      });
      return { taskId, sceneId, storyId: story.id, branchId: branch.id, status: 'queued', nextPage: 'video_generating', traceId };
    } catch (error) {
      const code = String((error as { response?: { code?: unknown }; code?: unknown })?.response?.code || (error as { code?: unknown })?.code || 'VIDEO_SUBMIT_FAILED');
      const message = error instanceof Error ? error.message : '视频任务提交失败';
      const requestLog = (error as { requestLog?: unknown })?.requestLog;
      await this.db.transaction(async (tx) => {
        await tx.update(whatifVideoTasks).set({ status: 'failed', stage: 'failed', progress: 100, requestSnapshot: requestLog ? { ...baseRequestSnapshot, video: requestLog } : baseRequestSnapshot, errorCode: code, errorMessage: message, updatedAt: new Date() }).where(eq(whatifVideoTasks.id, taskId));
        await tx.update(whatifScenes).set({ status: 'failed', chargeStatus: 'not_charged', updatedAt: new Date() }).where(eq(whatifScenes.id, sceneId));
      });
      throw error;
    }
  }

  private stageLabel(stage: string) {
    return ({ directing: 'AI 正在完成专业分镜', submitting: '正在提交视频任务', model_generating: '视频模型正在生成画面', quality_check: '正在检查人物、动作和声音', archiving: '正在保存成片', completed: '成片已完成' } as Record<string, string>)[stage] || '正在制作你的 15 秒故事';
  }

  private mapProgress(status: string, previous: number) {
    if (['succeeded', 'success', 'completed', 'done', 'finished'].includes(status)) return 96;
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) return 100;
    return Math.min(88, Math.max(previous + 4, 28));
  }

  private videoProviderFromTask(task: AnyRecord) {
    const requestSnapshot = (task.requestSnapshot && typeof task.requestSnapshot === 'object' ? task.requestSnapshot : {}) as AnyRecord;
    const providerTaskId = String(task.providerTaskId || '');
    return String(
      requestSnapshot.resolvedInput?.videoProvider
      || (providerTaskId.startsWith('dashscope_happyhorse:') ? 'dashscope_happyhorse' : providerTaskId.startsWith('yike:') ? 'yike' : 'seedance'),
    );
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
          const poster = await this.archiveOptionalRemote(upstream.firstFrameUrl || '', `${task.sceneId}-first-frame`, 'first frame');
          const lastFrame = await this.archiveOptionalRemote(upstream.lastFrameUrl || '', `${task.sceneId}-last-frame`, 'last frame');
          const frameWarnings = [poster.warning, lastFrame.warning].filter(Boolean);
          await this.db.transaction(async (tx) => {
            await tx.update(whatifVideoTasks).set({
              status: 'success',
              stage: 'completed',
              progress: 100,
              videoPath,
              posterPath: poster.path || task.posterPath,
              lastFramePath: lastFrame.path || task.lastFramePath,
              responseSnapshot: upstream.raw,
              qaResult: {
                status: archiveWarning || frameWarnings.length ? 'passed_with_warning' : 'passed',
                warning: [archiveWarning, ...frameWarnings].filter(Boolean).join('；') || undefined,
                checks: [
                  'provider_completed',
                  'video_url_present',
                  upstream.firstFrameUrl ? 'first_frame_url_present' : 'first_frame_url_not_returned',
                  upstream.lastFrameUrl ? 'last_frame_url_present' : 'last_frame_url_not_returned',
                  'duration_requested_15s',
                  'audio_requested',
                ],
              },
              updatedAt: new Date(),
            }).where(eq(whatifVideoTasks.id, task.id));
            await tx.update(whatifScenes).set({ status: 'success', selectedResultId: task.id, chargeStatus: 'charged', updatedAt: new Date() }).where(eq(whatifScenes.id, task.sceneId));
          });
        } else if (done) {
          const errorCode = `${this.videoProviderFromTask(task).toUpperCase()}_VIDEO_URL_MISSING`;
          await this.db.transaction(async (tx) => {
            await tx.update(whatifVideoTasks).set({ status: 'failed', stage: 'failed', progress: 100, errorCode, errorMessage: '视频模型已完成，但没有返回可播放成片地址', responseSnapshot: upstream.raw, updatedAt: new Date() }).where(eq(whatifVideoTasks.id, task.id));
            await tx.update(whatifScenes).set({ status: 'failed', chargeStatus: 'not_charged', updatedAt: new Date() }).where(eq(whatifScenes.id, task.sceneId));
          });
        } else if (failed) {
          const errorMessage = upstream.error || '视频模型返回失败，但没有错误详情';
          const errorCode = `${this.videoProviderFromTask(task).toUpperCase()}_TASK_FAILED`;
          await this.db.transaction(async (tx) => {
            await tx.update(whatifVideoTasks).set({ status: 'failed', stage: 'failed', progress: 100, errorCode, errorMessage, responseSnapshot: upstream.raw, updatedAt: new Date() }).where(eq(whatifVideoTasks.id, task.id));
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
    const media = this.ai.videoMedia(current.responseSnapshot);
    const videoProvider = this.videoProviderFromTask(current);
    return { taskId: current.id, sceneId: current.sceneId, storyId: current.storyId, draftId: story?.sourceDraftId, storyTitle: story?.title, sceneTitle: scene?.title, userScript: scene?.userScript, directorPlan: scene?.directorPlan, status: current.status, stage: current.stage, stageLabel: this.stageLabel(current.stage), progress: current.progress, inputMode: current.inputMode, videoProvider, videoUrl: await this.signed(current.videoPath), posterUrl: await this.signed(current.posterPath) || media.firstFrameUrl, lastFrameUrl: await this.signed(current.lastFramePath) || media.lastFrameUrl, errorCode: current.errorCode, errorMessage: current.errorMessage, chargeStatus: scene?.chargeStatus, priceSob: scene?.priceSob || 15, traceId: current.traceId || this.traceId() };
  }

  async getVideoResult(ownerId: string, taskId: string) {
    const result = await this.getVideoTask(ownerId, taskId);
    if (result.status !== 'success') return result;
    return { ...result, actions: ['continue', 'regenerate', 'timeline', 'publish'], traceId: this.traceId() };
  }

  private async videoTaskDebugPayload(ownerId: string, task: AnyRecord) {
    const [scene] = await this.db.select().from(whatifScenes).where(and(eq(whatifScenes.id, task.sceneId), eq(whatifScenes.ownerId, ownerId))).limit(1);
    const [story] = await this.db.select().from(whatifStories).where(and(eq(whatifStories.id, task.storyId), eq(whatifStories.ownerId, ownerId))).limit(1);
    return {
      taskId: task.id,
      providerTaskId: task.providerTaskId,
      traceId: task.traceId,
      draftId: story?.sourceDraftId,
      storyId: task.storyId,
      sceneId: task.sceneId,
      status: task.status,
      stage: task.stage,
      inputMode: task.inputMode,
      model: task.model,
      promptVersion: task.promptVersion,
      requestSnapshot: task.requestSnapshot,
      responseSnapshot: task.responseSnapshot,
      posterPath: task.posterPath,
      lastFramePath: task.lastFramePath,
      userScript: scene?.userScript,
      directorPlan: scene?.directorPlan,
      seedancePrompt: scene?.seedancePrompt,
      errorCode: task.errorCode,
      errorMessage: task.errorMessage,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  async getVideoTaskDebug(ownerId: string, taskId: string) {
    const [task] = await this.db.select().from(whatifVideoTasks).where(and(eq(whatifVideoTasks.id, taskId), eq(whatifVideoTasks.ownerId, ownerId))).limit(1);
    if (!task) throw new NotFoundException({ code: 'VIDEO_TASK_NOT_FOUND', message: '视频任务不存在' });
    return this.videoTaskDebugPayload(ownerId, task);
  }

  async getLatestVideoTaskDebug(ownerId: string, draftId: string) {
    const [story] = await this.db.select().from(whatifStories).where(and(eq(whatifStories.sourceDraftId, draftId), eq(whatifStories.ownerId, ownerId))).limit(1);
    if (!story) throw new NotFoundException({ code: 'STORY_NOT_FOUND', message: '该草稿还没有生成过视频' });
    const [task] = await this.db.select().from(whatifVideoTasks).where(and(eq(whatifVideoTasks.storyId, story.id), eq(whatifVideoTasks.ownerId, ownerId))).orderBy(desc(whatifVideoTasks.createdAt)).limit(1);
    if (!task) throw new NotFoundException({ code: 'VIDEO_TASK_NOT_FOUND', message: '该草稿还没有视频任务' });
    return this.videoTaskDebugPayload(ownerId, task);
  }

  async listStories(ownerId: string) {
    const stories = await this.db.select().from(whatifStories).where(eq(whatifStories.ownerId, ownerId)).orderBy(desc(whatifStories.updatedAt));
    const items = await Promise.all(stories.map(async (story) => {
      const scenes = await this.db.select().from(whatifScenes).where(eq(whatifScenes.storyId, story.id)).orderBy(whatifScenes.sequence);
      const tasks = scenes.length ? await this.db.select().from(whatifVideoTasks)
        .where(and(eq(whatifVideoTasks.ownerId, ownerId), inArray(whatifVideoTasks.sceneId, scenes.map((scene) => scene.id)), eq(whatifVideoTasks.status, 'success')))
        .orderBy(whatifVideoTasks.createdAt) : [];
      const firstCompletedScene = scenes.find((scene) => scene.status === 'success' && tasks.some((task) => task.sceneId === scene.id));
      const firstTask = firstCompletedScene
        ? tasks.find((task) => task.id === firstCompletedScene.selectedResultId) || tasks.find((task) => task.sceneId === firstCompletedScene.id)
        : tasks[0];
      const media = this.ai.videoMedia(firstTask?.responseSnapshot);
      const videoFrameCover = await this.signed(firstTask?.posterPath)
        || await this.signed(firstTask?.lastFramePath)
        || media.firstFrameUrl
        || media.lastFrameUrl;
      return { storyId: story.id, title: story.title, setting: story.setting, coverUrl: videoFrameCover || await this.signed(story.coverPath), status: story.status, sceneCount: scenes.length, completedSceneCount: scenes.filter((scene) => scene.status === 'success').length, latestScene: scenes.at(-1) || null, updatedAt: story.updatedAt };
    }));
    return { items, traceId: this.traceId() };
  }

  async getTimeline(ownerId: string, storyId: string) {
    const [story] = await this.db.select().from(whatifStories).where(and(eq(whatifStories.id, storyId), eq(whatifStories.ownerId, ownerId))).limit(1);
    if (!story) throw new NotFoundException({ code: 'STORY_NOT_FOUND', message: '故事不存在' });
    const branches = await this.db.select().from(whatifStoryBranches).where(eq(whatifStoryBranches.storyId, storyId)).orderBy(whatifStoryBranches.createdAt);
    const scenes = await this.db.select().from(whatifScenes).where(eq(whatifScenes.storyId, storyId)).orderBy(whatifScenes.sequence, whatifScenes.createdAt);
    const tasks = scenes.length ? await this.db.select().from(whatifVideoTasks).where(inArray(whatifVideoTasks.sceneId, scenes.map((scene) => scene.id))).orderBy(desc(whatifVideoTasks.createdAt)) : [];
    return {
      story: { ...story, coverUrl: await this.signed(story.coverPath) },
      branches,
      scenes: await Promise.all(scenes.map(async (scene) => {
        const task = tasks.find((item) => item.id === scene.selectedResultId) || tasks.find((item) => item.sceneId === scene.id);
        const media = this.ai.videoMedia(task?.responseSnapshot);
        return {
          ...scene,
          videoTaskId: task?.id,
          videoUrl: await this.signed(task?.videoPath),
          posterUrl: await this.signed(task?.posterPath) || media.firstFrameUrl,
          lastFrameUrl: await this.signed(task?.lastFramePath) || media.lastFrameUrl,
          errorCode: task?.errorCode,
          errorMessage: task?.errorMessage,
        };
      })),
      traceId: this.traceId(),
    };
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
    const successfulTasks = selected
      .map((scene) => latestTask.find((task) => task.sceneId === scene.id && task.status === 'success'))
      .filter((task): task is typeof latestTask[number] => Boolean(task));
    if (successfulTasks.length !== selected.length || successfulTasks.some((task) => !task.videoPath)) this.fail('PUBLICATION_VIDEO_REQUIRED', '选中的幕缺少已完成视频，请刷新后重试');
    const firstTask = successfulTasks[0];
    const publicationId = this.id('publication');
    let publicationVideoPath = '';
    try {
      publicationVideoPath = await this.composePublicationVideo(successfulTasks, publicationId);
    } catch (error) {
      this.logger.warn(`publication video compose failed: ${error instanceof Error ? error.message : error}`);
      if (selected.length > 1) this.fail('PUBLICATION_VIDEO_COMPOSE_FAILED', '完整故事视频合成失败，请稍后重试');
      publicationVideoPath = firstTask.videoPath || '';
    }
    await this.db.insert(whatifPublications).values({ id: publicationId, storyId, ownerId, sceneIds: validSelectedIds, title: String(body.title || copy.title), summary: String(body.summary || copy.summary), coverPath: firstTask?.posterPath || firstTask?.lastFramePath || timeline.story.coverPath, videoPath: publicationVideoPath || null, status: body.publish === true ? 'published' : 'draft', visibility: body.visibility === 'private' ? 'private' : 'public', canRemix: body.canRemix !== false, remixTemplate: { storyTitle: timeline.story.title, setting: timeline.story.setting, sceneClues: selected.map((scene) => scene.userScript), composeStatus: publicationVideoPath ? 'success' : 'fallback_split' } });
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
    const orderedTasks = sceneIds.map((sceneId) => tasks.find((item) => item.sceneId === sceneId)).filter((task): task is typeof tasks[number] => Boolean(task));
    let publicationVideoPath = publication.videoPath || '';
    if (!publicationVideoPath && sceneIds.length > 1 && orderedTasks.length === sceneIds.length && orderedTasks.every((task) => task.videoPath)) {
      try {
        publicationVideoPath = await this.composePublicationVideo(orderedTasks, publication.id);
        if (publicationVideoPath) {
          await this.db.update(whatifPublications).set({ videoPath: publicationVideoPath, remixTemplate: { ...(publication.remixTemplate as AnyRecord), composeStatus: 'success_backfilled' }, updatedAt: new Date() }).where(eq(whatifPublications.id, publication.id));
        }
      } catch (error) {
        this.logger.warn(`publication video backfill failed: ${error instanceof Error ? error.message : error}`);
      }
    }
    const orderedScenes = await Promise.all(sceneIds.map(async (sceneId) => {
      const scene = scenes.find((item) => item.id === sceneId);
      const task = tasks.find((item) => item.sceneId === sceneId);
      return scene && task ? { sceneId, title: scene.title, summary: (scene.directorPlan as AnyRecord)?.summary || scene.userScript, durationSeconds: task.durationSeconds, videoUrl: await this.signed(task.videoPath), directorPlan: scene.directorPlan } : null;
    }));
    return { workId: publication.id, title: publication.title, subtitle: publication.summary, summary: publication.summary, coverUrl: await this.signed(publication.coverPath), videoUrl: await this.signed(publicationVideoPath), authorName: 'Whatif 创作者', avatarUrl: `${ASSET_BASE}/self.jpg`, likeCount: publication.likeCount, durationSeconds: orderedScenes.filter(Boolean).reduce((total, scene) => total + Number(scene?.durationSeconds || 15), 0), canRemix: publication.canRemix, scenes: orderedScenes.filter(Boolean), traceId: this.traceId() };
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
    const savedCharacterSnapshot = { ...savedCharacter, voiceProfile: await this.latestVoiceProfile(ownerId, characterId, savedCharacter) };
    const assets = await this.db.select().from(whatifCharacterAssets).where(and(eq(whatifCharacterAssets.characterId, characterId), eq(whatifCharacterAssets.ownerId, ownerId), eq(whatifCharacterAssets.confirmed, true)));
    const snapshotId = this.id('auth_snapshot');
    await this.db.transaction(async (tx) => {
      await tx.insert(whatifAuthorizationSnapshots).values({ id: snapshotId, invitationId, ownerId, characterId, characterVersion: savedCharacter.currentVersion, assetSnapshot: { character: savedCharacterSnapshot, assets }, scope: 'invitation_story_only', status: 'active' });
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

  async voiceOptions() {
    return this.voices.voiceOptions();
  }

  async previewVoice(ownerId: string, body: AnyRecord) {
    return this.voices.generatePreviewAudio(ownerId, body.voiceProfile || body, String(body.text || ''));
  }
}
