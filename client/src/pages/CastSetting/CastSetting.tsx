import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  CircleAlert,
  LoaderCircle,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  RotateCcw,
  UserPlus,
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { getCastSetting, updateCastSetting } from '@/api';
import { resolveAppAssetUrl } from '@/lib/app-base-path';

import type {
  CastCharacter,
  CastSettingResponse,
  UpdateCastSettingResponse,
  WorldviewOption,
} from './types';
import './cast-setting.css';

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

function getErrorCode(error: unknown) {
  if (typeof error !== 'object' || error === null) return undefined;
  return (error as { response?: { data?: { error?: { code?: string } } } }).response?.data?.error?.code;
}

function CastSkeleton() {
  return (
    <main className="cast-page">
      <div className="cast-shell cast-skeleton">
        <div className="cast-skeleton-header" />
        <div className="cast-skeleton-line wide" />
        <div className="cast-skeleton-line short" />
        <div className="cast-skeleton-roles">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="cast-skeleton-role" key={index} />
          ))}
        </div>
        <div className="cast-skeleton-actions">
          <i />
          <i />
        </div>
        <div className="cast-skeleton-line medium" />
        <div className="cast-skeleton-worlds">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} />
          ))}
        </div>
      </div>
    </main>
  );
}

function CharacterCard({
  character,
  selected,
  onSelect,
}: {
  character: CastCharacter;
  selected: boolean;
  onSelect: () => void;
}) {
  const primaryBadge = character.badges[0];

  return (
    <button
      className={`cast-character ${selected ? 'selected' : ''} ${!character.selectable ? 'disabled' : ''}`}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${selected ? '取消选择' : '选择'}角色 ${character.name}`}
    >
      <span className="cast-character-image">
        <img src={resolveAppAssetUrl(character.avatarUrl)} alt={character.name} />
        {primaryBadge && (
          <i className={`cast-character-badge badge-${character.sourceType}`}>
            {primaryBadge}
          </i>
        )}
        <i className="cast-character-check">
          {character.selectable ? <Check size={13} strokeWidth={3} /> : <LockKeyhole size={12} />}
        </i>
      </span>
      <strong>{character.name}</strong>
      <small>{character.summary}</small>
    </button>
  );
}

function WorldviewCard({
  worldview,
  selected,
  onSelect,
}: {
  worldview: WorldviewOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`cast-worldview ${selected ? 'selected' : ''}`}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
    >
      <img src={resolveAppAssetUrl(worldview.coverUrl)} alt={worldview.name} />
      <span className="cast-worldview-shade" />
      {worldview.recommended && <i className="cast-recommended">推荐</i>}
      <span className="cast-worldview-copy">
        <strong>{worldview.name}</strong>
        <small>{worldview.atmosphere}</small>
      </span>
      <i className="cast-worldview-check">
        <Check size={13} strokeWidth={3} />
      </i>
    </button>
  );
}

export default function CastSetting() {
  const { draftId = 'draft_demo' } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const returnTo = search.get('returnTo') || '';
  const castPagePath = `/story-drafts/${draftId}/cast${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`;
  const [data, setData] = useState<CastSettingResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [worldviewId, setWorldviewId] = useState<string | null>(null);
  const [storyTitle, setStoryTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const versionRef = useRef(1);
  const snapshotRef = useRef<{ characterIds: string[]; worldviewId: string | null }>({
    characterIds: [],
    worldviewId: null,
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSequenceRef = useRef(0);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getCastSetting(draftId);
      setData(response);
      setSelectedIds(response.selectedCharacterIds);
      setWorldviewId(response.selectedWorldviewId);
      setStoryTitle(response.storyTitle || '');
      versionRef.current = response.draftVersion;
      snapshotRef.current = {
        characterIds: response.selectedCharacterIds,
        worldviewId: response.selectedWorldviewId,
      };
    } catch (loadError) {
      setError(getErrorMessage(loadError) ?? '人物与世界观加载失败');
    } finally {
      setLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    void loadPage();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [loadPage]);

  const saveSelection = useCallback(
    async (
      characterIds: string[],
      nextWorldviewId: string | null,
      confirm = false,
    ): Promise<UpdateCastSettingResponse | null> => {
      const sequence = ++saveSequenceRef.current;
      if (confirm) setConfirming(true);
      else setSaving(true);

      const operation = saveQueueRef.current
        .catch(() => undefined)
        .then(async (): Promise<UpdateCastSettingResponse | null> => {
          try {
            const request = () => updateCastSetting(draftId, {
              characterIds,
              worldviewId: nextWorldviewId,
              draftVersion: versionRef.current,
              storyTitle,
              confirm,
            });

            let response: UpdateCastSettingResponse;
            try {
              response = await request();
            } catch (saveError) {
              if (getErrorCode(saveError) !== 'DRAFT_VERSION_CONFLICT') throw saveError;

              // A stale tab or an earlier request may already have advanced the
              // draft version. Pull the authoritative version and replay this
              // tab's latest complete selection once, without losing the
              // user's current input or exposing a technical conflict toast.
              const latest = await getCastSetting(draftId);
              versionRef.current = latest.draftVersion;
              snapshotRef.current = {
                characterIds: latest.selectedCharacterIds,
                worldviewId: latest.selectedWorldviewId,
              };
              response = await request();
            }

            // Every queued success advances the version used by the next
            // request. Only the latest intent is reflected back into the UI.
            versionRef.current = response.draftVersion;
            snapshotRef.current = {
              characterIds: response.selectedCharacterIds,
              worldviewId: response.selectedWorldviewId,
            };
            if (sequence === saveSequenceRef.current) {
              setSelectedIds(response.selectedCharacterIds);
              setWorldviewId(response.selectedWorldviewId);
            }
            return response;
          } catch (saveError) {
            if (sequence === saveSequenceRef.current) {
              setSelectedIds(snapshotRef.current.characterIds);
              setWorldviewId(snapshotRef.current.worldviewId);
              toast.error(getErrorMessage(saveError) ?? '保存失败，请重试');
            }
            return null;
          } finally {
            if (sequence === saveSequenceRef.current) {
              setSaving(false);
              setConfirming(false);
            }
          }
        });

      saveQueueRef.current = operation;
      return operation;
    },
    [draftId, storyTitle],
  );

  const scheduleSave = (characterIds: string[], nextWorldviewId: string | null) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveSelection(characterIds, nextWorldviewId);
    }, 420);
  };

  const toggleCharacter = (character: CastCharacter) => {
    if (!data) return;
    if (!character.selectable) {
      toast(character.unavailableReason ?? '该角色暂不可选择');
      return;
    }

    const selected = selectedIds.includes(character.characterId);
    if (!selected && selectedIds.length >= data.maxCharacterCount) {
      toast(`最多选择 ${data.maxCharacterCount} 个角色，请先取消一个角色`);
      return;
    }

    const nextIds = selected
      ? selectedIds.filter((characterId) => characterId !== character.characterId)
      : [...selectedIds, character.characterId];
    setSelectedIds(nextIds);
    scheduleSave(nextIds, worldviewId);
  };

  const selectWorldview = (nextWorldviewId: string) => {
    setWorldviewId(nextWorldviewId);
    scheduleSave(selectedIds, nextWorldviewId);
  };

  const handleNext = async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (selectedIds.length === 0) {
      toast('至少选择 1 个角色');
      return;
    }
    if (!worldviewId) {
      toast('请选择 1 个世界观');
      return;
    }
    if (!storyTitle.trim() || storyTitle.trim() === '未命名故事') {
      toast('先给故事起一个名字');
      return;
    }

    const response = await saveSelection(selectedIds, worldviewId, true);
    if (response?.canProceed) {
      toast.success('人物与世界观已确认', {
        description: '下一步将描述这段 15 秒故事',
      });
      navigate(returnTo || `/story-drafts/${draftId}/scene/new`);
    }
  };

  if (loading) return <CastSkeleton />;

  if (error || !data) {
    return (
      <main className="cast-page cast-error-page">
        <div className="cast-error-state">
          <CircleAlert size={30} />
          <h1>没有加载出来</h1>
          <p>{error || '人物与世界观暂时不可用'}</p>
          <button type="button" onClick={() => void loadPage()}>
            <RotateCcw size={16} />
            重新加载
          </button>
        </div>
      </main>
    );
  }

  const canProceed = selectedIds.length > 0 && Boolean(worldviewId);

  return (
    <main className="cast-page">
      <div className="cast-shell">
        <header className="cast-header">
          <button type="button" onClick={() => returnTo ? navigate(returnTo) : navigate(-1)} aria-label="返回">
            <ChevronLeft size={24} />
          </button>
            <strong>选择人物与世界</strong>
          <button
            type="button"
            onClick={() => toast('当前草稿会自动保存')}
            aria-label="更多"
          >
            <MoreHorizontal size={22} />
          </button>
        </header>

        <div className="cast-content">
          <section className="cast-intro">
            <span>第 1 步 · 故事演员</span>
            <h1>这个故事里，<br />你希望谁来出演？</h1>
            <p>可以直接使用内置人物，无需上传；下一步只要描述你想发生的故事。</p>
          </section>

          <section className="cast-story-name">
            <label htmlFor="story-title">故事名称</label>
            <input id="story-title" value={storyTitle} maxLength={40} onChange={(event) => setStoryTitle(event.target.value)} placeholder="给这个平行世界起个名字" />
            <small>之后可以修改，不影响已生成的历史成片</small>
          </section>

          <section className="cast-section">
            <div className="cast-section-heading">
              <div>
                <strong>选择角色</strong>
                <small>内置人物无需上传，最多选择 3 人</small>
              </div>
              <span>已选 {selectedIds.length}/{data.maxCharacterCount}</span>
            </div>

            <div className="cast-character-scroll">
              {data.characterItems.map((character) => (
                <CharacterCard
                  key={character.characterId}
                  character={character}
                  selected={selectedIds.includes(character.characterId)}
                  onSelect={() => toggleCharacter(character)}
                />
              ))}
            </div>

            <div className="cast-add-actions">
              <button
                type="button"
                onClick={() => navigate(`/characters/new?returnTo=${encodeURIComponent(castPagePath)}`)}
              >
                <Plus size={17} />
                创建角色
              </button>
              <button
                className="invite"
                type="button"
                onClick={() => navigate(`/story-drafts/${draftId}/invite`)}
              >
                <UserPlus size={17} />
                邀请好友
              </button>
            </div>
          </section>

          <div className="cast-divider" />

          <section className="cast-section cast-world-section">
            <div className="cast-section-heading">
              <div>
                <strong>世界观设定</strong>
                <small>影响场景、画风和角色服装</small>
              </div>
              <span className="single-choice">单选</span>
            </div>

            <div className="cast-world-grid">
              {data.worldviewItems.map((worldview) => (
                <WorldviewCard
                  key={worldview.worldviewId}
                  worldview={worldview}
                  selected={worldviewId === worldview.worldviewId}
                  onSelect={() => selectWorldview(worldview.worldviewId)}
                />
              ))}
            </div>
            <button className="cast-create-world" type="button" onClick={() => navigate(`/worldviews/new?returnTo=${encodeURIComponent(castPagePath)}`)}>
              <Plus size={15} />
              新建世界观
            </button>
            {worldviewId && <button className="cast-create-world secondary" type="button" onClick={() => navigate(`/worldviews/${worldviewId}?returnTo=${encodeURIComponent(castPagePath)}`)}>编辑所选世界观</button>}
          </section>
        </div>

        <footer className="cast-footer">
          <div className={`cast-save-state ${saving ? 'visible' : ''}`}>
            <LoaderCircle className="spin" size={12} />
            正在自动保存
          </div>
          <button
            type="button"
            className="cast-next"
            disabled={!canProceed || confirming || saving}
            onClick={() => void handleNext()}
          >
            {confirming ? <LoaderCircle className="spin" size={18} /> : null}
            <span>下一步：描述这一幕</span>
          </button>
        </footer>
      </div>
    </main>
  );
}
