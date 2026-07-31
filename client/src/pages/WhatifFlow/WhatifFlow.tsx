import {
  ArrowLeft,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clapperboard,
  Film,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  Mic2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Share2,
  Shirt,
  Sparkles,
  UserPlus,
  Users,
  WandSparkles,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { uploadWhatifImage, whatifRequest } from '@/api';
import { resolveAppAssetUrl } from '@/lib/app-base-path';

import './whatif-flow.css';

type Json = Record<string, any>;

function errorMessage(error: unknown) {
  const candidate = error as { code?: string; response?: { data?: { error?: { code?: string; message?: string; details?: string; path?: string } } }; message?: string };
  const payload = candidate?.response?.data?.error;
  if (payload?.message) return [payload.message, payload.code ? `(${payload.code})` : '', payload.details ? `\n${payload.details}` : ''].filter(Boolean).join(' ');
  if (candidate?.code === 'ECONNABORTED' || /timeout/i.test(candidate?.message || '')) return 'AI 分镜生成超时，请重新生成，或直接使用剧情生成视频';
  return candidate?.message || '操作失败，请重试';
}

function mediaUrl(url?: string) {
  if (!url) return '';
  return /^(https?:|data:|blob:)/.test(url) ? url : resolveAppAssetUrl(url);
}

function parseCueRange(value = '') {
  const values = value.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  return { start: values[0] || 0, end: values[1] || values[0] || 15 };
}

function storyboardPlanToText(plan?: Json | null) {
  const shots = Array.isArray(plan?.shots) ? plan.shots : [];
  return shots
    .map((shot: Json, index: number) => {
      const time = String(shot.time || `镜头${index + 1}`).replace(/\s+/g, '');
      const title = String(shot.title || `镜头${index + 1}`).trim();
      const action = String(shot.action || '').trim();
      return [`${time}｜${title}`, action].filter(Boolean).join('\n');
    })
    .join('\n\n');
}

function VideoStoryPlayer({ scenes, startIndex = 0 }: { scenes: Json[]; startIndex?: number }) {
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(0, scenes.length - 1)));
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scene = scenes[index];
  const subtitles = (scene?.directorPlan?.shots || [])
    .filter((shot: Json) => shot.dialogue)
    .map((shot: Json) => ({ ...parseCueRange(shot.time), text: `${shot.speaker ? `${shot.speaker}：` : ''}${String(shot.dialogue).replace(/[“”]/g, '')}` }));
  const activeSubtitle = subtitles.find((cue: Json) => currentTime >= cue.start && currentTime <= cue.end);
  useEffect(() => {
    setCurrentTime(0);
    setPlaying(true);
    void videoRef.current?.play().catch(() => setPlaying(false));
  }, [index]);
  if (!scene) return <div className="empty-card"><Film /><strong>成片暂不可播放</strong></div>;
  return <section className="story-player">
    {scene.videoUrl ? <video ref={videoRef} src={mediaUrl(scene.videoUrl)} poster={mediaUrl(scene.coverUrl)} playsInline autoPlay controls={false} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { if (index < scenes.length - 1) setIndex(index + 1); else setPlaying(false); }} /> : <img className="story-player-poster" src={mediaUrl(scene.coverUrl) || mediaUrl('assets/whatif/cinema.png')} />}
    {activeSubtitle && <div className="story-subtitle">{activeSubtitle.text}</div>}
    {scene.videoUrl && <button className="story-play-toggle" onClick={() => { const video = videoRef.current; if (!video) return; if (video.paused) void video.play(); else video.pause(); }}>{playing ? <Pause /> : <Play fill="currentColor" />}</button>}
    <div className="story-player-copy"><span>第 {index + 1}/{scenes.length} 幕 · {scene.durationSeconds || 15}s</span><strong>{scene.title}</strong><p>{scene.summary}</p></div>
    {scenes.length > 1 && <div className="story-scene-tabs">{scenes.map((item, sceneIndex) => <button className={sceneIndex === index ? 'active' : ''} key={item.sceneId || sceneIndex} onClick={() => setIndex(sceneIndex)}>{sceneIndex + 1}</button>)}</div>}
  </section>;
}

function MobilePage({
  title,
  eyebrow,
  children,
  action,
  onBack,
  className = '',
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  onBack?: () => void;
  className?: string;
}) {
  const navigate = useNavigate();
  return (
    <main className={`flow-page ${className}`}>
      <div className="flow-shell">
        <header className="flow-header">
          <button type="button" onClick={onBack || (() => navigate(-1))} aria-label="返回">
            <ArrowLeft size={22} />
          </button>
          <div>
            {eyebrow && <small>{eyebrow}</small>}
            <strong>{title}</strong>
          </div>
          <div className="flow-header-action">{action || <span />}</div>
        </header>
        <div className="flow-content">{children}</div>
      </div>
    </main>
  );
}

function LoadingState({ label = '正在加载' }: { label?: string }) {
  return <div className="flow-centered"><LoaderCircle className="spin" /><strong>{label}</strong></div>;
}

function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="flow-centered error"><CircleAlert /><strong>没有完成</strong><p>{message}</p>{retry && <button onClick={retry}><RefreshCw size={15} />重新加载</button>}</div>;
}

function FixedAction({ children }: { children: React.ReactNode }) {
  return <div className="flow-fixed-action">{children}</div>;
}

function AssetTile({ asset, selected, confirmed, onClick }: { asset?: Json; selected?: boolean; confirmed?: boolean; onClick?: () => void }) {
  return (
    <button className={`asset-tile ${selected ? 'selected' : ''}`} type="button" onClick={onClick}>
      {asset?.imageUrl ? <img src={mediaUrl(asset.imageUrl)} alt={asset.kind} /> : <span><ImagePlus size={22} /><small>待生成</small></span>}
      {asset?.imageUrl && <i>{asset.kind === 'identity-face' ? '身份脸' : asset.kind === 'body-front' ? '全身正面' : asset.kind === 'body-left' ? '纯左侧' : asset.kind === 'body-right' ? '纯右侧' : '完整背面'}</i>}
      {confirmed && <b><Check size={12} /></b>}
    </button>
  );
}

