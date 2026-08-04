import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  CircleAlert,
  Clock3,
  Heart,
  LoaderCircle,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

import { createStoryDraft, getWhatifHome, getWhatifWorks } from '@/api';
import { resolveAppAssetUrl } from '@/lib/app-base-path';

import type {
  HomeStatusCard,
  StatusCardType,
  WhatifHomeResponse,
  WhatifWork,
} from './types';
import './whatif-home.css';

const SCROLL_STORAGE_KEY = 'whatif-home-scroll-y';

const previewCards: Partial<Record<StatusCardType, HomeStatusCard>> = {
  pending_invitation: {
    type: 'pending_invitation',
    eyebrow: '好友邀请',
    title: '江宇邀请你加入故事',
    description: '雨夜重逢 · 等你提交角色授权',
    actionLabel: '处理邀请',
    secondaryLabel: '我的故事',
    storyId: 'story-invite-01',
    characters: [],
  },
  video_generating: {
    type: 'video_generating',
    eyebrow: '视频生成中',
    title: '雨夜重逢 · 第 3 幕正在生成',
    description: '预计还需约 1 分钟，完成后会通知你',
    actionLabel: '查看任务',
    secondaryLabel: '我的故事',
    progress: 67,
    taskId: 'task-03',
    characters: [],
  },
  video_failed: {
    type: 'video_failed',
    eyebrow: '生成失败',
    title: '雨夜重逢 · 第 3 幕未完成',
    description: '素材校验未通过，可重新编辑后再次生成',
    actionLabel: '重新编辑',
    secondaryLabel: '我的故事',
    taskId: 'task-failed-03',
    characters: [],
  },
  collaboration_ready: {
    type: 'collaboration_ready',
    eyebrow: '参与的故事有新成片',
    title: '你参与的故事更新成片',
    description: '江宇发布了《雨夜重逢》第 1 幕',
    actionLabel: '观看新片',
    secondaryLabel: '我的故事',
    storyId: 'story-collab-01',
    characters: [],
  },
  story_resumable: {
    type: 'story_resumable',
    eyebrow: '可续写故事',
    title: '继续：雨夜重逢',
    description: '已完成 2 幕，可以续写下一幕',
    actionLabel: '续写下一幕',
    secondaryLabel: '我的故事',
    storyId: 'story-resume-01',
    characters: [],
  },
  character_created: {
    type: 'character_created',
    eyebrow: '角色创建成功',
    title: '你的角色 AA 已创建',
    description: '已经可以开始创作平行世界',
    actionLabel: '创建平行世界',
    secondaryLabel: '我的故事',
    characters: [],
  },
  existing_character: {
    type: 'existing_character',
    title: '我的角色',
    description: 'AA · 故事里的我，还有 1 个好友角色',
    actionLabel: '创建我的平行世界',
    secondaryLabel: '我的故事',
    characters: [],
  },
  no_character: {
    type: 'no_character',
    title: '还没有我的角色',
    description: '创建后可持续用于每一个平行世界',
    actionLabel: '创建我的平行世界',
    secondaryLabel: '我的故事',
    characters: [],
  },
};

