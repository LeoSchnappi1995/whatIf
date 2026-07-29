import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import type {
  CastCharacter,
  CastDraftState,
  HomeStatusCard,
  WhatifWork,
  WorldviewOption,
} from './whatif.types';

// Use a path relative to the app base so assets work both locally and under
// Miaoda's `/app/{app_id}/` runtime prefix.
const ASSET_BASE = 'assets/whatif';

const works: WhatifWork[] = [
  {
    id: 'work-001',
    title: '我们在城市尽头重逢',
    subtitle: '都市 · 久别重逢',
    coverUrl: `${ASSET_BASE}/cinema.png`,
    authorName: '小岛来信',
    avatarUrl: `${ASSET_BASE}/self.jpg`,
    likeCount: 32841,
    durationSeconds: 60,
  },
  {
    id: 'work-002',
    title: '穿越到唐朝',
    subtitle: '古风 · 命运重写',
    coverUrl: `${ASSET_BASE}/anime.jpg`,
    authorName: '晚风有信',
    avatarUrl: `${ASSET_BASE}/jiangyu.png`,
    likeCount: 28712,
    durationSeconds: 45,
  },
  {
    id: 'work-003',
    title: '和你错过的夏天',
    subtitle: '青春 · 遗憾重逢',
    coverUrl: `${ASSET_BASE}/fresh.jpg`,
    authorName: '林屿森',
    avatarUrl: `${ASSET_BASE}/self.jpg`,
    likeCount: 24490,
    durationSeconds: 30,
  },
  {
    id: 'work-004',
    title: '假如我们没有分开',
    subtitle: '都市 · 雨夜重逢',
    coverUrl: `${ASSET_BASE}/retro.jpg`,
    authorName: '江屿',
    avatarUrl: `${ASSET_BASE}/jiangyu.png`,
    likeCount: 21305,
    durationSeconds: 60,
  },
  {
    id: 'work-005',
    title: '2056 年的最后一封信',
    subtitle: '未来 · 平行世界',
    coverUrl: `${ASSET_BASE}/cinema.png`,
    authorName: '北辰',
    avatarUrl: `${ASSET_BASE}/jiangyu.png`,
    likeCount: 19883,
    durationSeconds: 45,
  },
  {
    id: 'work-006',
    title: '如果小狗会说话',
    subtitle: '治愈 · 家庭日常',
    coverUrl: `${ASSET_BASE}/fresh.jpg`,
    authorName: '毛球计划',
    avatarUrl: `${ASSET_BASE}/self.jpg`,
    likeCount: 18672,
    durationSeconds: 30,
  },
  {
    id: 'work-007',
    title: '成为魔法学院新生',
    subtitle: '魔法 · 成长冒险',
    coverUrl: `${ASSET_BASE}/anime.jpg`,
    authorName: '阿雾',
    avatarUrl: `${ASSET_BASE}/self.jpg`,
    likeCount: 16942,
    durationSeconds: 60,
  },
  {
    id: 'work-008',
    title: '醒来后世界只剩我们',
    subtitle: '末日 · 双人逃生',
    coverUrl: `${ASSET_BASE}/retro.jpg`,
    authorName: '重启日记',
    avatarUrl: `${ASSET_BASE}/jiangyu.png`,
    likeCount: 15108,
    durationSeconds: 45,
  },
  {
    id: 'work-009',
    title: '在海边重过十八岁',
    subtitle: '青春 · 人生重启',
    coverUrl: `${ASSET_BASE}/fresh.jpg`,
    authorName: '鲸落',
    avatarUrl: `${ASSET_BASE}/self.jpg`,
    likeCount: 13775,
    durationSeconds: 30,
  },
  {
    id: 'work-010',
    title: '成为他的唯一搭档',
    subtitle: '悬疑 · 并肩破局',
    coverUrl: `${ASSET_BASE}/cinema.png`,
    authorName: '无名侦探',
    avatarUrl: `${ASSET_BASE}/jiangyu.png`,
    likeCount: 12220,
    durationSeconds: 60,
  },
  {
    id: 'work-011',
    title: '误入精灵的森林',
    subtitle: '奇幻 · 治愈旅程',
    coverUrl: `${ASSET_BASE}/anime.jpg`,
    authorName: '星野',
    avatarUrl: `${ASSET_BASE}/self.jpg`,
    likeCount: 10892,
    durationSeconds: 45,
  },
  {
    id: 'work-012',
    title: '旧书店从未关门',
    subtitle: '复古 · 时间循环',
    coverUrl: `${ASSET_BASE}/retro.jpg`,
    authorName: '纸页之间',
    avatarUrl: `${ASSET_BASE}/jiangyu.png`,
    likeCount: 9741,
    durationSeconds: 30,
  },
];