export function CharacterEditorPage() {
  const { characterId: routeCharacterId } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const returnTo = search.get('returnTo') || '/characters';
  const [characterId, setCharacterId] = useState(routeCharacterId || '');
  const [name, setName] = useState('林夏');
  const [description, setDescription] = useState('25岁，黑色长发，温柔坚定，对未知世界充满好奇。');
  const [isSelf, setIsSelf] = useState(true);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [assets, setAssets] = useState<Json[]>([]);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [activeKind, setActiveKind] = useState('identity-face');
  const [instruction, setInstruction] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!routeCharacterId) return;
    void whatifRequest<Json>(`/api/characters/${routeCharacterId}`).then((data) => {
      setName(data.name || '');
      setDescription(data.description || '');
      setIsSelf(Boolean(data.isSelf));
      setAssets(data.assets || []);
      setConfirmed((data.assets || []).filter((item: Json) => item.confirmed).map((item: Json) => item.id));
    }).catch((error) => toast.error(errorMessage(error)));
  }, [routeCharacterId]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const chosen = Array.from(files).slice(0, Math.max(0, 4 - referenceImages.length));
    try {
      const uploaded = await Promise.all(chosen.map(uploadWhatifImage));
      setReferenceImages((old) => [...old, ...uploaded.map((item) => item.url)].slice(0, 4));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const saveBasic = async () => {
    const result = await whatifRequest<{ characterId: string }>('/api/characters', {
      method: 'POST',
      data: { characterId: characterId || undefined, name, description, isSelf, visibility: 'private' },
    });
    if (!characterId) {
      setCharacterId(result.characterId);
      navigate(`/characters/${result.characterId}?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
    }
    return result.characterId;
  };

  const generate = async () => {
    if (!referenceImages.length) {
      toast('先上传 1–4 张参考照片', { description: '正脸清晰即可；补充侧面或全身会更稳定' });
      return;
    }
    setGenerating(true);
    try {
      const id = await saveBasic();
      const previous = assets.find((item) => item.kind === activeKind)?.imageUrl;
      const result = await whatifRequest<Json>('/api/character-assets/tasks', {
        method: 'POST',
        data: { characterId: id, kind: activeKind, instruction, referenceImages, previousAsset: previous },
      });
      const generatedAsset = { ...result, kind: result.kind || activeKind };
      setAssets((old) => [generatedAsset, ...old.filter((item) => item.kind !== activeKind)]);
      setConfirmed((old) => old.filter((id) => id !== assets.find((item) => item.kind === activeKind)?.assetId));
      setInstruction('');
      toast.success('这张标准人物图已生成，请查看大图后确认');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setGenerating(false);
    }
  };

  const finish = async () => {
    const required = assets.filter((item) => ['identity-face', 'body-front'].includes(item.kind));
    const missingKind = !required.some((item) => item.kind === 'identity-face')
      ? 'identity-face'
      : !required.some((item) => item.kind === 'body-front')
        ? 'body-front'
        : '';
    if (missingKind) {
      setActiveKind(missingKind);
      toast(missingKind === 'identity-face' ? '还需要先生成身份脸' : '还需要生成正面全身形象');
      return;
    }
    const assetIds = ['identity-face', 'body-front', 'body-left', 'body-right', 'body-back']
      .map((kind) => assets.find((item) => item.kind === kind)?.assetId)
      .map(String)
      .filter((id) => id && id !== 'undefined');
    setSaving(true);
    try {
      const id = await saveBasic();
      await whatifRequest(`/api/characters/${id}/confirm-assets`, { method: 'POST', data: { assetIds } });
      toast.success('人物资产已保存');
      navigate(returnTo, { replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const currentAsset = assets.find((item) => item.kind === activeKind);
  const kinds = ['identity-face', 'body-front', 'body-left', 'body-right', 'body-back'];

  return (
    <MobilePage
      title={routeCharacterId ? '角色设定' : '创建角色'}
      eyebrow="人物永久资产"
      className="character-editor-page"
      onBack={() => navigate(returnTo, { replace: true })}
    >
      <section className="flow-card character-basic">
        <label>角色名称<input value={name} maxLength={20} onChange={(event) => setName(event.target.value)} placeholder="给角色起个名字" /></label>
        <label>人物描写<textarea value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} placeholder="性格、经历和稳定外貌特征" /></label>
        <button className={`self-toggle ${isSelf ? 'active' : ''}`} type="button" onClick={() => setIsSelf(!isSelf)}><i>{isSelf && <Check size={12} />}</i><span><strong>设为故事里的我</strong><small>一个账号只能有一个“我”，历史故事不受影响</small></span></button>
      </section>

      <section className="flow-section">
        <div className="flow-section-title"><div><strong>上传参考照片</strong><small>支持多张，AI 自动提炼稳定身份</small></div><span>{referenceImages.length}/4</span></div>
        <div className="reference-strip">
          {referenceImages.map((url, index) => <button key={url} onClick={() => setReferenceImages((old) => old.filter((_, i) => i !== index))}><img src={url} /><i>×</i></button>)}
          {referenceImages.length < 4 && <label className="reference-add"><ImagePlus /><span>添加照片</span><input hidden type="file" accept="image/*" multiple onChange={(event) => void upload(event.target.files)} /></label>}
        </div>
        <p className="helper-copy">一张清晰正脸就能开始；增加纯侧面或全身照会提高视频里的人物稳定性。</p>
      </section>

      <section className="flow-section">
        <div className="flow-section-title"><div><strong>标准人物资产</strong><small>先确认身份脸与全身正面；侧面、背面可继续补充</small></div></div>
        <div className="asset-grid">
          {kinds.map((kind) => {
            const asset = assets.find((item) => item.kind === kind);
            return <AssetTile key={kind} asset={asset ? { ...asset, imageUrl: asset.imageUrl, kind } : { kind }} selected={activeKind === kind} confirmed={Boolean(asset?.confirmed) || confirmed.includes(asset?.assetId)} onClick={() => setActiveKind(kind)} />;
          })}
        </div>
        {generating && <div className="asset-generation-notice"><LoaderCircle className="spin" /><span><strong>正在生成{activeKind === 'identity-face' ? '身份脸' : activeKind === 'body-front' ? '正面全身' : activeKind === 'body-left' ? '左侧全身' : activeKind === 'body-right' ? '右侧全身' : '背面全身'}</strong><small>通常需要 20–60 秒，完成后会自动显示在当前格子</small></span></div>}
        {currentAsset?.imageUrl && <div className="asset-confirm-row"><span>满意就直接确认整套人物资产</span><button onClick={() => window.open(currentAsset.imageUrl, '_blank')}>查看大图</button></div>}
        <div className="point-refine"><input value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="可选：脸不变，外套换成米白色；不填则重新生成" /><button disabled={generating} onClick={() => void generate()}>{generating ? <LoaderCircle className="spin" /> : <WandSparkles />}{generating ? '生成中…' : currentAsset ? '按意见重做' : 'AI 生成'}</button></div>
      </section>

      <FixedAction><button className="primary-wide" disabled={saving || generating} onClick={() => void finish()}>{saving ? <LoaderCircle className="spin" /> : <Check />}确认身份脸与全身形象</button></FixedAction>
    </MobilePage>
  );
}

export function CharacterListPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Json | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    void whatifRequest<Json>('/api/me/characters').then(setData).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);
  return <MobilePage title="我的角色" eyebrow="永久人物资产" action={<button onClick={() => navigate('/characters/new')}><Plus size={20} /></button>}>
    {!data && !error && <LoadingState />}
    {error && <ErrorState message={error} retry={load} />}
    <section className="seedance-character-entry">
      <span><WandSparkles /></span>
      <div><small>SEEDANCE READY</small><strong>一键生成人物资产</strong><p>上传照片，AI 自动生成身份脸和正面全身，完成后直接加入人物列表。</p></div>
      <button type="button" onClick={() => navigate('/characters/seedance/new')}>开始生成<ChevronRight /></button>
    </section>
    {data && <div className="record-list">{data.items.length ? data.items.map((item: Json) => <button className="record-card character-record" key={item.characterId} onClick={() => navigate(`/characters/${item.characterId}`)}><img src={mediaUrl(item.avatarUrl) || mediaUrl('assets/whatif/self.jpg')} /><span><strong>{item.name}</strong><small>{item.summary}</small><span className="character-record-meta">{item.sourceType === 'seedance_asset' && <em>Seedance角色资产</em>}<i>{item.selectable ? '可用于生成' : item.unavailableReason}</i></span></span><ChevronRight /></button>) : <div className="empty-card"><Users /><strong>还没有角色</strong><p>创建“故事里的我”或新的虚构角色</p></div>}</div>}
    <FixedAction><button className="primary-wide" onClick={() => navigate('/characters/new')}><Plus />创建新角色</button></FixedAction>
  </MobilePage>;
}

export function SeedanceCharacterAssetPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('林夏');
  const [description, setDescription] = useState('25岁，黑色长发，鹅蛋脸，身材高挑，气质温柔坚定。');
  const [isSelf, setIsSelf] = useState(true);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [characterId, setCharacterId] = useState('');
  const [identityAsset, setIdentityAsset] = useState<Json | null>(null);
  const [bodyAsset, setBodyAsset] = useState<Json | null>(null);
  const [stage, setStage] = useState<'idle' | 'profile' | 'identity' | 'body' | 'confirm'>('idle');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const upload = async (files: FileList | null) => {
    if (!files?.length || generating) return;
    const chosen = Array.from(files).slice(0, Math.max(0, 4 - referenceImages.length));
    try {
      const uploaded = await Promise.all(chosen.map(uploadWhatifImage));
      setReferenceImages((old) => [...old, ...uploaded.map((item) => item.url)].slice(0, 4));
      setError('');
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    }
  };

  const stageCopy = stage === 'profile' ? '正在创建人物档案'
    : stage === 'identity' ? '正在生成稳定身份脸'
      : stage === 'body' ? '正在生成正面全身形象'
        : stage === 'confirm' ? '正在加入人物列表'
          : '准备生成';
  const progress = stage === 'profile' ? 12 : stage === 'identity' ? 38 : stage === 'body' ? 76 : stage === 'confirm' ? 94 : 0;

  const generate = async () => {
    if (generating) return;
    if (!name.trim()) return toast('先给角色起一个名字');
    if (!referenceImages.length) return toast('请先上传至少一张人物参考照片');
    setGenerating(true);
    setError('');
    try {
      let id = characterId;
      if (!id) {
        setStage('profile');
        const created = await whatifRequest<{ characterId: string }>('/api/characters', {
          method: 'POST',
          data: { name: name.trim(), description: description.trim(), isSelf, visibility: 'private', sourceType: 'seedance_asset' },
        });
        id = created.characterId;
        setCharacterId(id);
      }

      let identity = identityAsset;
      if (!identity) {
        setStage('identity');
        identity = await whatifRequest<Json>('/api/character-assets/tasks', {
          method: 'POST',
          data: {
            characterId: id,
            kind: 'identity-face',
            instruction: '保持人物身份、五官、发型和年龄特征不变，生成自然清晰的正面身份脸。',
            referenceImages,
            previousAsset: '',
          },
        });
        setIdentityAsset(identity);
      }

      let body = bodyAsset;
      if (!body) {
        setStage('body');
        body = await whatifRequest<Json>('/api/character-assets/tasks', {
          method: 'POST',
          data: {
            characterId: id,
            kind: 'body-front',
            instruction: '严格继承已生成的身份脸，生成从头到脚完整入画的正面全身标准人物资产。',
            referenceImages,
            previousAsset: identity.imageUrl,
          },
        });
        setBodyAsset(body);
      }

      setStage('confirm');
      await whatifRequest(`/api/characters/${id}/confirm-assets`, {
        method: 'POST',
        data: { assetIds: [identity.assetId, body.assetId] },
      });
      toast.success('Seedance角色资产已加入人物列表');
      navigate('/characters', { replace: true });
    } catch (generationError) {
      setError(errorMessage(generationError));
      toast.error('人物资产没有生成完成，已保留成功步骤');
    } finally {
      setGenerating(false);
      setStage('idle');
    }
  };

  return <MobilePage title="生成Seedance角色资产" eyebrow="一键人物资产" className="seedance-character-page" onBack={() => navigate('/characters', { replace: true })}>
    <section className="seedance-character-hero"><WandSparkles /><div><strong>上传照片，其余交给 AI</strong><p>系统会自动完成身份提炼、身份脸、正面全身和人物入库。</p></div></section>

    <section className="flow-card character-basic">
      <label>角色名称<input value={name} maxLength={20} disabled={generating || Boolean(characterId)} onChange={(event) => setName(event.target.value)} placeholder="给角色起个名字" /></label>
      <label>人物描写<textarea value={description} maxLength={500} disabled={generating || Boolean(characterId)} onChange={(event) => setDescription(event.target.value)} placeholder="外貌、气质和长期稳定特征" /></label>
      <button className={`self-toggle ${isSelf ? 'active' : ''}`} disabled={generating || Boolean(characterId)} type="button" onClick={() => setIsSelf(!isSelf)}><i>{isSelf && <Check size={12} />}</i><span><strong>设为故事里的我</strong><small>关闭后会作为独立故事角色加入人物库</small></span></button>
    </section>

    <section className="flow-section">
      <div className="flow-section-title"><div><strong>人物参考照片</strong><small>至少1张清晰正脸，最多上传4张</small></div><span>{referenceImages.length}/4</span></div>
      <div className="reference-strip">
        {referenceImages.map((url, index) => <button key={url} disabled={generating || Boolean(characterId)} onClick={() => setReferenceImages((old) => old.filter((_, itemIndex) => itemIndex !== index))}><img src={url} /><i>×</i></button>)}
        {referenceImages.length < 4 && <label className={`reference-add ${generating || characterId ? 'disabled' : ''}`}><ImagePlus /><span>添加照片</span><input hidden disabled={generating || Boolean(characterId)} type="file" accept="image/*" multiple onChange={(event) => void upload(event.target.files)} /></label>}
      </div>
      <p className="helper-copy">优先上传无遮挡正脸；补充全身或侧面照片能提高身材与发型稳定性。</p>
    </section>

    {(generating || identityAsset || bodyAsset || error) && <section className="flow-section seedance-generation-result">
      <div className="flow-section-title"><div><strong>生成结果</strong><small>{generating ? stageCopy : error ? '可从失败步骤继续生成' : '已完成的图片会被保留'}</small></div></div>
      <div className="seedance-asset-preview">
        <AssetTile asset={identityAsset ? { ...identityAsset, kind: 'identity-face' } : { kind: 'identity-face' }} />
        <AssetTile asset={bodyAsset ? { ...bodyAsset, kind: 'body-front' } : { kind: 'body-front' }} />
      </div>
      {generating && <div className="seedance-generation-progress"><span><i style={{ width: `${progress}%` }} /></span><strong>{stageCopy}</strong><small>{progress}% · 请保持页面打开</small></div>}
      {error && <div className="seedance-generation-error"><CircleAlert /><span><strong>这次没有全部完成</strong><small>{error}</small></span></div>}
    </section>}

    <FixedAction><button className="primary-wide" disabled={generating || !name.trim() || !referenceImages.length} onClick={() => void generate()}>{generating ? <LoaderCircle className="spin" /> : <Sparkles />}{generating ? stageCopy : error || identityAsset || bodyAsset ? '继续生成并加入人物列表' : '生成并加入人物列表'}</button></FixedAction>
  </MobilePage>;
}

export function WorldviewEditorPage() {
  const { worldviewId } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const returnTo = search.get('returnTo') || '/';
  const [name, setName] = useState('2056 年的上海');
  const [description, setDescription] = useState('AI 拥有独立身份，旧城区仍保留纸质书店与有轨电车。夜晚常有蓝绿色霓虹和持续细雨。');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [instruction, setInstruction] = useState('');
  const [cover, setCover] = useState('');
  const [savedWorldviewId, setSavedWorldviewId] = useState('');
  const [editable, setEditable] = useState(!worldviewId);
  const [generating, setGenerating] = useState(false);
  useEffect(() => {
    if (!worldviewId) return;
    void whatifRequest<Json>(`/api/worldviews/${worldviewId}`).then((data) => {
      setName(data.name || '');
      setDescription(data.description || '');
      setVisibility(data.visibility === 'public' ? 'public' : 'private');
      setCover(data.coverUrl || '');
      setSavedWorldviewId(data.editable ? data.worldviewId : '');
      setEditable(Boolean(data.editable));
    }).catch((error) => toast.error(errorMessage(error)));
  }, [worldviewId]);
  const generate = async () => {
    setGenerating(true);
    try {
      const result = await whatifRequest<Json>('/api/worldviews', { method: 'POST', data: { worldviewId: savedWorldviewId || undefined, sourceWorldviewId: worldviewId && !editable ? worldviewId : undefined, name, description, visibility, referenceImages, instruction, generateImage: true } });
      setCover(result.coverUrl);
      setSavedWorldviewId(result.worldviewId);
      setEditable(true);
      setInstruction('');
      toast.success('世界观视觉已生成');
    } catch (error) { toast.error(errorMessage(error)); } finally { setGenerating(false); }
  };
  return <MobilePage title="世界观设定" eyebrow="故事视觉资产">
    <section className="flow-card"><label>世界观名称<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>世界观描述<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="时代、地点、社会规则、典型环境和整体气质" /></label></section>
    <section className="flow-section"><div className="flow-section-title"><div><strong>视觉参考</strong><small>可以上传多张，AI 会生成统一的世界风格主图</small></div></div>{cover && <img className="world-preview" src={cover} />}
      <div className="reference-strip">{referenceImages.map((url, index) => <button key={url} onClick={() => setReferenceImages((old) => old.filter((_, itemIndex) => itemIndex !== index))}><img src={url} /><i>×</i></button>)}<label className="reference-add"><ImagePlus /><span>上传参考</span><input hidden type="file" accept="image/*" multiple onChange={async (e) => { const files = Array.from(e.target.files || []).slice(0, Math.max(0, 4 - referenceImages.length)); const uploaded = await Promise.all(files.map(uploadWhatifImage)); setReferenceImages((old) => [...old, ...uploaded.map((item) => item.url)].slice(0, 4)); }} /></label></div>
      <div className="point-refine"><input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="告诉 AI 哪儿不对；不填则随机换一版" /><button disabled={generating} onClick={() => void generate()}>{generating ? <LoaderCircle className="spin" /> : <WandSparkles />}{cover ? '调整/换一版' : 'AI 生成主图'}</button></div>
    </section>
    <section className="flow-card visibility-card"><strong>谁可以使用这个世界观</strong><div><button className={visibility === 'private' ? 'active' : ''} onClick={() => setVisibility('private')}><LockKeyhole />仅自己</button><button className={visibility === 'public' ? 'active' : ''} onClick={() => setVisibility('public')}><Users />公开可用</button></div></section>
    <FixedAction><button className="primary-wide" disabled={!cover || !savedWorldviewId} onClick={() => { toast.success(worldviewId && !editable ? '已复制为你的新世界观' : '世界观已保存'); navigate(returnTo, { replace: true }); }}><Check />确认世界观</button></FixedAction>
  </MobilePage>;
}

export function SceneEditorPage() {
  const { draftId = '' } = useParams();
  const [search] = useSearchParams();
  const parentSceneId = search.get('parentSceneId') || undefined;
  const branchId = search.get('branchId') || undefined;
  const navigate = useNavigate();
  const [context, setContext] = useState<Json | null>(null);
  const [script, setScript] = useState('');
  const [originalScript, setOriginalScript] = useState('');
  const [storyboardGenerated, setStoryboardGenerated] = useState(false);
  const [plan, setPlan] = useState<Json | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [inheritPreviousLastFrame, setInheritPreviousLastFrame] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [editingTarget, setEditingTarget] = useState('');
  const [refinement, setRefinement] = useState('');
  const previewSequence = useRef(0);
  const sceneQuery = new URLSearchParams({
    ...(parentSceneId ? { parentSceneId } : {}),
    ...(branchId ? { branchId } : {}),
  }).toString();
  const sceneReturnPath = `/story-drafts/${draftId}/scene/new${sceneQuery ? `?${sceneQuery}` : ''}`;
  const storageKey = `whatif-scene-editor:${draftId}:${parentSceneId || 'first'}:${branchId || 'main'}`;

  useEffect(() => {
    void whatifRequest<Json>(`/api/story-drafts/${draftId}/scene-editor`, { params: { parentSceneId } }).then((data) => {
      setContext(data);
      setInheritPreviousLastFrame(Boolean(data.previous?.lastFrameAvailable));
      const saved = window.sessionStorage.getItem(storageKey);
      if (saved) {
        try {
          const localDraft = JSON.parse(saved) as Json;
          setScript(String(localDraft.script || ''));
          setOriginalScript(String(localDraft.originalScript || ''));
          setStoryboardGenerated(Boolean(localDraft.storyboardGenerated));
          setPlan(localDraft.plan || null);
          setInheritPreviousLastFrame(localDraft.inheritPreviousLastFrame !== false && Boolean(data.previous?.lastFrameAvailable));
          return;
        } catch {
          window.sessionStorage.removeItem(storageKey);
        }
      }
      const sceneDraftMatches = String(data.sceneDraft?.parentSceneId || '') === String(parentSceneId || '');
      const savedPlan = sceneDraftMatches ? data.sceneDraft?.directorPlan || null : null;
      const savedScript = sceneDraftMatches ? String(data.sceneDraft?.script || '') : '';
      if (savedPlan) {
        setOriginalScript(savedScript);
        setScript(storyboardPlanToText(savedPlan) || savedScript);
        setStoryboardGenerated(true);
        setPlan(savedPlan);
      } else {
        setScript(savedScript);
      }
    }).catch((e) => setError(errorMessage(e)));
  }, [draftId, parentSceneId, storageKey]);

  useEffect(() => {
    if (!context) return;
    window.sessionStorage.setItem(storageKey, JSON.stringify({ script, originalScript, storyboardGenerated, plan, inheritPreviousLastFrame }));
  }, [context, inheritPreviousLastFrame, originalScript, plan, script, storageKey, storyboardGenerated]);

  const runPreview = useCallback(async (nextScript: string, refinements?: Json) => {
    if (nextScript.trim().length < 6) {
      toast('至少描述 6 个字，再生成专业分镜');
      return;
    }
    const sequence = ++previewSequence.current;
    setPreviewing(true);
    setPreviewError('');
    try {
      const result = await whatifRequest<Json>(`/api/story-drafts/${draftId}/director-preview`, {
        method: 'POST',
        data: { script: nextScript, parentSceneId, refinements },
        timeoutMs: 35_000,
      });
      if (sequence === previewSequence.current) {
        const nextPlan = result.directorPlan;
        setPlan(nextPlan);
        setScript(storyboardPlanToText(nextPlan) || nextScript);
        setStoryboardGenerated(true);
        setPreviewError('');
      }
    } catch (error) {
      if (sequence === previewSequence.current) {
        const message = errorMessage(error);
        setPreviewError(message);
        toast.error(message);
      }
    } finally {
      if (sequence === previewSequence.current) setPreviewing(false);
    }
  }, [draftId, parentSceneId]);

  const generateStoryboard = () => {
    const sourceScript = storyboardGenerated ? originalScript : script;
    if (!storyboardGenerated) setOriginalScript(script);
    void runPreview(sourceScript || script);
  };

  const restoreOriginalScript = () => {
    previewSequence.current += 1;
    setPreviewing(false);
    setPreviewError('');
    setPlan(null);
    setScript(originalScript);
    setOriginalScript('');
    setStoryboardGenerated(false);
  };

  const generate = async () => {
    if (script.trim().length < 6) {
      toast('请先描述这一幕发生什么');
      return;
    }
    // Generating the professional preview is optional. Invalidate any pending
    // preview response and let the server compile the raw user script when no
    // approved director plan exists.
    previewSequence.current += 1;
    setPreviewing(false);
    setSubmitting(true);
    try {
      const result = await whatifRequest<Json>(`/api/story-drafts/${draftId}/scenes/generate`, { method: 'POST', data: { script, ...(plan ? { directorPlan: plan } : {}), parentSceneId, branchId, inheritPreviousLastFrame } });
      window.sessionStorage.removeItem(storageKey);
      navigate(`/video-tasks/${result.taskId}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally { setSubmitting(false); }
  };

  if (error) return <MobilePage title="描述这一幕"><ErrorState message={error} /></MobilePage>;
  if (!context) return <MobilePage title="描述这一幕"><LoadingState /></MobilePage>;
  const capacity = plan?.capacity;
  const castReturnTo = encodeURIComponent(sceneReturnPath);
  const scriptLimit = storyboardGenerated ? 800 : 240;
  const advancedItems = [
    { label: '人物服装', target: '人物本幕造型', icon: Shirt, value: Object.entries(plan?.visual?.looks || {}).map(([name, look]) => `${name}：${look}`).join('；') },
    { label: '背景', target: '场景', icon: ImagePlus, value: plan?.visual?.scene },
    { label: '关键道具', target: '关键道具', icon: Box, value: plan?.visual?.props },
    { label: '声音', target: '声音', icon: Mic2, value: [plan?.audio?.ambience, plan?.audio?.music].filter(Boolean).join('；') },
  ];
  return <MobilePage title={parentSceneId ? '续写下一幕' : '描述第一幕'} eyebrow={`${context.story.title} · 15秒一幕`} action={<button onClick={() => toast('当前内容已自动保留')}><MoreHorizontal /></button>}>
    {context.previous && <section className="previous-summary"><small>前情概要</small><strong>{context.previous.title}</strong><p>{context.previous.summary}</p></section>}
    {context.previous?.lastFrameAvailable && <button className={`continuity-frame-option ${inheritPreviousLastFrame ? 'active' : ''}`} type="button" onClick={() => setInheritPreviousLastFrame(!inheritPreviousLastFrame)}>
      <i>{inheritPreviousLastFrame && <Check />}</i>
      <span><strong>继承上一幕最后一帧</strong><small>从上一幕结束画面继续</small></span>
      {context.previous.lastFrameUrl && <img src={mediaUrl(context.previous.lastFrameUrl)} />}
    </button>}
    <section className="scene-cast-card">
      <div className="scene-cast-heading"><span><strong>本幕人物</strong><small>决定这一幕谁会出镜</small></span><button type="button" onClick={() => navigate(`/story-drafts/${draftId}/cast?returnTo=${castReturnTo}`)}>调整</button></div>
      <div className="scene-cast-list">
        {(context.characters || []).map((character: Json) => <div className="scene-cast-person" key={character.characterId || character.id}><img src={mediaUrl(character.avatarUrl) || mediaUrl('assets/whatif/self.jpg')} /><span><strong>{character.name}</strong><small><LockKeyhole />已锁定形象</small></span></div>)}
        <button className="scene-cast-add" type="button" onClick={() => navigate(`/story-drafts/${draftId}/cast?returnTo=${castReturnTo}`)}><Plus /><span>添加人物</span></button>
      </div>
    </section>
    <section className={`script-card ${storyboardGenerated ? 'storyboard-mode' : ''}`}>
      <div className="script-heading"><span>{storyboardGenerated ? '15秒分镜（可直接修改）' : '你想让这一幕发生什么？'}</span><small>{storyboardGenerated && 'AI 已生成 · '}{script.length}/{scriptLimit}</small></div>
      <textarea value={script} maxLength={scriptLimit} onChange={(e) => { previewSequence.current += 1; setPreviewing(false); setPreviewError(''); if (storyboardGenerated) setPlan(null); setScript(e.target.value); }} placeholder="像给导演说戏一样描述：谁，在什么地方，做了什么，最后发生什么" />
      <div className="script-actions">
        <span>{previewing ? <><LoaderCircle className="spin" />AI 正在补全专业分镜…</> : previewError ? <><CircleAlert />{previewError}</> : storyboardGenerated ? <><Sparkles />AI 已补全分镜，可直接修改</> : <><Mic2 />直接描述故事，也可以让 AI 补全分镜</>}</span>
        <div>{storyboardGenerated && <button type="button" disabled={previewing} onClick={restoreOriginalScript}>撤回原描述</button>}<button className="ai-storyboard-action" type="button" disabled={previewing || script.trim().length < 6} onClick={generateStoryboard}>{previewing ? <LoaderCircle className="spin" /> : storyboardGenerated || previewError ? <RefreshCw /> : <Sparkles />}{previewing ? '生成中' : storyboardGenerated || previewError ? '重新生成' : '生成 AI 分镜'}</button></div>
      </div>
    </section>
    {capacity?.status === 'overflow' && <div className="capacity-warning"><CircleAlert /><div><strong>这段内容可能放不进 15 秒</strong><p>{capacity.message}</p><button onClick={() => { setScript(capacity.suggestedScript); setOriginalScript(''); setStoryboardGenerated(false); setPlan(null); }}>使用 AI 精简版</button></div></div>}
    <section className={`scene-advanced ${advancedOpen ? 'open' : ''}`}>
      <button className="scene-advanced-toggle" type="button" onClick={() => setAdvancedOpen(!advancedOpen)}><span><strong>高级设置（可选）</strong><small>调整服装、背景、道具与声音</small></span><ChevronDown /></button>
      {advancedOpen && <div className="scene-advanced-content">{advancedItems.map(({ label, target, icon: Icon, value }) => <button type="button" key={target} onClick={() => setEditingTarget(target)}><Icon /><span><strong>{label}</strong><small>{value || 'AI 将根据人物、世界观和当前剧情自动完成'}</small></span><ChevronRight /></button>)}</div>}
    </section>
    {editingTarget && <div className="refine-drawer"><div><strong>只修改：{editingTarget}</strong><button onClick={() => setEditingTarget('')}>×</button></div><textarea value={refinement} onChange={(e) => setRefinement(e.target.value)} placeholder={`告诉 AI ${editingTarget}具体要怎么调整；未点名的内容保持不变`} /><button disabled={previewing || !refinement.trim()} onClick={() => { if (!storyboardGenerated) setOriginalScript(script); void runPreview(plan ? originalScript || script : script, { target: editingTarget, instruction: refinement, approvedPlan: plan }); setEditingTarget(''); setRefinement(''); }}><WandSparkles />只调整这一项</button></div>}
    <FixedAction><div className="price-hint"><span>{storyboardGenerated ? '将按当前分镜生成约 15 秒成片' : '将按当前剧情描述生成约 15 秒成片'}</span><strong>15 Soul币</strong></div><button className="primary-wide" disabled={script.trim().length < 6 || submitting || capacity?.status === 'overflow'} onClick={() => void generate()}>{submitting ? <LoaderCircle className="spin" /> : <Film />}{submitting ? '正在提交…' : '生成视频'}</button></FixedAction>
  </MobilePage>;
}

export function GenerationPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState<Json | null>(null);
  const [error, setError] = useState('');
  const poll = useCallback(async () => {
    try {
      const result = await whatifRequest<Json>(`/api/video-tasks/${taskId}`);
      setTask(result);
      setError('');
      if (result.status === 'success') navigate(`/video-results/${taskId}`, { replace: true });
    } catch (e) { setError(errorMessage(e)); }
  }, [navigate, taskId]);
  useEffect(() => { void poll(); const timer = window.setInterval(() => void poll(), 5000); return () => window.clearInterval(timer); }, [poll]);
  const progress = task?.progress || 8;
  return <MobilePage title="正在生成" eyebrow={task?.storyTitle || '15秒连续故事'} className="generation-page" action={<button onClick={() => navigate('/stories')}>稍后查看</button>}>
    {error && !task && <ErrorState message={error} retry={() => void poll()} />}
    <section className="generation-stage"><div className="generation-orbit"><i /><b>{progress}%</b></div><h1>{task?.stageLabel || 'AI 正在完成专业制作'}<span className="dynamic-dots">...</span></h1><p>可以离开页面，任务会继续在服务端生成。完成后可从首页或“我的故事”回来查看。</p></section>
    <section className="generation-steps">{['专业分镜', '锁定人物与世界', 'Seedance 生成画面与声音', '质量检查与归档'].map((label, index) => { const threshold = [12, 20, 25, 92][index]; const done = progress >= threshold; return <div className={done ? 'done' : progress + 15 >= threshold ? 'active' : ''} key={label}><i>{done ? <Check /> : index + 1}</i><span><strong>{label}</strong><small>{done ? '已完成' : progress + 15 >= threshold ? '进行中' : '等待中'}</small></span></div>; })}</section>
    {task?.status === 'failed' && <section className="failed-panel"><CircleAlert /><strong>这次没有生成成功，不会扣费</strong><p>{task.errorMessage || '模型返回失败'}</p><code>{task.errorCode}</code><button onClick={() => navigate(`/story-drafts/${task.draftId}/scene/new?parentSceneId=${task.sceneId}`)}>重新编辑剧情</button></section>}
    <FixedAction><button className="secondary-wide" onClick={() => navigate('/stories')}>返回我的故事，后台继续生成</button></FixedAction>
  </MobilePage>;
}

export function ResultPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Json | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { void whatifRequest<Json>(`/api/video-results/${taskId}`).then(setData).catch((e) => setError(errorMessage(e))); }, [taskId]);
  if (error) return <MobilePage title="成片结果"><ErrorState message={error} /></MobilePage>;
  if (!data) return <MobilePage title="成片结果"><LoadingState /></MobilePage>;
  if (data.status !== 'success') return <GenerationPage />;
  return <MobilePage title="成片完成" eyebrow={`${data.storyTitle} · ${data.sceneTitle}`} className="result-page" action={<button onClick={() => navigate(`/video-results/${taskId}/publish`)}><Share2 /></button>}>
    <VideoStoryPlayer scenes={[{ sceneId: data.sceneId, title: data.sceneTitle, summary: data.directorPlan?.summary || data.userScript, durationSeconds: 15, videoUrl: data.videoUrl, directorPlan: data.directorPlan }]} />
    <section className="result-copy"><span>这一幕</span><h1>{data.directorPlan?.summary || data.userScript}</h1><p>人物、世界观与上一幕状态已保存，续写时会自动继承。</p></section>
    <div className="result-actions"><button onClick={() => navigate(`/story-drafts/${data.draftId}/scene/new?parentSceneId=${data.sceneId}`)}><Plus /><span><strong>续写下一幕</strong><small>自动带入前情和连续性</small></span><ChevronRight /></button><button onClick={() => navigate(`/stories/${data.storyId}/timeline`)}><Clapperboard /><span><strong>查看完整故事</strong><small>管理所有幕与故事分支</small></span><ChevronRight /></button><button onClick={() => navigate(`/story-drafts/${data.draftId}/scene/new?parentSceneId=${data.sceneId}`)}><RefreshCw /><span><strong>修改后重新生成</strong><small>新生成按 15 Soul币计费</small></span><ChevronRight /></button></div>
    <FixedAction><button className="primary-wide" onClick={() => navigate(`/story-drafts/${data.draftId}/scene/new?parentSceneId=${data.sceneId}`)}><Plus />续写下一幕</button></FixedAction>
  </MobilePage>;
}

