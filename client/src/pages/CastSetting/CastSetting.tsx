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
import { useNavigate, useParams } from 'react-router-dom';
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
      response?: { data?: { error?: { message?: string } } };
      message?: string;
    };
    return candidate.response?.data?.error?.message ?? candidate.message;
  }
  return undefined;
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
  const [data, setData] = useState<CastSettingResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [worldviewId, setWorldviewId] = useState<string | null>(null);
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

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getCastSetting(draftId);
      setData(response);
      setSelectedIds(response.selectedCharacterIds);
      setWorldviewId(response.selectedWorldviewId);
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

      try {
        const response = await updateCastSetting(draftId, {
          characterIds,
          worldviewId: nextWorldviewId,
          draftVersion: versionRef.current,
          confirm,
        });
        if (sequence === saveSequenceRef.current) {
          versionRef.current = response.draftVersion;
          snapshotRef.current = {
            characterIds: response.selectedCharacterIds,
            worldviewId: response.selectedWorldviewId,
          };
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
    },
    [draftId],
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

    const response = await saveSelection(selectedIds, worldviewId, true);
    if (response?.canProceed) {
      toast.success('人物与世界观已确认', {
        description: '下一步将描述这段 15 秒故事',
      });
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
          <button type="button" onClick={() => navigate(-1)} aria-label="返回">
            <ChevronLeft size={24} />
          </button>
          <strong>选择人物</strong>
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
            <p>选好人物和世界观，下一步只要描述你想发生的故事。</p>
          </section>

          <section className="cast-section">
            <div className="cast-section-heading">
              <div>
                <strong>选择角色</strong>
                <small>最多 3 人，可随时取消</small>
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
                onClick={() =>
                  toast('正在进入角色创建页', {
                    description: '创建完成后会回到这里并默认选中',
                  })
                }
              >
                <Plus size={17} />
                创建角色
              </button>
              <button
                className="invite"
                type="button"
                onClick={() =>
                  toast('正在进入好友邀请页', {
                    description: '好友确认授权后，角色才可以选择',
                  })
                }
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
            disabled={!canProceed || confirming}
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
