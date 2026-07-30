import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  CHARACTER_ASSET_PROMPT,
  CHARACTER_PROFILE_PROMPT,
  CHARACTER_VIEW_INSTRUCTIONS,
  PROMPT_VERSIONS,
  PUBLICATION_COPY_PROMPT,
  SEEDANCE_COMPILER_PROMPT,
  STORY_DIRECTOR_PROMPT,
  renderPrompt,
} from '../../prompts/whatif-prompt-registry';

type CodedError = Error & { code?: string; httpStatus?: number; details?: unknown };

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

  private async textJson(prompt: string, temperature = 0.55) {
    const gatewayReady = Boolean(this.textGatewayBase && this.textGatewayToken && this.textGatewayModel);
    const deepseekReady = Boolean(this.deepseekKey);
    if (!gatewayReady && !deepseekReady) {
      throw this.codedError('TEXT_MODEL_NOT_CONFIGURED', '豆包文字接口尚未配置', 503);
    }

    const request = async (
      endpoint: string,
      token: string,
      model: string,
      service?: string,
      timeoutMs = 45_000,
    ) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
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
        throw error;
      } finally {
        clearTimeout(timer);
      }
    };

    const gatewayRequest = async () => {
      let lastError: unknown;
      for (const delayMs of [0, 3_000, 8_000]) {
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        try {
          return await request(
            `${this.textGatewayBase}/v1/chat/completions`,
            this.textGatewayToken,
            this.textGatewayModel,
            this.textGatewayService,
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
      return await request(`${this.deepseekBase}/chat/completions`, this.deepseekKey, this.deepseekModel);
    } catch (error) {
      if (gatewayReady && deepseekReady && process.env.MODEL_FALLBACK_ON_ERROR === 'true') {
        this.logger.warn(`Soul text gateway failed; using configured fallback: ${error instanceof Error ? error.message : error}`);
        try {
          return await request(`${this.deepseekBase}/chat/completions`, this.deepseekKey, this.deepseekModel);
        } catch (fallbackError) {
          this.logger.warn(`Configured text fallback also failed: ${fallbackError instanceof Error ? fallbackError.message : fallbackError}`);
          throw error;
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
    return { imageUrl, traceId, promptVersion: PROMPT_VERSIONS.characterAsset };
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

  async directScene(input: Record<string, unknown>) {
    const result: any = await this.textJson(
      renderPrompt(STORY_DIRECTOR_PROMPT, { INPUT_JSON: JSON.stringify(input) }),
      0.45,
    );
    const shots = Array.isArray(result?.shots) ? result.shots.slice(0, 4) : [];
    if (shots.length < 2) throw this.codedError('DIRECTOR_INVALID_RESPONSE', 'AI 分镜不完整，请重新生成', 502);
    return {
      ...result,
      shots,
      promptVersion: PROMPT_VERSIONS.storyDirector,
    };
  }

  async compileSeedance(input: Record<string, unknown>) {
    const result: any = await this.textJson(
      renderPrompt(SEEDANCE_COMPILER_PROMPT, { INPUT_JSON: JSON.stringify(input) }),
      0.2,
    );
    const prompt = String(result?.prompt || '').trim();
    if (!prompt) throw this.codedError('SEEDANCE_PROMPT_EMPTY', '视频 Prompt 编译失败', 502);
    return {
      prompt,
      negativePrompt: String(result?.negativePrompt || ''),
      referencePlan: Array.isArray(result?.referencePlan) ? result.referencePlan : [],
      promptVersion: PROMPT_VERSIONS.seedanceCompiler,
    };
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

  private taskError(data: any) {
    return String(data?.error?.message || data?.message || data?.failure_reason || data?.data?.error?.message || '');
  }

  private shouldRetryWithoutReferences(message: string) {
    return /real person|input image may contain|真人|reference_image|unsupported|not supported|image format|InvalidParameter\.UnsupportedImageFormat/i.test(message);
  }

  async createVideo(input: { prompt: string; referenceImages?: string[]; copyrightSafePrompt?: string }) {
    if (!this.seedanceKey || !this.seedanceModel) {
      throw this.codedError('SEEDANCE_NOT_CONFIGURED', 'Seedance 2.0 尚未配置', 503);
    }
    const images = this.validImageUrls(input.referenceImages || [], 4);
    const submit = async (content: any[]) => {
      const response = await fetch(`${this.seedanceBase}/contents/generations/tasks`, {
        method: 'POST',
        headers: this.seedanceHeaders(),
        body: JSON.stringify({
          model: this.seedanceModel,
          content,
          resolution: '720p',
          ratio: '9:16',
          duration: 15,
          generate_audio: true,
          watermark: false,
          return_last_frame: true,
        }),
      });
      const data: any = await response.json();
      return { response, data };
    };

    const content: any[] = [{ type: 'text', text: input.prompt }];
    images.forEach((url) => content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' }));
    let { response, data } = await submit(content);
    let inputMode = images.length ? 'reference_image' : 'text_only';
    const firstError = this.taskError(data);
    if (!response.ok && images.length && this.shouldRetryWithoutReferences(firstError)) {
      this.logger.warn(`Seedance rejected reference input; one text-only safety retry is submitted. reason=${firstError}`);
      ({ response, data } = await submit([
        { type: 'text', text: JSON.stringify({ dynamic_caption: input.copyrightSafePrompt || input.prompt }) },
      ]));
      inputMode = 'text_only_safety_fallback';
    }
    if (!response.ok) {
      const message = this.taskError(data) || `Seedance 创建任务失败：${response.status}`;
      throw new BadGatewayException({
        code: `SEEDANCE_CREATE_HTTP_${response.status}`,
        message,
        details: data,
      });
    }
    const providerTaskId = this.taskId(data);
    if (!providerTaskId) throw this.codedError('SEEDANCE_TASK_ID_MISSING', 'Seedance 未返回任务 ID', 502, data);
    return { providerTaskId, status: this.taskStatus(data) || 'queued', inputMode, raw: data };
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
      videoUrl: this.videoUrl(data),
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