export function StoriesPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Json | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); void whatifRequest<Json>('/api/stories').then(setData).catch((e) => setError(errorMessage(e))); }, []);
  useEffect(load, [load]);
  return <MobilePage title="我的故事" eyebrow="长期连续剧情资产" action={<button onClick={() => navigate('/characters')}><Users /></button>}>
    {!data && !error && <LoadingState />}{error && <ErrorState message={error} retry={load} />}
    {data && <div className="story-list">{data.items.length ? data.items.map((item: Json) => <button key={item.storyId} className="story-record" onClick={() => navigate(`/stories/${item.storyId}/timeline`)}><div className="story-record-cover"><img src={mediaUrl(item.coverUrl) || mediaUrl('assets/whatif/cinema.png')} /><span>{item.completedSceneCount}/{item.sceneCount} 幕</span></div><div><strong>{item.title}</strong><p>{item.setting || '世界设定将在第一幕中被看见'}</p><small>{item.latestScene?.status === 'generating' ? '最新一幕生成中' : item.completedSceneCount ? '可以继续续写' : '等待第一幕'}</small></div><ChevronRight /></button>) : <div className="empty-card"><Film /><strong>还没有故事</strong><p>从一个 15 秒完整事件开始</p></div>}</div>}
    <FixedAction><button className="primary-wide" onClick={async () => { const result = await whatifRequest<Json>('/api/story-drafts', { method: 'POST', data: { mode: 'create', idempotencyKey: crypto.randomUUID() } }); navigate(`/story-drafts/${result.draftId}/cast`); }}><Plus />创建新故事</button></FixedAction>
  </MobilePage>;
}

