import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  CHARACTER_ASSET_PROMPT,
  CHARACTER_PROFILE_PROMPT,
  CHARACTER_VIEW_INSTRUCTIONS,
  PROMPT_VERSIONS,
  PUBLICATION_COPY_PROMPT,
  SEEDANCE_CHARACTER_MASTER_PROMPT,
  SEEDANCE_COMPILER_PROMPT,
  STORY_DIRECTOR_PROMPT,
  renderPrompt,
} from '../../prompts/whatif-prompt-registry';

type CodedError = Error & { code?: string; httpStatus?: number; details?: unknown };
type ReferenceAssetCategory = 'character_identity' | 'character_body' | 'world_style' | 'generic';
type SeedanceReferenceAsset = {
  url: string;
  token?: string;
  purpose?: string;
  category?: ReferenceAssetCategory;
};

@Injectable()
export class WhatifAiService {
  private readonly logger = new Logger(WhatifAiService.name);
  private readonly deepseekKey = process.env.DEEPSEEK_API_KEY || '';
  private readonly deepseekBase = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  private readonly deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  private readonly textGatewayBase = process.env.TEXT_GATEWAY_BASE || '';
  private readonly textGatewayToken = process.env.TEXT_GATEWAY_TOKEN || '';
  private readonly textGatewayModel = process.env.TEXT_GATEWAY_MODEL || '';
  private readonly textGatewayService = process.env.TEXT_GATEWAY_SERVICE || '';
  private readonly imageGatewayBase = process.env.IMAGE_GATEWAY_BASE || '';
  private readonly imageGatewayToken = process.env.IMAGE_GATEWAY_TOKEN || '';
  private readonly imageGatewayService = process.env.IMAGE_GATEWAY_SERVICE || '';
  private readonly imageGatewayEnabled = process.env.IMAGE_GATEWAY_ENABLED === 'true';
  private readonly imageModel = process.env.RELATIONSHIP_IMAGE_MODEL || 'doubao-seedream-4-0-250828';
  private readonly mediaKey = process.env.RELATIONSHIP_MEDIA_API_KEY || '';
  private readonly seedanceKey = process.env.SEEDANCE_API_KEY || this.mediaKey;
  private readonly seedanceBase = process.env.SEEDANCE_API_BASE || 'https://ark.cn-beijing.volces.com/api/v3';
  private readonly seedanceModel = process.env.SEEDANCE_MODEL || '';

  configSummary() {
    return {
      text: { configured: Boolean(this.textGatewayToken || this.deepseekKey), model: this.textGatewayModel || this.deepseekModel },
      image: { configured: Boolean((this.imageGatewayEnabled && this.imageGatewayToken) || this.mediaKey), model: this.imageModel },
      video: { configured: Boolean(this.seedanceKey && this.seedanceModel), model: this.seedanceModel },
      promptVersions: PROMPT_VERSIONS,
    };
  }

  private codedError(code: string, message: string, httpStatus = 502, details?: unknown): CodedError {
    const error = new Error(message) as CodedError;
    error.code = code;
    error.httpStatus = httpStatus;
    error.details = details;
    return error;
  }

