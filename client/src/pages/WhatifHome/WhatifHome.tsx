import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  CircleAlert,
  Clock3,
  Heart,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

import { createStoryDraft, getWhatifHome, getWhatifWorks } from '@/api';

import type {
  HomeStatusCard,
  StatusCardType,
  WhatifHomeResponse,
  WhatifWork,
} from './types';
import './whatif-home.css';

const SCROLL_STORAGE_KEY = 'whatif-home-scroll-y';

const previewCards: Record<StatusCardType, HomeStatusCard> = {
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
      response?: { data?: { error?: { message?: string } } };
      message?: string;
    };
    return candidate.response?.data?.error?.message ?? candidate.message;
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
        <img key={character.id} src={character.avatarUrl} alt={character.name} />
      ))}
    </div>
  );
}

function StatusCard({
  card,
  onPrimary,
  onSecondary,
}: {
  card: HomeStatusCard;
  onPrimary: () => void;
  onSecondary: () => void;
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
            onClick={() => toast('角色管理页将在下一步接入')}
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
  return (
    <article className="work-card" onClick={onOpen}>
      <div className="work-cover">
        <img src={work.coverUrl} alt={work.title} loading="lazy" />
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
            <img src={work.avatarUrl} alt="" />
            {work.authorName}
          </span>
          <span>
            <Heart size={12} />
            {formatLikes(work.likeCount)}
          </span>
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

  const previewState = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get('previewState');
    return value && value in previewCards ? (value as StatusCardType) : null;
  }, []);

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getWhatifHome();
      setData(
        previewState
          ? { ...response, statusCard: { ...previewCards[previewState], characters: response.statusCard.characters } }
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
    const { type } = data.statusCard;
    if (type === 'video_generating') {
      toast('视频仍在生成中', { description: '你可以离开页面，完成后会收到通知' });
      return;
    }
    if (type === 'video_failed') {
      toast('已恢复失败任务上下文', { description: '下一步将进入原剧情编辑页' });
      return;
    }
    if (type === 'pending_invitation') {
      toast('正在打开好友邀请', { description: '确认角色授权后即可加入故事' });
      return;
    }
    if (type === 'collaboration_ready') {
      toast('正在打开新成片');
      return;
    }
    if (type === 'story_resumable') {
      toast('正在进入下一幕编辑页');
      return;
    }
    void handleCreate();
  };

  const handleNextBatch = async () => {
    if (!data || batchLoading) return;
    if (!data.nextCursor) {
      toast('已经看完本轮热门作品');
      return;
    }
    setBatchLoading(true);
    try {
      const response = await getWhatifWorks(data.nextCursor, 6);
      setData((current) =>
        current
          ? {
              ...current,
              works: response.works,
              nextCursor: response.nextCursor,
              hasMore: response.hasMore,
            }
          : current,
      );
      worksTitleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (worksError) {
      toast.error(getErrorMessage(worksError) ?? '换一批失败，请重试');
    } finally {
      setBatchLoading(false);
    }
  };

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
          <button type="button" onClick={() => toast('个人中心将在后续页面接入')}>
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
              poster={data.hero.coverUrl}
              src={data.hero.videoUrl}
            />
          ) : (
            <img src={data.hero.coverUrl} alt={data.hero.title} />
          )}
          <div className="hero-shade" />
          <button
            className="hero-play"
            type="button"
            onClick={() => toast('正在打开完整成片')}
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
          onSecondary={() => toast('正在打开我的故事')}
        />

        <section className="popular-section">
          <div className="section-heading" ref={worksTitleRef}>
            <div>
              <small>过去 7 天最受欢迎</small>
              <h2>热门 Whatif</h2>
            </div>
            <button type="button" onClick={() => void handleNextBatch()} disabled={batchLoading}>
              {batchLoading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
              换一批
            </button>
          </div>

          <div className="works-grid">
            {data.works.map((work) => (
              <WorkCard
                key={work.id}
                work={work}
                onOpen={() =>
                  toast(work.title, {
                    description: '完整作品详情页将在下一阶段接入',
                    action: {
                      label: '创作同款',
                      onClick: () => void handleCreate(work.id),
                    },
                  })
                }
              />
            ))}
          </div>

          <div className="feed-footer">
            <Clock3 size={14} />
            热门内容按近 7 天点赞量排序
          </div>
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