export function TimelinePage() {
  const { storyId = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Json | null>(null);
  const [error, setError] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const load = useCallback(() => { void whatifRequest<Json>(`/api/stories/${storyId}/timeline`).then(setData).catch((e) => setError(errorMessage(e))); }, [storyId]);
  useEffect(load, [load]);
  useEffect(() => {
    if (data && !selectedBranchId) setSelectedBranchId(data.story.activeBranchId || data.branches[0]?.id || '');
  }, [data, selectedBranchId]);
  if (error) return <MobilePage title="故事时间线"><ErrorState message={error} retry={load} /></MobilePage>;
  if (!data) return <MobilePage title="故事时间线"><LoadingState /></MobilePage>;
  const mainBranchId = data.branches[0]?.id;
  const selectedBranch = data.branches.find((branch: Json) => branch.id === selectedBranchId) || data.branches[0];
  const ownScenes = data.scenes.filter((scene: Json) => scene.branchId === selectedBranch?.id);
  const parentScene = selectedBranch?.parentSceneId ? data.scenes.find((scene: Json) => scene.id === selectedBranch.parentSceneId) : null;
  const inheritedScenes = parentScene ? data.scenes.filter((scene: Json) => scene.branchId === mainBranchId && scene.sequence <= parentScene.sequence) : [];
  const mainScenes = [...inheritedScenes, ...ownScenes.filter((scene: Json) => !inheritedScenes.some((item: Json) => item.id === scene.id))];
  const last = mainScenes.at(-1);
  return <MobilePage title={data.story.title} eyebrow="连续故事时间线" action={<button onClick={() => navigate(`/stories/${storyId}/advanced`)}><MoreHorizontal /></button>}>
    <section className="timeline-hero"><img src={mediaUrl(data.story.coverUrl) || mediaUrl('assets/whatif/cinema.png')} /><div><span>{mainScenes.length} 幕 · 每幕 15s</span><p>{data.story.setting}</p></div></section>
    {data.branches.length > 1 && <div className="branch-tabs">{data.branches.map((branch: Json, index: number) => <button className={branch.id === selectedBranch?.id ? 'active' : ''} key={branch.id} onClick={() => setSelectedBranchId(branch.id)}>{index === 0 ? '主线' : branch.label}</button>)}</div>}
    <div className="timeline-list">{mainScenes.map((scene: Json, index: number) => <article key={scene.id} className={`timeline-event ${scene.status}`}><i>{index + 1}</i><button onClick={() => scene.videoTaskId && navigate(scene.status === 'success' ? `/video-results/${scene.videoTaskId}` : `/video-tasks/${scene.videoTaskId}`)}><div className="timeline-thumb">{scene.videoUrl ? <video src={scene.videoUrl} muted /> : <img src={mediaUrl('assets/whatif/retro.jpg')} />}<span>{scene.status === 'success' ? '15s' : scene.status === 'failed' ? '失败' : '生成中'}</span></div><div><small>第 {scene.sequence} 幕</small><strong>{scene.title}</strong><p>{(scene.directorPlan as Json)?.summary || scene.userScript}</p></div><ChevronRight /></button><button className="branch-action" onClick={async () => { const result = await whatifRequest<Json>(`/api/stories/${storyId}/branches`, { method: 'POST', data: { parentSceneId: scene.id, label: `从第${scene.sequence}幕开始的新走向` } }); toast.success('已创建故事分支'); navigate(`/story-drafts/${data.story.sourceDraftId}/scene/new?parentSceneId=${scene.id}&branchId=${result.branchId}`); }}>从这里写另一种可能</button></article>)}</div>
    <button className="compose-story" disabled={mainScenes.filter((scene: Json) => scene.status === 'success').length < 2} onClick={() => navigate(`/stories/${storyId}/publish`)}><Film /><span><strong>合成完整故事视频</strong><small>{mainScenes.filter((scene: Json) => scene.status === 'success').length * 15}s · 可选择多幕发布</small></span><ChevronRight /></button>
    <FixedAction><button className="primary-wide" onClick={() => navigate(`/story-drafts/${data.story.sourceDraftId}/scene/new?${new URLSearchParams({ ...(last ? { parentSceneId: last.id } : {}), ...(selectedBranch?.id ? { branchId: selectedBranch.id } : {}) }).toString()}`)}><Plus />添加新的一幕</button></FixedAction>
  </MobilePage>;
}

export function AdvancedPage() {
  const navigate = useNavigate();
  return <MobilePage title="高级设置" eyebrow="默认由 AI 完成，按需微调">
    <div className="advanced-intro"><Sparkles /><div><strong>不设置也能直接生成</strong><p>AI 已根据人物、世界观和剧情自动完成专业制作。这里只用于点对点修改。</p></div></div>
    <div className="advanced-list">{[
      ['人物本幕造型', '服装、发型、妆容与动作状态', Users],
      ['场景与氛围', '环境、天气、灯光、空间关系', ImagePlus],
      ['关键道具', '外观、材质和动作使用方式', WandSparkles],
      ['声音与对白', '角色声线、环境音、音乐与混音', Mic2],
      ['镜头与节奏', '景别、机位、运镜和剪辑点', Clapperboard],
    ].map(([title, desc, Icon]) => <button key={String(title)} onClick={() => toast('在“描述这一幕”页点击对应项即可局部修改')}><Icon /><span><strong>{String(title)}</strong><small>{String(desc)}</small></span><ChevronRight /></button>)}</div>
    <section className="continuity-lock"><LockKeyhole /><div><strong>连续性默认锁定</strong><p>人物身份、已确认画风、上一幕状态和未点名资产不会被意外修改。</p></div></section>
    <FixedAction><button className="primary-wide" onClick={() => navigate(-1)}><Check />保持 AI 默认设置</button></FixedAction>
  </MobilePage>;
}

export function PublishPage() {
  const { storyId, taskId } = useParams();
  const navigate = useNavigate();
  const [resolvedStoryId, setResolvedStoryId] = useState(storyId || '');
  const [timeline, setTimeline] = useState<Json | null>(null);
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [canRemix, setCanRemix] = useState(true);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);
  useEffect(() => {
    const resolve = async () => {
      try {
        let targetStoryId = storyId || '';
        let singleSceneId = '';
        if (!targetStoryId && taskId) {
          const result = await whatifRequest<Json>(`/api/video-results/${taskId}`);
          targetStoryId = result.storyId;
          singleSceneId = result.sceneId;
          setResolvedStoryId(targetStoryId);
        }
        if (!targetStoryId) return;
        const result = await whatifRequest<Json>(`/api/stories/${targetStoryId}/timeline`);
        setTimeline(result);
        const successful = result.scenes.filter((scene: Json) => scene.status === 'success').map((scene: Json) => scene.id);
        setSelectedSceneIds(singleSceneId ? [singleSceneId] : successful);
        setTitle(result.story.title || '');
        setSummary(result.story.setting || '');
      } catch (loadError) { setError(errorMessage(loadError)); }
    };
    void resolve();
  }, [storyId, taskId]);
  const publish = async () => {
    if (!resolvedStoryId) { toast('请从故事时间线进入发布'); return; }
    if (!selectedSceneIds.length) { toast('至少选择一幕已完成视频'); return; }
    setPublishing(true);
    try {
      const result = await whatifRequest<Json>(`/api/stories/${resolvedStoryId}/publications`, { method: 'POST', data: { sceneIds: selectedSceneIds, title: title || undefined, summary: summary || undefined, publish: true, visibility, canRemix } });
      toast.success('已发布到 Whatif 内容流');
      navigate(`/works/${result.publicationId}`, { replace: true });
    } catch (error) { toast.error(errorMessage(error)); } finally { setPublishing(false); }
  };
  if (error) return <MobilePage title="发布故事"><ErrorState message={error} /></MobilePage>;
  if (!timeline) return <MobilePage title="发布故事"><LoadingState /></MobilePage>;
  const successfulScenes = timeline.scenes.filter((scene: Json) => scene.status === 'success');
  return <MobilePage title="发布故事" eyebrow={`${selectedSceneIds.length} 幕 · ${selectedSceneIds.length * 15}s 连续故事`}>
    <section className="publish-cover"><img src={mediaUrl(timeline.story.coverUrl) || mediaUrl('assets/whatif/cinema.png')} /><span>按选择顺序连续播放</span></section>
    <section className="flow-section"><div className="flow-section-title"><div><strong>选择要发布的幕</strong><small>会作为一条故事连续播放</small></div></div><div className="publish-scene-list">{successfulScenes.map((scene: Json) => <button className={selectedSceneIds.includes(scene.id) ? 'selected' : ''} key={scene.id} onClick={() => setSelectedSceneIds((old) => old.includes(scene.id) ? old.filter((id) => id !== scene.id) : [...old, scene.id])}><i>{selectedSceneIds.includes(scene.id) && <Check />}</i><span><strong>第 {scene.sequence} 幕 · {scene.title}</strong><small>{(scene.directorPlan as Json)?.summary || scene.userScript}</small></span></button>)}</div></section>
    <section className="flow-card"><label>故事标题<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="AI 会根据剧情自动生成" /></label><label>故事简介<textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="一句话告诉大家，这个平行世界发生了什么" /></label></section>
    <section className="publish-options"><button onClick={() => setCanRemix(!canRemix)}><span><strong>允许创作同款</strong><small>只复用公开故事线索，不复用私密人物资产</small></span><i className={`toggle ${canRemix ? 'on' : ''}`} /></button><button onClick={() => setVisibility(visibility === 'public' ? 'private' : 'public')}><span><strong>发布到 Whatif 广场</strong><small>{visibility === 'public' ? '公开可见，提交后进入内容审核' : '仅自己可见'}</small></span><i className={`toggle ${visibility === 'public' ? 'on' : ''}`} /></button></section>
    <FixedAction><button className="primary-wide" disabled={publishing || !selectedSceneIds.length} onClick={() => void publish()}>{publishing ? <LoaderCircle className="spin" /> : <Send />}{publishing ? '正在发布…' : `发布 ${selectedSceneIds.length * 15}s 故事`}</button></FixedAction>
  </MobilePage>;
}