function formatLikes(value: number) {
  if (value < 10000) return `${value}`;
  return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`;
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      response?: { data?: { error?: { code?: string; message?: string; details?: string } } };
      message?: string;
    };
    const payload = candidate.response?.data?.error;
    return payload?.message ? `${payload.message}${payload.code ? ` (${payload.code})` : ''}${payload.details ? `：${payload.details}` : ''}` : candidate.message;
  }
  return undefined;
}

function CharacterAvatars({ card }: { card: HomeStatusCard }) {
  const characters = card.characters.slice(0, 3);

  if (characters.length === 0) {
    return (
      <div className="status-symbol" aria-hidden="true">
        {card.type === 'pending_invitation' ? (
          <UsersRound size={20} />
        ) : card.type === 'video_generating' ? (
          <LoaderCircle className="spin" size={20} />
        ) : card.type === 'video_failed' ? (
          <CircleAlert size={20} />
        ) : card.type === 'story_resumable' ? (
          <Plus size={21} />
        ) : (
          <Sparkles size={20} />
        )}
      </div>
    );
  }

  return (
    <div className="character-avatars" aria-label="故事角色">
      {characters.map((character) => (
        <img key={character.id} src={resolveAppAssetUrl(character.avatarUrl)} alt={character.name} />
      ))}
    </div>
  );
}

function StatusCard({
  card,
  onPrimary,
  onSecondary,
  onManage,
}: {
  card: HomeStatusCard;
  onPrimary: () => void;
  onSecondary: () => void;
  onManage: () => void;
}) {
  const isCharacterCard =
    card.type === 'existing_character' || card.type === 'no_character';

  return (
    <section className={`status-card status-${card.type}`}>
      <div className="status-card-main">
        <CharacterAvatars card={card} />
        <div className="status-copy">
          {card.eyebrow && <span className="status-eyebrow">{card.eyebrow}</span>}
          <strong>{card.title}</strong>
          <span>{card.description}</span>
          {typeof card.progress === 'number' && (
            <div className="status-progress" aria-label={`生成进度 ${card.progress}%`}>
              <i style={{ width: `${card.progress}%` }} />
            </div>
          )}
        </div>
        {isCharacterCard && (
          <button
            className="status-manage"
            type="button"
            onClick={onManage}
          >
            {card.type === 'no_character' ? '去创建' : '管理'}
          </button>
        )}
      </div>

      <div className="status-actions">
        <button className="primary-action" type="button" onClick={onPrimary}>
          {card.actionLabel ?? '创建我的平行世界'}
        </button>
        <button className="secondary-action" type="button" onClick={onSecondary}>
          {card.secondaryLabel ?? '我的故事'}
        </button>
      </div>
    </section>
  );
}

function WorkCard({ work, onOpen }: { work: WhatifWork; onOpen: () => void }) {
  const isGeneratedStory = work.sourceType === 'generated_story';
  const fallbackCoverUrl = resolveAppAssetUrl('assets/whatif/cinema.png');
  return (
    <article className="work-card" onClick={onOpen}>
      <div className="work-cover">
        <img
          src={resolveAppAssetUrl(work.coverUrl || 'assets/whatif/cinema.png')}
          alt={work.title}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = fallbackCoverUrl;
          }}
        />
        <span className="mini-play" aria-hidden="true">
          <Play size={12} fill="currentColor" />
        </span>
        <span className="work-duration">{work.durationSeconds}s</span>
      </div>
      <div className="work-copy">
        <h3>{work.title}</h3>
        <p>{work.subtitle}</p>
        <div className="work-meta">
          <span>
            <img src={resolveAppAssetUrl(work.avatarUrl)} alt="" />
            {work.authorName}
          </span>
          {isGeneratedStory ? <span>{work.sceneCount || Math.max(1, Math.round(work.durationSeconds / 15))}幕</span> : <span><Heart size={12} />{formatLikes(work.likeCount)}</span>}
        </div>
      </div>
    </article>
  );
}

function HomeSkeleton() {
  return (
    <main className="whatif-page">
      <div className="whatif-shell skeleton-shell">
        <div className="skeleton-line skeleton-title" />
        <div className="skeleton-block skeleton-hero" />
        <div className="skeleton-block skeleton-status" />
        <div className="skeleton-line skeleton-section-title" />
        <div className="works-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="skeleton-block skeleton-work" key={index} />
          ))}
        </div>
      </div>
    </main>
  );
}

export default function WhatifHome() {
  const navigate = useNavigate();
  const [data, setData] = useState<WhatifHomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const worksTitleRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const previewState = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get('previewState');
    return value && value in previewCards ? (value as keyof typeof previewCards) : null;
  }, []);

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getWhatifHome();
      setData(
        previewState
          ? { ...response, statusCard: { ...previewCards[previewState]!, characters: response.statusCard.characters } }
          : response,
      );
      requestAnimationFrame(() => {
        const savedY = Number(sessionStorage.getItem(SCROLL_STORAGE_KEY) || 0);
        if (savedY > 0) window.scrollTo({ top: savedY, behavior: 'auto' });
      });
    } catch (homeError) {
      setError(getErrorMessage(homeError) ?? '首页加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [previewState]);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  useEffect(() => {
    const savePosition = () => {
      sessionStorage.setItem(SCROLL_STORAGE_KEY, String(window.scrollY));
    };
    window.addEventListener('pagehide', savePosition);
    return () => {
      savePosition();
      window.removeEventListener('pagehide', savePosition);
    };
  }, []);

  const handleCreate = async (workId?: string) => {
    if (creating) return;
    setCreating(true);
    try {
      const draft = await createStoryDraft({
        source: workId ? 'work_remake' : 'home_create',
        workId,
      });
      navigate(`/story-drafts/${draft.draftId}/cast`);
    } catch (createError) {
      toast.error(getErrorMessage(createError) ?? '创建失败，请重试');
    } finally {
      setCreating(false);
    }
  };

  const handlePrimaryAction = () => {
    if (!data) return;
    const { targetPage, targetId, type } = data.statusCard;
    if (targetPage === 'invitation' && targetId) return navigate(`/invitations/${targetId}`);
    if (targetPage === 'video_task' && targetId) return navigate(`/video-tasks/${targetId}`);
    if (targetPage === 'timeline' && targetId) return navigate(`/stories/${targetId}/timeline`);
    if (targetPage === 'character_new' || type === 'no_character') return navigate('/characters/new');
    if (type === 'pending_invitation' && data.statusCard.storyId) return navigate(`/invitations/${data.statusCard.storyId}`);
    if ((type === 'video_generating' || type === 'video_failed') && data.statusCard.taskId) return navigate(`/video-tasks/${data.statusCard.taskId}`);
    if ((type === 'story_resumable' || type === 'continuable_story') && data.statusCard.storyId) return navigate(`/stories/${data.statusCard.storyId}/timeline`);
    void handleCreate();
  };

  const handleNextBatch = useCallback(async () => {
    if (!data || batchLoading) return;
    if (!data.nextCursor) {
      toast(data.works.some((work) => work.sourceType === 'generated_story') ? '已展示全部已生成故事' : '已经看完本轮热门作品');
      return;
    }
    setBatchLoading(true);
    try {
      const response = await getWhatifWorks(data.nextCursor, 6);
      setData((current) =>
        current
          ? {
              ...current,
              works: [
                ...current.works,
                ...response.works.filter((work) => !current.works.some((item) => item.id === work.id)),
              ],
              nextCursor: response.nextCursor,
              hasMore: response.hasMore,
            }
          : current,
      );
    } catch (worksError) {
      toast.error(getErrorMessage(worksError) ?? '加载更多失败，请重试');
    } finally {
      setBatchLoading(false);
    }
  }, [batchLoading, data]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !data?.hasMore || loading || batchLoading) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void handleNextBatch();
    }, { rootMargin: '240px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [batchLoading, data?.hasMore, handleNextBatch, loading]);

  const hasGeneratedStories = data?.works.some((work) => work.sourceType === 'generated_story') ?? false;
  const generatedStoryCount = data?.works.filter((work) => work.sourceType === 'generated_story').length ?? 0;

  if (loading) return <HomeSkeleton />;

  if (error || !data) {
    return (
      <main className="whatif-page error-page">
        <div className="error-state">
          <CircleAlert size={30} />
          <h1>没有加载出来</h1>
          <p>{error || '首页数据暂时不可用'}</p>
          <button type="button" onClick={() => void loadHome()}>
            <RotateCcw size={16} />
            重新加载
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="whatif-page">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="whatif-shell">
        <header className="home-header">
          <span className="header-spacer" />
          <div>
            <small>WHAT IF</small>
            <h1>第二世界</h1>
          </div>
          <button type="button" onClick={() => navigate('/stories')}>
            我的
          </button>
        </header>

        <section className="hero-card" aria-label="主推 Whatif 成片">
          {data.hero.videoUrl ? (
            <video
              autoPlay
              loop
              muted
              playsInline
              poster={resolveAppAssetUrl(data.hero.coverUrl)}
              src={resolveAppAssetUrl(data.hero.videoUrl)}
            />
          ) : (
            <img src={resolveAppAssetUrl(data.hero.coverUrl)} alt={data.hero.title} />
          )}
          <div className="hero-shade" />
          <button
            className="hero-play"
            type="button"
            onClick={() => navigate(`/works/${data.hero.workId || data.hero.id}`)}
            aria-label="播放主推成片"
          >
            <Play size={22} fill="currentColor" />
          </button>
          <div className="hero-badge">
            <i />
            点击播放
          </div>
          <div className="hero-copy">
            <h2>{data.hero.title}</h2>
            <p>{data.hero.subtitle}</p>
          </div>
        </section>

        <StatusCard
          card={data.statusCard}
          onPrimary={handlePrimaryAction}
          onSecondary={() => navigate('/stories')}
          onManage={() => navigate(data.statusCard.type === 'no_character' ? '/characters/new' : '/characters')}
        />

        <section className="popular-section">
          <div className="section-heading" ref={worksTitleRef}>
            <div>
              <small>{hasGeneratedStories ? '按故事自动整理' : '过去 7 天最受欢迎'}</small>
              <h2>{hasGeneratedStories ? '我的已生成故事' : '热门 Whatif'}</h2>
            </div>
          </div>

          <div className="works-grid">
            {data.works.map((work) => (
              <WorkCard
                key={work.id}
                work={work}
                onOpen={() => navigate(work.targetPath || `/works/${work.workId || work.id}`)}
              />
            ))}
          </div>

          <div className="feed-footer">
            {batchLoading ? <LoaderCircle className="spin" size={14} /> : <Clock3 size={14} />}
            {batchLoading
              ? '正在自动加载更多'
              : hasGeneratedStories
              ? data.hasMore
                ? `已展示 ${generatedStoryCount} 个已生成故事，继续加载可查看后续内容`
                : `已展示全部 ${generatedStoryCount} 个已生成故事`
              : data.hasMore
                ? '热门内容按近 7 天点赞量排序'
                : '已展示全部热门内容'}
          </div>
          <div ref={loadMoreRef} aria-hidden="true" />
        </section>

        <footer className="home-footer">
          <span>每个选择，都通向另一个你</span>
          <ChevronRight size={14} />
        </footer>
      </div>

      {creating && (
        <div className="creating-mask" role="status">
          <div>
            <LoaderCircle className="spin" size={22} />
            <strong>正在创建故事草稿</strong>
            <span>即将进入人物与世界观选择</span>
          </div>
        </div>
      )}
    </main>
  );
}