  private safeJson(value: unknown) {
    if (typeof value !== 'string') return value;
    const text = value.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
      return JSON.parse(text);
    } catch {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
      throw this.codedError('TEXT_MODEL_INVALID_JSON', '文字模型返回内容不是有效 JSON', 502, text.slice(0, 500));
    }
  }

  private upstreamMessage(data: any, fallback: string) {
    return String(
      data?.error?.message || data?.error?.details || data?.message || data?.msg || data?.detail || fallback,
    );
  }

  private directScenePlan(input: Record<string, unknown>) {
    const script = String(input.script || input.userScript || '').trim();
    const story = (input.story && typeof input.story === 'object' ? input.story : {}) as Record<string, any>;
    const characters = (Array.isArray(input.characters) ? input.characters : []) as Array<Record<string, any>>;
    const previous = (input.previous && typeof input.previous === 'object' ? input.previous : null) as Record<string, any> | null;
    const names = characters.map((item) => String(item.name || '')).filter(Boolean);
    const visibleNames = names.filter((name) => script.includes(name));
    const shotCharacters = visibleNames.length ? visibleNames : names;
    const excludedCharacters = names.filter((name) => !shotCharacters.includes(name));
    const setting = String(
      story.setting
      || story.worldview?.description
      || story.worldview?.name
      || '用户剧情描述中的主要场景',
    );
    const looks = Object.fromEntries(characters.map((item) => [
      String(item.name || '角色'),
      String(item.description || '继承已确认的人物身份、脸、发型和基础造型'),
    ]));
    const openingState = previous?.continuityOut
      ? `继承上一幕结束状态：${JSON.stringify(previous.continuityOut)}`
      : `${names.join('、') || '故事人物'}位于${setting}`;

    return {
      title: script.slice(0, 18) || '新的故事片段',
      summary: script,
      capacity: {
        status: script.length > 160 ? 'tight' : 'ok',
        message: script.length > 160 ? '剧情信息较多，将优先呈现核心动作与结果' : '将按一个连续的 15 秒事件呈现',
        suggestedScript: '',
      },
      visual: {
        looks,
        scene: `${setting}。场景、美术、光线和材质继承已选世界观，不额外改写用户剧情。`,
        props: '只使用用户剧情明确出现或完成核心动作必需的具体道具，不凭空增加新物件。',
        sound: '根据用户剧情自动匹配环境音、动作音和必要的人声，保持自然同步。',
        continuity: '锁定已选人物身份、世界观、角色数量和用户明确事件，全程保持一致。',
      },
      audio: {
        voiceCasting: Object.fromEntries(names.map((name) => [name, '继承该角色稳定声线；没有明确对白时不强加对白'])),
        ambience: '与主场景一致的连续环境音',
        music: '低音量电影配乐，只服务情绪转折，不盖过动作和对白',
        mix: '对白和关键动作优先，环境音其次，音乐最低',
        durationPlan: '用一个连续可见的动作完成用户描述，镜头节奏自然控制在约15秒内',
      },
      shots: [
        {
          time: '约15秒连续镜头',
          title: '用户剧情',
          visibleCharacters: shotCharacters,
          screenOnlyCharacters: [],
          excludedCharacters,
          stateIn: openingState,
          action: script,
          stateOut: '用户描述的事件完成，人物、道具与场景停留在可供下一幕继承的明确状态',
          camera: '9:16竖屏，以一次连续、可执行的摄影调度跟随核心动作；不使用蒙太奇、重复动作或静态慢推',
          sound: '与场景一致的连续环境音、动作音和用户明确写出的对白',
          dialogue: '',
          speaker: '',
          emotion: '严格继承用户描述的情绪方向，用身体动作、表情和反应外化',
        },
      ],
      continuityOut: {
        characterStates: `${names.join('、') || '人物'}保持本幕结束时的位置、服装和情绪状态`,
        sceneState: setting,
        propStates: '继承用户剧情中已出现的关键道具及其结束状态',
        openQuestion: '仅保留当前事件自然产生的后续空间，不强加悬念',
      },
      promptVersion: PROMPT_VERSIONS.storyDirect,
    };
  }

  private directSeedanceCompilation(input: Record<string, unknown>) {
    const referenceAssets = (Array.isArray(input.referenceAssets) ? input.referenceAssets : [])
      .map((asset: any, index) => ({
        token: String(asset?.token || `@图片${index + 1}`),
        role: 'reference_image',
        purpose: String(asset?.purpose || '').trim(),
      }))
      .filter((asset) => asset.purpose);
    const referenceBindings = referenceAssets.length
      ? referenceAssets.map((asset) => `${asset.token}：${asset.purpose}`).join('\n')
      : 'No image reference is supplied.';
    const script = String(input.userScript || (input.directorPlan as any)?.summary || '').trim();
    const story = (input.story && typeof input.story === 'object' ? input.story : {}) as Record<string, any>;
    const characters = (Array.isArray(input.characters) ? input.characters : []) as Array<Record<string, any>>;
    const directorPlan = (input.directorPlan && typeof input.directorPlan === 'object' ? input.directorPlan : {}) as Record<string, any>;
    const shots = (Array.isArray(directorPlan.shots) ? directorPlan.shots : []) as Array<Record<string, any>>;
    const characterText = characters.map((item) => `${item.name || 'Character'}: ${item.description || 'preserve the approved identity'}`).join('; ');
    const timeline = shots.map((shot, index) => {
      const visible = Array.isArray(shot.visibleCharacters) ? shot.visibleCharacters.map(String).filter(Boolean) : [];
      const screenOnly = Array.isArray(shot.screenOnlyCharacters) ? shot.screenOnlyCharacters.map(String).filter(Boolean) : [];
      const excluded = Array.isArray(shot.excludedCharacters) ? shot.excludedCharacters.map(String).filter(Boolean) : [];
      return [
        `[Shot ${index + 1} | ${shot.time || ''}]`,
        `Physical on-screen cast: ${visible.length ? visible.join(', ') : 'no physical character'}.`,
        `Screen-only cast: ${screenOnly.length ? screenOnly.join(', ') : 'none'}.`,
        `Must not appear in any form: ${excluded.length ? excluded.join(', ') : 'none'}.`,
        visible.length === 1 ? `ONLY ${visible[0]} is physically visible in this shot.` : '',
        `Start state: ${shot.stateIn || ''}`,
        `Visible action: ${shot.action || ''}`,
        `End state: ${shot.stateOut || ''}`,
        `Camera and edit: ${shot.camera || ''}`,
        `Performance: ${shot.emotion || ''}`,
        `Dialogue: ${shot.speaker ? `${shot.speaker}: ` : ''}${shot.dialogue || 'none'}`,
        `Sound: ${shot.sound || ''}`,
      ].filter(Boolean).join('\n');
    }).join('\n\n');
    const compiledPrompt = [
      'Create one continuous 15-second cinematic vertical video, 9:16, 720p, with synchronized native audio.',
      `User story intent — follow this literally and do not add another event: ${script}`,
      `Story and world context: ${JSON.stringify(story)}`,
      `Characters: ${characterText || 'Use only the characters explicitly present in the user story.'}`,
      `Reference bindings: ${referenceBindings}`,
      `15-second timeline:\n${timeline}`,
      'Keep one location and one causally connected event. Every action must visibly continue from the previous state; avoid montage, slideshow pacing, static posing, excessive slow motion, or trailer-like fragments.',
      'Lock every referenced identity to its own numbered image. Preserve character count, face, hairstyle, age, body proportion, costume continuity, world style, prop state, screen direction, and spatial relationship.',
      'The global Characters list defines reusable identity assets only. It does not mean every listed character appears in every shot. Obey the cast list and exclusions written inside each shot exactly.',
      'A character listed under Must not appear cannot appear as a body, face, background extra, reflection, photo, phone avatar, display image, or automatically completed edge-of-frame figure.',
      'Use only dialogue explicitly written by the user. Do not add subtitles, captions, logos, watermarks, split screens, collages, or extra people.',
    ].join('\n');
    const prompt = referenceAssets.length
      ? `Reference asset bindings (the numbering exactly matches the following image inputs):\n${referenceBindings}\n\n${compiledPrompt}`
      : compiledPrompt;
    const textOnlyPrompt = referenceAssets.reduce(
      (value, asset) => value.replaceAll(asset.token, `[${asset.purpose}]`),
      compiledPrompt,
    );
    return {
      prompt,
      promptBody: compiledPrompt,
      textOnlyPrompt,
      negativePrompt: 'identity drift, face swap, extra people, unlisted cast, excluded character appearing, offscreen character returning, background doubles, character in reflection, character in phone screen without permission, character fusion, costume change, malformed anatomy, duplicated limbs, deformed hands, prop mutation, inconsistent background, montage, slideshow, static posing, excessive slow motion, subtitles, captions, logo, watermark, split screen, collage',
      referencePlan: referenceAssets,
      promptVersion: PROMPT_VERSIONS.seedanceDirect,
    };
  }

  private async textJson(
    prompt: string,
    temperature = 0.55,
    options?: {
      timeoutMs?: number;
      gatewayTimeoutMs?: number;
      fallbackTimeoutMs?: number;
      allowProviderFallback?: boolean;
      gatewayAttempts?: number;
      maxTokens?: number;
    },
  ) {
    const gatewayReady = Boolean(this.textGatewayBase && this.textGatewayToken && this.textGatewayModel);
    const deepseekReady = Boolean(this.deepseekKey);
    const timeoutMs = options?.timeoutMs ?? 45_000;
    const allowProviderFallback = options?.allowProviderFallback ?? true;
    const gatewayAttempts = Math.max(1, Math.min(3, options?.gatewayAttempts ?? 1));
    const gatewayTimeoutMs = options?.gatewayTimeoutMs ?? Math.min(timeoutMs, 20_000);
    const fallbackTimeoutMs = options?.fallbackTimeoutMs ?? timeoutMs;
    const maxTokens = options?.maxTokens ?? 4_096;
    if (!gatewayReady && !deepseekReady) {
      throw this.codedError('TEXT_MODEL_NOT_CONFIGURED', '豆包文字接口尚未配置', 503);
    }

    const request = async (
      endpoint: string,
      token: string,
      model: string,
      service?: string,
      requestTimeoutMs = timeoutMs,
      provider = 'text_model',
    ) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        };
        if (service) headers['soul-ai-service'] = service;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            model,
            stream: false,
            temperature,
            response_format: { type: 'json_object' },
            max_tokens: maxTokens,
            ...(provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        const data: any = await response.json();
        if (!response.ok) {
          throw this.codedError(
            `TEXT_MODEL_HTTP_${response.status}`,
            this.upstreamMessage(data, `文字模型请求失败：${response.status}`),
            502,
            data,
          );
        }
        return this.safeJson(data?.choices?.[0]?.message?.content || '{}');
      } catch (error) {
        if (controller.signal.aborted) throw this.codedError('TEXT_MODEL_TIMEOUT', '文字模型生成超时', 504);
        if (!(error as CodedError)?.code) {
          const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
          throw this.codedError(
            'TEXT_MODEL_NETWORK_ERROR',
            `${provider === 'deepseek' ? '备用文字模型' : 'Soul 文字网关'}网络连接失败`,
            502,
            { provider, causeCode: cause?.code || '', causeMessage: cause?.message || String(error) },
          );
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    };

    const gatewayRequest = async () => {
      let lastError: unknown;
      for (const delayMs of [0, 3_000, 8_000].slice(0, gatewayAttempts)) {
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        try {
          return await request(
            `${this.textGatewayBase}/v1/chat/completions`,
            this.textGatewayToken,
            this.textGatewayModel,
            this.textGatewayService,
            gatewayTimeoutMs,
            'soul_text_gateway',
          );
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : String(error);
          if (!/TPM|RPM|rate|limit|429|限流/i.test(message)) throw error;
          this.logger.warn(`Soul text gateway is rate limited; retrying with backoff. reason=${message}`);
        }
      }
      throw lastError;
    };

    try {
      if (gatewayReady) {
        return await gatewayRequest();
      }
      return await request(
        `${this.deepseekBase}/chat/completions`,
        this.deepseekKey,
        this.deepseekModel,
        undefined,
        fallbackTimeoutMs,
        'deepseek',
      );
    } catch (error) {
      if (allowProviderFallback && gatewayReady && deepseekReady && process.env.MODEL_FALLBACK_ON_ERROR === 'true') {
        this.logger.warn(`Soul text gateway failed; using configured fallback: ${error instanceof Error ? error.message : error}`);
        try {
          return await request(
            `${this.deepseekBase}/chat/completions`,
            this.deepseekKey,
            this.deepseekModel,
            undefined,
            fallbackTimeoutMs,
            'deepseek',
          );
        } catch (fallbackError) {
          this.logger.warn(`Configured text fallback also failed: ${fallbackError instanceof Error ? fallbackError.message : fallbackError}`);
          throw this.codedError(
            'TEXT_MODEL_ALL_PROVIDERS_FAILED',
            'AI 分镜服务暂时不可用，请稍后重试',
            502,
            {
              primary: error instanceof Error ? error.message : String(error),
              fallback: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
            },
          );
        }
      }
      throw error;
    }
  }

  async buildCharacterProfile(input: { name: string; description: string }) {
    const result: any = await this.textJson(
      renderPrompt(CHARACTER_PROFILE_PROMPT, {
        NAME: input.name,
        DESCRIPTION: input.description,
      }),
      0.35,
    );
    return {
      stableDescription: String(result?.stableDescription || input.description),
      identityAnchors: Array.isArray(result?.identityAnchors) ? result.identityAnchors.slice(0, 6).map(String) : [],
      missingHints: Array.isArray(result?.missingHints) ? result.missingHints.slice(0, 4).map(String) : [],
      promptVersion: PROMPT_VERSIONS.characterProfile,
    };
  }

  private validImageUrls(values: unknown, limit = 8) {
    const flattened = Array.isArray(values) ? values.flat(4) : [values];
    return Array.from(
      new Set(
        flattened
          .map((value) => String(value || '').trim())
          .filter((value) => value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image')),
      ),
    ).slice(0, limit);
  }

  async generateCharacterAsset(input: {
    name: string;
    description: string;
    identityAnchors?: string[];
    kind: string;
    instruction?: string;
    referenceImages: string[];
    previousAsset?: string;
  }) {
    const usingGateway = this.imageGatewayEnabled && Boolean(this.imageGatewayBase && this.imageGatewayToken);
    const token = usingGateway ? this.imageGatewayToken : this.mediaKey;
    if (!token) throw this.codedError('IMAGE_MODEL_NOT_CONFIGURED', '豆包图片接口尚未配置', 503);
    const viewInstruction = CHARACTER_VIEW_INSTRUCTIONS[input.kind];
    if (!viewInstruction) throw this.codedError('UNSUPPORTED_CHARACTER_VIEW', '不支持的人物标准视图', 400);
    const images = this.validImageUrls([input.previousAsset, input.referenceImages], 4);
    if (!images.length) throw this.codedError('CHARACTER_REFERENCE_REQUIRED', '请至少上传一张人物参考照片', 400);

    const prompt = renderPrompt(CHARACTER_ASSET_PROMPT, {
      NAME: input.name,
      DESCRIPTION: input.description,
      IDENTITY_ANCHORS: (input.identityAnchors || []).join(', '),
      REFINEMENT: input.instruction || 'Keep all approved identity details unchanged.',
      VIEW_INSTRUCTION: viewInstruction,
    });
    const endpoint = usingGateway
      ? `${this.imageGatewayBase}/v1/images/generations`
      : 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    if (usingGateway && this.imageGatewayService) headers['soul-ai-service'] = this.imageGatewayService;
    const traceId = randomUUID();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { ...headers, 'x-story-trace-id': traceId },
      body: JSON.stringify({
        model: this.imageModel,
        prompt,
        image: images,
        size: usingGateway ? '2048x2048' : '1024x1024',
        response_format: 'url',
        sequential_image_generation: 'disabled',
        stream: false,
        watermark: false,
      }),
    });
    const data: any = await response.json();
    if (!response.ok) {
      throw this.codedError(
        `CHARACTER_IMAGE_HTTP_${response.status}`,
        this.upstreamMessage(data, `人物图片生成失败：${response.status}`),
        502,
        data,
      );
    }
    const imageUrl = String(data?.data?.[0]?.url || data?.images?.[0]?.url || '');
    if (!imageUrl) throw this.codedError('CHARACTER_IMAGE_EMPTY_RESULT', '人物图片生成成功，但未返回图片', 502);
    return { imageUrl, traceId, promptVersion: PROMPT_VERSIONS.characterAsset, provider: usingGateway ? 'soul-seedream-gateway' : 'volcengine-ark', providerModel: this.imageModel };
  }

  async generateSeedanceCharacterMaster(input: { name: string; description: string; sourceImage?: string }) {
    const usingGateway = this.imageGatewayEnabled && Boolean(this.imageGatewayBase && this.imageGatewayToken);
    const token = usingGateway ? this.imageGatewayToken : this.mediaKey;
    if (!token) throw this.codedError('SEEDANCE_CHARACTER_PREPARATION_NOT_CONFIGURED', '人物资产认证服务尚未配置', 503);
    const images = this.validImageUrls([input.sourceImage], 1);
    const prompt = renderPrompt(SEEDANCE_CHARACTER_MASTER_PROMPT, {
      NAME: input.name,
      DESCRIPTION: input.description,
      SOURCE_INSTRUCTION: images.length
        ? 'Use the supplied image only as the identity source. Preserve the same recognizable fictional face, facial proportions, hairstyle, adult age, body proportions and distinguishing features while rebuilding a clean original AIGC asset.'
        : 'No identity image is supplied. Invent one fully original adult face from the stable description. Do not resemble any real person, celebrity or copyrighted character.',
    });
    const endpoint = usingGateway ? `${this.imageGatewayBase}/v1/images/generations` : 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (usingGateway && this.imageGatewayService) headers['soul-ai-service'] = this.imageGatewayService;
    const traceId = randomUUID();
    const requestBody: Record<string, unknown> = {
      model: this.imageModel,
      prompt,
      size: usingGateway ? '2048x2048' : '1024x1024',
      response_format: 'url',
      sequential_image_generation: 'disabled',
      stream: false,
      watermark: false,
    };
    if (images.length) requestBody.image = images;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { ...headers, 'x-story-trace-id': traceId },
      body: JSON.stringify(requestBody),
    });
    const data: any = await response.json();
    if (!response.ok) throw this.codedError(`SEEDANCE_CHARACTER_PREPARATION_HTTP_${response.status}`, this.upstreamMessage(data, `人物资产认证失败：${response.status}`), 502, data);
    const imageUrl = String(data?.data?.[0]?.url || data?.images?.[0]?.url || '');
    if (!imageUrl) throw this.codedError('SEEDANCE_CHARACTER_PREPARATION_EMPTY', '人物资产认证成功，但未返回图片', 502);
    return { imageUrl, traceId, promptVersion: PROMPT_VERSIONS.seedanceCharacterMaster, provider: usingGateway ? 'soul-seedream-gateway' : 'volcengine-ark', providerModel: this.imageModel };
  }

  async generateWorldviewImage(input: {
    name: string;
    description: string;
    instruction?: string;
    referenceImages?: string[];
  }) {
    const usingGateway = this.imageGatewayEnabled && Boolean(this.imageGatewayBase && this.imageGatewayToken);
    const token = usingGateway ? this.imageGatewayToken : this.mediaKey;
    if (!token) throw this.codedError('IMAGE_MODEL_NOT_CONFIGURED', '豆包图片接口尚未配置', 503);
    const references = this.validImageUrls(input.referenceImages || [], 4);
    const prompt = `Create one premium 9:16 vertical world style master image for a continuous short-video story. World name: ${input.name}. World description: ${input.description}. ${input.instruction ? `Point refinement: ${input.instruction}. Preserve every unrelated approved detail.` : ''} Show the repeatable production design: era, architecture, landscape, weather, lighting, color palette, material texture, technology or magic rules. No main character, no portrait, no collage, no split screen, no text, no logo, no watermark. The image must be a reusable style and environment reference for later Seedance video generation.`;
    const endpoint = usingGateway
      ? `${this.imageGatewayBase}/v1/images/generations`
      : 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (usingGateway && this.imageGatewayService) headers['soul-ai-service'] = this.imageGatewayService;
    const traceId = randomUUID();
    const body: Record<string, unknown> = {
      model: this.imageModel,
      prompt,
      size: usingGateway ? '2048x2048' : '1024x1024',
      response_format: 'url',
      sequential_image_generation: 'disabled',
      stream: false,
      watermark: false,
    };
    if (references.length) body.image = references;
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    const data: any = await response.json();
    if (!response.ok) {
      throw this.codedError(
        `WORLDVIEW_IMAGE_HTTP_${response.status}`,
        this.upstreamMessage(data, `世界观图片生成失败：${response.status}`),
        502,
        data,
      );
    }
    const imageUrl = String(data?.data?.[0]?.url || data?.images?.[0]?.url || '');
    if (!imageUrl) throw this.codedError('WORLDVIEW_IMAGE_EMPTY_RESULT', '世界观图片生成成功，但未返回图片', 502);
    return { imageUrl, traceId, promptVersion: 'worldview-asset-v2' };
  }

  normalizeDirectorPlan(plan: Record<string, any>, characters: Array<Record<string, any>>): Record<string, any> {
    const characterNames = characters.map((item) => String(item.name || '').trim()).filter(Boolean);
    const shots = (Array.isArray(plan?.shots) ? plan.shots : []).slice(0, 4).map((shot: Record<string, any>) => {
      const shotText = [shot.stateIn, shot.action, shot.stateOut, shot.dialogue, shot.speaker]
        .map((value) => String(value || ''))
        .join(' ');
      const suppliedVisible = Array.isArray(shot.visibleCharacters) ? shot.visibleCharacters.map(String) : [];
      const suppliedScreenOnly = Array.isArray(shot.screenOnlyCharacters) ? shot.screenOnlyCharacters.map(String) : [];
      const visibleCharacters = characterNames.filter((name) => suppliedVisible.includes(name) || (!suppliedVisible.length && shotText.includes(name)));
      const screenOnlyCharacters = characterNames.filter((name) => suppliedScreenOnly.includes(name) && !visibleCharacters.includes(name));
      const suppliedExcluded = Array.isArray(shot.excludedCharacters) ? shot.excludedCharacters.map(String) : [];
      const excludedCharacters = characterNames.filter((name) => (
        suppliedExcluded.includes(name)
        || (!visibleCharacters.includes(name) && !screenOnlyCharacters.includes(name))
      ));
      return { ...shot, visibleCharacters, screenOnlyCharacters, excludedCharacters };
    });
    if (shots.length < 1) throw this.codedError('DIRECTOR_INVALID_RESPONSE', 'AI 分镜不完整，请重新生成', 502);
    const actions = shots.map((shot: Record<string, any>) => String(shot.action || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (actions.length !== shots.length || new Set(actions).size !== actions.length) {
      throw this.codedError('DIRECTOR_REPEATED_ACTION', 'AI 分镜没有拆成不同的连续动作，请重新生成', 502);
    }
    if (shots.some((shot: Record<string, any>) => !shot.visibleCharacters.length && !shot.screenOnlyCharacters.length)) {
      throw this.codedError('DIRECTOR_CAST_MISSING', 'AI 分镜缺少逐镜头出镜人物，请重新生成', 502);
    }
    return { ...plan, shots };
  }

  async directScene(input: Record<string, unknown>): Promise<Record<string, any>> {
    const result: any = await this.textJson(
      renderPrompt(STORY_DIRECTOR_PROMPT, { INPUT_JSON: JSON.stringify(input) }),
      0.45,
      {
        timeoutMs: 30_000,
        gatewayTimeoutMs: 10_000,
        fallbackTimeoutMs: 20_000,
        allowProviderFallback: true,
        gatewayAttempts: 1,
        maxTokens: 3_000,
      },
    );
    const characters = (Array.isArray(input.characters) ? input.characters : []) as Array<Record<string, any>>;
    const normalized = this.normalizeDirectorPlan(result, characters);
    return {
      ...normalized,
      promptVersion: PROMPT_VERSIONS.storyDirector,
    };
  }

  buildDirectScene(input: Record<string, unknown>) {
    return this.directScenePlan(input);
  }

  async compileSeedance(input: Record<string, unknown>) {
    const referenceAssets = (Array.isArray(input.referenceAssets) ? input.referenceAssets : [])
      .map((asset: any, index) => ({
        token: String(asset?.token || `@图片${index + 1}`),
        role: 'reference_image',
        purpose: String(asset?.purpose || '').trim(),
      }))
      .filter((asset) => asset.purpose);
    const referenceBindings = referenceAssets.length
      ? referenceAssets.map((asset) => `${asset.token}：${asset.purpose}`).join('\n')
      : '本次没有图片参考，只根据文字导演方案生成。';
    let result: any;
    try {
      result = await this.textJson(
        renderPrompt(SEEDANCE_COMPILER_PROMPT, {
          REFERENCE_BINDINGS: referenceBindings,
          INPUT_JSON: JSON.stringify(input),
        }),
        0.2,
        {
          timeoutMs: 25_000,
          gatewayTimeoutMs: 10_000,
          fallbackTimeoutMs: 15_000,
          allowProviderFallback: true,
          gatewayAttempts: 1,
          maxTokens: 3_000,
        },
      );
    } catch (error) {
      this.logger.warn(`Seedance compiler model failed; using deterministic compiler. reason=${error instanceof Error ? error.message : error}`);
      return this.directSeedanceCompilation(input);
    }
    const compiledPrompt = String(result?.prompt || '').trim();
    if (!compiledPrompt) throw this.codedError('SEEDANCE_PROMPT_EMPTY', '视频 Prompt 编译失败', 502);
    const prompt = referenceAssets.length
      ? `Reference asset bindings (the numbering exactly matches the following image inputs):\n${referenceBindings}\n\n${compiledPrompt}`
      : compiledPrompt;
    const textOnlyPrompt = referenceAssets.reduce(
      (value, asset) => value.replaceAll(asset.token, `[${asset.purpose}]`),
      compiledPrompt,
    );
    return {
      prompt,
      promptBody: compiledPrompt,
      textOnlyPrompt,
      negativePrompt: String(result?.negativePrompt || ''),
      referencePlan: referenceAssets,
      promptVersion: PROMPT_VERSIONS.seedanceCompiler,
    };
  }

  compileSeedanceDirect(input: Record<string, unknown>) {
    return this.directSeedanceCompilation(input);
  }

  private seedanceHeaders() {
    return {
      Authorization: `Bearer ${this.seedanceKey}`,
      'X-API-Key': this.seedanceKey,
      'Content-Type': 'application/json',
    };
  }

  private walk(value: any, visitor: (value: any, key: string) => void, key = '', seen = new Set<any>()) {
    if (value && typeof value === 'object') {
      if (seen.has(value)) return;
      seen.add(value);
    }
    visitor(value, key);
    if (Array.isArray(value)) value.forEach((item, index) => this.walk(item, visitor, String(index), seen));
    else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([childKey, child]) => this.walk(child, visitor, childKey, seen));
    }
  }

  private taskId(data: any) {
    const direct = String(data?.id || data?.task_id || data?.taskId || data?.data?.id || data?.data?.task_id || '');
    if (direct) return direct;
    let result = '';
    this.walk(data, (value, key) => {
      if (!result && typeof value === 'string' && /^(id|task_id|taskId)$/i.test(key)) result = value;
    });
    return result;
  }

  private taskStatus(data: any) {
    const direct = String(data?.status || data?.state || data?.task_status || data?.data?.status || '').toLowerCase();
    if (direct) return direct;
    let result = '';
    this.walk(data, (value, key) => {
      if (!result && typeof value === 'string' && /^(status|state|task_status|taskStatus)$/i.test(key)) result = value.toLowerCase();
    });
    return result;
  }

  private videoUrl(data: any) {
    const candidates = [
      data?.video_url?.url,
      data?.video_url,
      data?.output?.video_url?.url,
      data?.output?.video_url,
      data?.result?.video_url,
      data?.data?.video_url,
      data?.data?.output?.video_url,
    ];
    let result = candidates.map(String).find((value) => /^https?:\/\//.test(value) && /\.(mp4|mov)(\?|$)/i.test(value)) || '';
    if (result) return result;
    this.walk(data, (value, key) => {
      if (!result && typeof value === 'string' && /^https?:\/\//.test(value) && (/video/i.test(key) || /\.(mp4|mov)(\?|$)/i.test(value))) result = value;
    });
    return result;
  }

  private imageUrlByKey(data: any, exactCandidates: unknown[], keyPattern: RegExp) {
    const imageUrl = (value: unknown) => {
      const text = String(value || '');
      return /^https?:\/\//.test(text) && /\.(png|jpe?g|webp)(\?|$)/i.test(text) ? text : '';
    };
    const direct = exactCandidates.map(imageUrl).find(Boolean);
    if (direct) return direct;
    let result = '';
    this.walk(data, (value, key) => {
      if (!result && keyPattern.test(key)) result = imageUrl(value);
    });
    return result;
  }

  private firstFrameUrl(data: any) {
    return this.imageUrlByKey(data, [
      data?.first_frame_url,
      data?.first_frame?.url,
      data?.poster_url,
      data?.poster?.url,
      data?.cover_url,
      data?.cover?.url,
      data?.content?.first_frame_url,
      data?.content?.first_frame?.url,
      data?.content?.poster_url,
      data?.content?.poster?.url,
      data?.output?.first_frame_url,
      data?.output?.poster_url,
      data?.result?.first_frame_url,
      data?.data?.first_frame_url,
      data?.data?.content?.first_frame_url,
      data?.data?.output?.first_frame_url,
    ], /^(first[_-]?frame[_-]?url|first[_-]?frame|poster[_-]?url|poster|cover[_-]?url|cover)$/i);
  }

  private lastFrameUrl(data: any) {
    return this.imageUrlByKey(data, [
      data?.last_frame_url,
      data?.last_frame?.url,
      data?.content?.last_frame_url,
      data?.content?.last_frame?.url,
      data?.output?.last_frame_url,
      data?.output?.last_frame?.url,
      data?.result?.last_frame_url,
      data?.data?.last_frame_url,
      data?.data?.content?.last_frame_url,
      data?.data?.output?.last_frame_url,
    ], /^(last[_-]?frame[_-]?url|last[_-]?frame)$/i);
  }

  videoMedia(data: any) {
    return {
      videoUrl: this.videoUrl(data),
      firstFrameUrl: this.firstFrameUrl(data),
      lastFrameUrl: this.lastFrameUrl(data),
    };
  }

  private taskError(data: any) {
    return String(data?.error?.message || data?.message || data?.failure_reason || data?.data?.error?.message || '');
  }

  private shouldRetryWithoutReferences(message: string) {
    return /real person|input image may contain|真人|reference_image|unsupported|not supported|image format|copyright|restriction|policy.?violation|sensitive content|InputImageSensitiveContentDetected|InvalidParameter\.UnsupportedImageFormat/i.test(message);
  }

  private rejectedContentIndex(message: string) {
    const matched = message.match(/content\[(\d+)\]/i);
    return matched ? Number(matched[1]) : -1;
  }

  async createVideo(input: {
    prompt: string;
    promptBody?: string;
    referenceImages?: string[];
    referenceAssets?: SeedanceReferenceAsset[];
    traceId?: string;
    taskId?: string;
    sceneId?: string;
  }) {
    if (!this.seedanceKey || !this.seedanceModel) {
      throw this.codedError('SEEDANCE_NOT_CONFIGURED', 'Seedance 2.0 尚未配置', 503);
    }
    const traceId = input.traceId || randomUUID();
    const sourceAssets = Array.isArray(input.referenceAssets) && input.referenceAssets.length
      ? input.referenceAssets
      : (input.referenceImages || []).map((url, index) => ({
          url,
          token: `@图片${index + 1}`,
          purpose: `第${index + 1}张参考图`,
          category: 'generic' as const,
        }));
    const validUrls = new Set(this.validImageUrls(sourceAssets.map((asset) => asset.url), 9));
    const referenceAssets = sourceAssets
      .filter((asset) => validUrls.has(String(asset.url || '').trim()))
      .map((asset, index) => ({
        url: String(asset.url).trim(),
        token: String(asset.token || `@图片${index + 1}`),
        purpose: String(asset.purpose || `第${index + 1}张参考图`),
        category: asset.category || 'generic',
      }));
    const attempts: Array<Record<string, unknown>> = [];
    const endpoint = `${this.seedanceBase}/contents/generations/tasks`;
    const requestLog = () => ({
      traceId,
      taskId: input.taskId,
      sceneId: input.sceneId,
      endpoint,
      headers: {
        Authorization: 'Bearer <redacted>',
        'X-API-Key': '<redacted>',
        'Content-Type': 'application/json',
      },
      attempts,
    });
    const submit = async (content: any[], inputMode: string) => {
      const requestBody = {
        model: this.seedanceModel,
        content,
        resolution: '720p',
        ratio: '9:16',
        duration: 15,
        generate_audio: true,
        watermark: false,
        return_last_frame: true,
      };
      const attemptNumber = attempts.length + 1;
      this.logger.log(JSON.stringify({
        event: 'whatif.seedance.request',
        traceId,
        taskId: input.taskId,
        sceneId: input.sceneId,
        attempt: attemptNumber,
        inputMode,
        endpoint,
        request: requestBody,
      }));
      const response = await fetch(`${this.seedanceBase}/contents/generations/tasks`, {
        method: 'POST',
        headers: this.seedanceHeaders(),
        body: JSON.stringify(requestBody),
      });
      const responseText = await response.text();
      let data: any;
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = { rawText: responseText };
      }
      attempts.push({
        attempt: attemptNumber,
        inputMode,
        requestedAt: new Date().toISOString(),
        request: requestBody,
        httpStatus: response.status,
        response: data,
      });
      this.logger.log(JSON.stringify({
        event: 'whatif.seedance.response',
        traceId,
        taskId: input.taskId,
        sceneId: input.sceneId,
        attempt: attemptNumber,
        inputMode,
        httpStatus: response.status,
        response: data,
      }));
      return { response, data };
    };

    const promptBody = input.promptBody || input.prompt;
    const remapPrompt = (
      body: string,
      originalAssets: typeof referenceAssets,
      activeAssets: typeof referenceAssets,
    ) => {
      let remapped = body;
      originalAssets.forEach((asset, index) => {
        remapped = remapped.replaceAll(asset.token, `__SEEDANCE_REFERENCE_${index + 1}__`);
      });
      originalAssets.forEach((asset, index) => {
        const activeIndex = activeAssets.findIndex((active) => active.url === asset.url);
        const replacement = activeIndex >= 0
          ? `@图片${activeIndex + 1}`
          : `[${asset.purpose}，该参考图不可用，仅按文字描述]`;
        remapped = remapped.replaceAll(`__SEEDANCE_REFERENCE_${index + 1}__`, replacement);
      });
      return remapped;
    };
    const boundPrompt = (activeAssets: typeof referenceAssets) => {
      const body = remapPrompt(promptBody, referenceAssets, activeAssets);
      if (!activeAssets.length) return body;
      const bindings = activeAssets
        .map((asset, index) => `@图片${index + 1}：${asset.purpose}`)
        .join('\n');
      return `Reference asset bindings (the numbering exactly matches the following image inputs):\n${bindings}\n\n${body}`;
    };
    const contentFor = (activeAssets: typeof referenceAssets) => [
      { type: 'text', text: boundPrompt(activeAssets) },
      ...activeAssets.map((asset) => ({
        type: 'image_url',
        image_url: { url: asset.url },
        role: 'reference_image',
      })),
    ];
    const characterAssets = (assets: typeof referenceAssets) => assets.filter((asset) => (
      asset.category === 'character_identity' || asset.category === 'character_body'
    ));
    const throwCharacterAssetRejected = (message: string, data: unknown, asset?: (typeof referenceAssets)[number]): never => {
      const exception = new BadGatewayException({
        code: 'SEEDANCE_CHARACTER_ASSET_REJECTED',
        message: `${asset?.purpose || '所选人物资产'}未通过 Seedance 人物参考校验。系统已停止生成，没有替换成陌生人；请重新生成人物资产后重试。`,
        details: { upstreamMessage: message, rejectedAsset: asset, upstream: data },
      });
      (exception as BadGatewayException & { requestLog?: unknown }).requestLog = requestLog();
      throw exception;
    };

    let activeAssets = referenceAssets;
    let content: any[] = contentFor(activeAssets);
    let inputMode = activeAssets.length ? 'reference_image' : 'text_only';
    let { response, data } = await submit(content, inputMode);
    const firstError = this.taskError(data);
    if (!response.ok && activeAssets.length && this.shouldRetryWithoutReferences(firstError)) {
      const rejectedIndex = this.rejectedContentIndex(firstError);
      const rejectedAssetIndex = rejectedIndex - 1;
      if (rejectedAssetIndex >= 0 && rejectedAssetIndex < activeAssets.length) {
        const rejectedAsset = activeAssets[rejectedAssetIndex];
        if (characterAssets([rejectedAsset]).length) throwCharacterAssetRejected(firstError, data, rejectedAsset);
        this.logger.warn(`Seedance rejected content[${rejectedIndex}]; retrying without that reference. reason=${firstError}`);
        activeAssets = activeAssets.filter((_, index) => index !== rejectedAssetIndex);
        content = contentFor(activeAssets);
        inputMode = 'reference_image_filtered';
        ({ response, data } = await submit(content, inputMode));
      }
    }
    const referenceRetryError = this.taskError(data);
    if (!response.ok && characterAssets(activeAssets).length && this.shouldRetryWithoutReferences(referenceRetryError || firstError)) {
      const rejectedIndex = this.rejectedContentIndex(referenceRetryError || firstError);
      const rejectedAsset = rejectedIndex > 0 ? activeAssets[rejectedIndex - 1] : undefined;
      throwCharacterAssetRejected(referenceRetryError || firstError, data, rejectedAsset && characterAssets([rejectedAsset]).length ? rejectedAsset : characterAssets(activeAssets)[0]);
    }
    if (!response.ok) {
      const message = this.taskError(data) || `Seedance 创建任务失败：${response.status}`;
      const exception = new BadGatewayException({
        code: `SEEDANCE_CREATE_HTTP_${response.status}`,
        message,
        details: data,
      });
      (exception as BadGatewayException & { requestLog?: unknown }).requestLog = requestLog();
      throw exception;
    }
    const providerTaskId = this.taskId(data);
    if (!providerTaskId) {
      const error = this.codedError('SEEDANCE_TASK_ID_MISSING', 'Seedance 未返回任务 ID', 502, data) as CodedError & { requestLog?: unknown };
      error.requestLog = requestLog();
      throw error;
    }
    return { providerTaskId, status: this.taskStatus(data) || 'queued', inputMode, raw: data, requestLog: requestLog() };
  }

  async getVideoStatus(providerTaskId: string) {
    const response = await fetch(
      `${this.seedanceBase}/contents/generations/tasks/${encodeURIComponent(providerTaskId)}`,
      { headers: this.seedanceHeaders() },
    );
    const data: any = await response.json();
    if (!response.ok) {
      throw this.codedError(
        `SEEDANCE_STATUS_HTTP_${response.status}`,
        this.taskError(data) || `Seedance 查询任务失败：${response.status}`,
        502,
        data,
      );
    }
    return {
      status: this.taskStatus(data) || 'running',
      ...this.videoMedia(data),
      error: this.taskError(data),
      raw: data,
    };
  }

  async publicationCopy(input: Record<string, unknown>) {
    const result: any = await this.textJson(
      renderPrompt(PUBLICATION_COPY_PROMPT, { INPUT_JSON: JSON.stringify(input) }),
      0.45,
    );
    return {
      title: String(result?.title || '我的平行世界'),
      summary: String(result?.summary || ''),
      tags: Array.isArray(result?.tags) ? result.tags.slice(0, 4).map(String) : [],
      promptVersion: PROMPT_VERSIONS.publicationCopy,
    };
  }
}