export function WorkDetailPage() {
  const { workId = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Json | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => { void whatifRequest<Json>(`/api/works/${workId}`).then(setData).catch((loadError) => setError(errorMessage(loadError))); }, [workId]);
  if (error) return <MobilePage title="故事成片"><ErrorState message={error} /></MobilePage>;
  if (!data) return <MobilePage title="故事成片"><LoadingState /></MobilePage>;
  return <MobilePage title={data.title} eyebrow={`${data.scenes.length} 幕 · ${data.durationSeconds}s`} action={<button onClick={async () => { if (navigator.share) { await navigator.share({ title: data.title, text: data.summary, url: window.location.href }).catch(() => undefined); } else { await navigator.clipboard.writeText(window.location.href); toast.success('链接已复制'); } }}><Share2 /></button>}>
    <VideoStoryPlayer scenes={data.scenes} />
    <section className="result-copy"><span>完整故事</span><h1>{data.title}</h1><p>{data.summary || data.subtitle}</p></section>
    <section className="work-author"><img src={mediaUrl(data.avatarUrl) || mediaUrl('assets/whatif/self.jpg')} /><span><strong>{data.authorName}</strong><small>{data.likeCount || 0} 人喜欢这个故事</small></span></section>
    <FixedAction><button className="primary-wide" disabled={!data.canRemix || creating} onClick={async () => { setCreating(true); try { const draft = await whatifRequest<Json>('/api/story-drafts', { method: 'POST', data: { mode: 'remix', sourceWorkId: workId, idempotencyKey: crypto.randomUUID() } }); navigate(`/story-drafts/${draft.draftId}/cast`); } catch (createError) { toast.error(errorMessage(createError)); } finally { setCreating(false); } }}>{creating ? <LoaderCircle className="spin" /> : <Sparkles />}{data.canRemix ? '创作我的版本' : '作者未开放同款'}</button></FixedAction>
  </MobilePage>;
}