const castCharacters: CastCharacter[] = [
  {
    characterId: 'self-linxia',
    name: '林夏',
    avatarUrl: `${ASSET_BASE}/self.jpg`,
    summary: '温柔真诚 · 故事里的我',
    sourceType: 'self',
    badges: ['我'],
    selectable: true,
    authorizationStatus: 'not_required',
    assetVersion: 3,
  },
  {
    characterId: 'official-jiangyu',
    name: '江屿',
    avatarUrl: `${ASSET_BASE}/jiangyu.png`,
    summary: '温柔克制 · 都市爱情',
    sourceType: 'official',
    badges: ['官方', '热门'],
    selectable: true,
    authorizationStatus: 'not_required',
    assetVersion: 8,
  },
  {
    characterId: 'custom-sunian',
    name: '苏念',
    avatarUrl: `${ASSET_BASE}/role-female-b.png`,
    summary: '外冷内热 · 我的角色',
    sourceType: 'custom',
    badges: ['我的'],
    selectable: true,
    authorizationStatus: 'not_required',
    assetVersion: 2,
  },
  {
    characterId: 'friend-yunzhou',
    name: '云舟',
    avatarUrl: `${ASSET_BASE}/role-male-b.png`,
    summary: '可靠开朗 · 好友已授权',
    sourceType: 'friend',
    badges: ['好友'],
    selectable: true,
    authorizationStatus: 'authorized',
    assetVersion: 1,
  },
  {
    characterId: 'official-shenyan',
    name: '沈砚',
    avatarUrl: `${ASSET_BASE}/role-male-a.png`,
    summary: '冷静锋利 · 未来世界',
    sourceType: 'official',
    badges: ['官方'],
    selectable: true,
    authorizationStatus: 'not_required',
    assetVersion: 4,
  },
  {
    characterId: 'friend-pending',
    name: '等待好友确认',
    avatarUrl: `${ASSET_BASE}/role-female-a.png`,
    summary: '邀请已发送 · 暂不可选择',
    sourceType: 'friend',
    badges: ['待确认'],
    selectable: false,
    unavailableReason: '好友完成角色创建并授权后才可选择',
    authorizationStatus: 'pending',
    assetVersion: 1,
  },
];

const worldviews: WorldviewOption[] = [
  {
    worldviewId: 'modern-city',
    name: '现代都市',
    coverUrl: `${ASSET_BASE}/world-modern-romance.jpg`,
    atmosphere: '霓虹雨夜与错过的重逢',
    recommended: true,
    available: true,
    assetVersion: 6,
  },
  {
    worldviewId: 'period-romance',
    name: '旧时代',
    coverUrl: `${ASSET_BASE}/world-period-romance.jpg`,
    atmosphere: '命运岔路上的同行与告别',
    recommended: false,
    available: true,
    assetVersion: 2,
  },
  {
    worldviewId: 'future-parallel',
    name: '未来平行线',
    coverUrl: `${ASSET_BASE}/world-future.png`,
    atmosphere: '在另一个时间节点再次相遇',
    recommended: false,
    available: true,
    assetVersion: 5,
  },
  {
    worldviewId: 'art-life',
    name: '文艺人生',
    coverUrl: `${ASSET_BASE}/world-art-story.jpg`,
    atmosphere: '共同完成未说出口的梦想',
    recommended: false,
    available: true,
    assetVersion: 3,
  },
];

interface DemoUserState {
  pendingInvitation?: boolean;
  generationTask?: 'processing' | 'failed';
  collaborationReady?: boolean;
  resumableStory?: boolean;
  characterCreatedWithin24Hours?: boolean;
  characterCount: number;
}

@Injectable()
export class WhatifService {
  private readonly drafts = new Map<string, CastDraftState>();

  getHome() {
    const pageSize = 6;
    const userState: DemoUserState = { characterCount: 2 };

    return {
      hero: {
        id: 'hero-rain-reunion',
        title: '假如你和江宇在城市尽头重逢',
        subtitle: '都市爱情 · 久别重逢 · 第 1 幕 · 15 秒',
        coverUrl: `${ASSET_BASE}/cinema.png`,
        durationSeconds: 15,
      },
      statusCard: this.resolveStatusCard(userState),
      works: works.slice(0, pageSize),
      nextCursor: this.encodeCursor(pageSize),
      hasMore: works.length > pageSize,
    };
  }