export function InviteFriendsPage() {
  const { draftId = '' } = useParams();
  const navigate = useNavigate();
  const [friends, setFriends] = useState<Json[]>([]);
  const [selected, setSelected] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => { void whatifRequest<Json>(`/api/story-drafts/${draftId}/invite-candidates`).then((data) => setFriends(data.friends)); }, [draftId]);
  return <MobilePage title="邀请好友" eyebrow="一起出演这个故事">
    <section className="invite-banner"><UserPlus /><div><strong>好友只需要创建自己的角色</strong><p>形象确认后仅用于这次故事，不自动发布、不无限复用。</p></div></section>
    <div className="friend-list">{friends.map((friend) => <button className={selected === friend.userId ? 'selected' : ''} key={friend.userId} onClick={() => setSelected(friend.userId)}><img src={mediaUrl(friend.avatarUrl)} /><span><strong>{friend.name}</strong><small>可以接收角色邀请</small></span><i>{selected === friend.userId && <Check />}</i></button>)}</div>
    <FixedAction><button className="primary-wide" disabled={!selected || sending} onClick={async () => { setSending(true); try { await whatifRequest('/api/story-invitations', { method: 'POST', data: { draftId, friendUserId: selected, idempotencyKey: crypto.randomUUID() } }); toast.success('邀请卡已发送'); navigate(`/story-drafts/${draftId}/cast`); } catch (e) { toast.error(errorMessage(e)); } finally { setSending(false); } }}><Send />发送邀请卡</button></FixedAction>
  </MobilePage>;
}

export function InvitationLandingPage() {
  const { invitationId = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Json | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { void whatifRequest<Json>(`/api/story-invitations/${invitationId}`).then(setData).catch((e) => setError(errorMessage(e))); }, [invitationId]);
  if (error) return <MobilePage title="好友邀请"><ErrorState message={error} /></MobilePage>;
  if (!data) return <MobilePage title="好友邀请"><LoadingState /></MobilePage>;
  return <MobilePage title="好友邀请" eyebrow="Whatif 共同故事">
    <section className="invitation-cover"><img src={mediaUrl('assets/whatif/cinema.png')} /><div><img src={mediaUrl(data.inviter.avatarUrl)} /><span><strong>{data.inviter.name} 邀请你出演</strong><small>{data.story.title}</small></span></div></section>
    <section className="authorization-summary"><strong>你需要做什么</strong><p>创建并确认自己的角色形象，授权它参与这一次故事。</p>{data.authorizationSummary.map((item: string) => <div key={item}><Check />{item}</div>)}</section>
    {!data.canAccept && <div className="capacity-warning"><CircleAlert /><div><strong>邀请已失效</strong><p>这张邀请卡不能继续使用</p></div></div>}
    <FixedAction>{data.canAccept ? <><button className="primary-wide" onClick={async () => { await whatifRequest(`/api/story-invitations/${invitationId}/accept`, { method: 'POST' }); navigate(`/invitations/${invitationId}/character`); }}><UserPlus />创建我的角色</button><button className="text-danger" onClick={async () => { await whatifRequest(`/api/story-invitations/${invitationId}/reject`, { method: 'POST' }); navigate('/'); }}>拒绝邀请</button></> : <button className="secondary-wide" onClick={() => navigate('/')}>返回首页</button>}</FixedAction>
  </MobilePage>;
}