  getWorks(cursor: string | undefined, requestedPageSize: number) {
    const pageSize = Math.min(Math.max(requestedPageSize || 6, 2), 10);
    const start = this.decodeCursor(cursor);
    const pageWorks = works.slice(start, start + pageSize);
    const nextOffset = start + pageWorks.length;

    return {
      works: pageWorks.length > 0 ? pageWorks : works.slice(0, pageSize),
      nextCursor:
        nextOffset >= works.length ? this.encodeCursor(0) : this.encodeCursor(nextOffset),
      hasMore: works.length > pageSize,
    };
  }

  createStoryDraft(source = 'home_create', workId?: string) {
    const draftId = `draft_${randomUUID()}`;
    this.drafts.set(draftId, {
      draftId,
      draftVersion: 1,
      characterIds: ['self-linxia', 'official-jiangyu'],
      worldviewId: 'modern-city',
      updatedAt: new Date().toISOString(),
    });

    return {
      draftId,
      nextPage: 'cast_setting' as const,
      source,
      sourceWorkId: workId ?? null,
      createdAt: new Date().toISOString(),
    };
  }

  getCastSetting(draftId: string) {
    const draft = this.ensureDraft(draftId);
    const selectedCharacters = castCharacters.filter((character) =>
      draft.characterIds.includes(character.characterId),
    );

    return {
      draftId,
      draftVersion: draft.draftVersion,
      maxCharacterCount: 3,
      selectedCharacterIds: selectedCharacters.map((character) => character.characterId),
      selectedWorldviewId: draft.worldviewId,
      characterItems: castCharacters,
      worldviewItems: worldviews,
      canProceed: selectedCharacters.length > 0 && Boolean(draft.worldviewId),
      validationMessage:
        selectedCharacters.length === 0
          ? '至少选择 1 个角色'
          : draft.worldviewId
            ? null
            : '请选择 1 个世界观',
      nextCursor: null,
      hasMore: false,
      traceId: randomUUID(),
    };
  }

  getCharacterCandidates(draftId: string, cursor: string | undefined, requestedPageSize: number) {
    this.ensureDraft(draftId);
    const pageSize = Math.min(Math.max(requestedPageSize || 6, 2), 10);
    const start = this.decodeCursor(cursor);
    const characters = castCharacters.slice(start, start + pageSize);
    const nextOffset = start + characters.length;

    return {
      characters,
      nextCursor:
        nextOffset >= castCharacters.length ? null : this.encodeCursor(nextOffset),
      hasMore: nextOffset < castCharacters.length,
      traceId: randomUUID(),
    };
  }

  updateCastSetting(
    draftId: string,
    input: {
      characterIds: string[];
      worldviewId?: string | null;
      draftVersion: number;
      confirm?: boolean;
    },
  ) {
    const draft = this.ensureDraft(draftId);
    const uniqueCharacterIds = [...new Set(input.characterIds)];

    if (uniqueCharacterIds.length > 3) {
      throw new BadRequestException('最多选择 3 个角色，请先取消一个角色');
    }

    const validCharacterIds = uniqueCharacterIds.filter((characterId) =>
      castCharacters.some(
        (character) => character.characterId === characterId && character.selectable,
      ),
    );

    if (validCharacterIds.length !== uniqueCharacterIds.length) {
      throw new BadRequestException('部分角色当前不可使用，请重新选择');
    }

    const worldviewId = input.worldviewId ?? null;
    const validWorldview = worldviewId
      ? worldviews.some(
          (worldview) => worldview.worldviewId === worldviewId && worldview.available,
        )
      : false;

    if (worldviewId && !validWorldview) {
      throw new BadRequestException('该世界观当前不可使用，请重新选择');
    }

    if (input.confirm && (validCharacterIds.length === 0 || !validWorldview)) {
      throw new BadRequestException(
        validCharacterIds.length === 0 ? '至少选择 1 个角色' : '请选择 1 个世界观',
      );
    }

    draft.characterIds = validCharacterIds;
    draft.worldviewId = worldviewId;
    draft.draftVersion += 1;
    draft.updatedAt = new Date().toISOString();

    return {
      draftId,
      draftVersion: draft.draftVersion,
      selectedCharacterIds: draft.characterIds,
      selectedWorldviewId: draft.worldviewId,
      removedCharacterIds: uniqueCharacterIds.filter(
        (characterId) => !validCharacterIds.includes(characterId),
      ),
      canProceed: draft.characterIds.length > 0 && Boolean(draft.worldviewId),
      nextPage: input.confirm ? 'scene_description' : null,
      traceId: randomUUID(),
    };
  }