export function FriendCharacterPage() {
  const { invitationId = '' } = useParams();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Json[]>([]);
  const [characterId, setCharacterId] = useState('');
  const [authorizationChecked, setAuthorizationChecked] = useState(false);
  useEffect(() => { void whatifRequest<Json>('/api/me/characters').then((data) => { const usable = data.items.filter((item: Json) => item.selectable); setCharacters(usable); setCharacterId(usable[0]?.characterId || ''); }); }, []);
  return <MobilePage title="确认角色" eyebrow="好友故事授权">
    <section className="flow-section"><div className="flow-section-title"><div><strong>选择我的角色</strong><small>只展示已确认身份脸与全身形象的角色</small></div></div><div className="authorization-characters">{characters.map((item) => <button className={characterId === item.characterId ? 'selected' : ''} key={item.characterId} onClick={() => setCharacterId(item.characterId)}><img src={mediaUrl(item.avatarUrl)} /><span><strong>{item.name}</strong><small>{item.summary}</small></span><i>{characterId === item.characterId && <Check />}</i></button>)}</div>{!characters.length && <div className="empty-card"><Users /><strong>还没有可授权角色</strong><p>先确认身份脸与正面全身形象</p></div>}</section>
    <section className="invite-banner"><Sparkles /><div><strong>需要新的角色？</strong><p>创建并确认人物资产后，会自动回到这里。</p><button onClick={() => navigate(`/characters/new?returnTo=${encodeURIComponent(`/invitations/${invitationId}/character`)}`)}>创建新角色</button></div></section>
    <button className={`authorization-check ${authorizationChecked ? 'active' : ''}`} onClick={() => setAuthorizationChecked(!authorizationChecked)}><i>{authorizationChecked && <Check />}</i><span><strong>授权用于这次故事</strong><small>不自动发布，不授权其他故事复用</small></span></button>
    <FixedAction><button className="primary-wide" disabled={!authorizationChecked || !characterId} onClick={async () => { try { await whatifRequest(`/api/story-invitations/${invitationId}/authorizations`, { method: 'POST', data: { characterId, authorizationChecked } }); toast.success('角色已提交给好友'); navigate('/'); } catch (e) { toast.error(errorMessage(e)); } }}><Send />提交给好友</button></FixedAction>
  </MobilePage>;
}

export function ParticipatedStoriesPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Json | null>(null);
  useEffect(() => { void whatifRequest<Json>('/api/me/participated-stories').then(setData); }, []);
  return <MobilePage title="我参与的故事" eyebrow="好友授权与共同成片">
    {!data && <LoadingState />}{data && <div className="story-list">{data.items.length ? data.items.map((item: Json) => <button className="story-record" key={item.storyId} disabled={!item.targetPath} onClick={() => item.targetPath && navigate(item.targetPath)}><div className="story-record-cover"><img src={mediaUrl(item.coverUrl)} /><span>{item.status}</span></div><div><strong>{item.title}</strong><p>我的角色参与了这条故事线</p><small>{item.status === 'generating' ? `生成中 ${item.progress}%` : item.targetPath ? '查看故事进展' : '等待好友开始创作'}</small></div><ChevronRight /></button>) : <div className="empty-card"><Users /><strong>还没有参与的故事</strong><p>好友邀请你创建角色后，会显示在这里</p></div>}</div>}
    <FixedAction><button className="primary-wide" onClick={() => navigate('/')}><Sparkles />创建我的平行世界</button></FixedAction>
  </MobilePage>;
}