  private resolveStatusCard(state: DemoUserState): HomeStatusCard {
    const characters = [
      {
        id: 'self-aa',
        name: 'AA',
        avatarUrl: `${ASSET_BASE}/self.jpg`,
        ownerType: 'self' as const,
      },
      {
        id: 'friend-jiangyu',
        name: '江宇',
        avatarUrl: `${ASSET_BASE}/jiangyu.png`,
        ownerType: 'friend' as const,
      },
    ];

    if (state.pendingInvitation) {
      return {
        type: 'pending_invitation',
        eyebrow: '好友邀请',
        title: '江宇邀请你加入故事',
        description: '雨夜重逢 · 等你提交角色授权',
        actionLabel: '处理邀请',
        secondaryLabel: '我的故事',
        storyId: 'story-invite-01',
        characters,
      };
    }

    if (state.generationTask) {
      return {
        type: state.generationTask === 'failed' ? 'video_failed' : 'video_generating',
        eyebrow: state.generationTask === 'failed' ? '生成失败' : '视频生成中',
        title:
          state.generationTask === 'failed'
            ? '雨夜重逢 · 第 3 幕未完成'
            : '雨夜重逢 · 第 3 幕正在生成',
        description:
          state.generationTask === 'failed'
            ? '可重新编辑后再次生成'
            : '预计还需约 1 分钟，完成后会通知你',
        actionLabel: state.generationTask === 'failed' ? '重新编辑' : '查看任务',
        secondaryLabel: '我的故事',
        taskId: 'task-03',
        progress: state.generationTask === 'processing' ? 67 : undefined,
        characters,
      };
    }

    if (state.collaborationReady) {
      return {
        type: 'collaboration_ready',
        eyebrow: '参与的故事有新成片',
        title: '你参与的故事更新成片',
        description: '江宇发布了《雨夜重逢》第 1 幕',
        actionLabel: '观看新片',
        secondaryLabel: '我的故事',
        storyId: 'story-collab-01',
        characters,
      };
    }

    if (state.resumableStory) {
      return {
        type: 'story_resumable',
        eyebrow: '可续写故事',
        title: '继续：雨夜重逢',
        description: '已完成 2 幕，可以续写下一幕',
        actionLabel: '续写下一幕',
        secondaryLabel: '我的故事',
        storyId: 'story-resume-01',
        characters,
      };
    }

    if (state.characterCreatedWithin24Hours) {
      return {
        type: 'character_created',
        eyebrow: '角色创建成功',
        title: '你的角色 AA 已创建',
        description: '已经可以开始创作平行世界',
        actionLabel: '创建平行世界',
        secondaryLabel: '我的故事',
        characters,
      };
    }

    if (state.characterCount > 0) {
      return {
        type: 'existing_character',
        title: '我的角色',
        description: 'AA · 故事里的我，还有 1 个好友角色',
        actionLabel: '创建我的平行世界',
        secondaryLabel: '我的故事',
        characters,
      };
    }

    return {
      type: 'no_character',
      title: '还没有我的角色',
      description: '创建后可持续用于每一个平行世界',
      actionLabel: '创建我的平行世界',
      secondaryLabel: '我的故事',
      characters: [],
    };
  }

  private encodeCursor(offset: number) {
    return Buffer.from(`whatif:${offset}`).toString('base64url');
  }

  private decodeCursor(cursor?: string) {
    if (!cursor) return 0;
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      const [, value] = decoded.split(':');
      const offset = Number(value);
      return Number.isFinite(offset) ? Math.max(0, offset) : 0;
    } catch {
      return 0;
    }
  }

  private ensureDraft(draftId: string) {
    const existing = this.drafts.get(draftId);
    if (existing) return existing;

    const draft: CastDraftState = {
      draftId,
      draftVersion: 1,
      characterIds: ['self-linxia', 'official-jiangyu'],
      worldviewId: 'modern-city',
      updatedAt: new Date().toISOString(),
    };
    this.drafts.set(draftId, draft);
    return draft;
  }
}
