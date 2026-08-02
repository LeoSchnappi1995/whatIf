import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  WHATIF_VOICE_PRESETS,
  type WhatifVoiceProfile,
} from '../../../shared/whatif-voices';

type AnyRecord = Record<string, any>;

interface SoulH5Role {
  name?: string;
  description?: string;
  voiceId?: string;
  avatar?: string;
  originAudioUrl?: string;
  cloneAudioUrl?: string;
  msgs?: Array<{ speaker?: number; text?: string; url?: string | null }>;
}

@Injectable()
export class WhatifVoiceService {
  private readonly logger = new Logger(WhatifVoiceService.name);
  private readonly h5Base = (process.env.SOUL_H5_TTS_BASE || 'https://api-h5.soulapp.cn').replace(/\/+$/, '');
  private readonly providerEnabled = process.env.WHATIF_REAL_VOICE_ENABLED !== 'false';
  private cachedOptions?: { expiresAt: number; options: WhatifVoiceProfile[]; source: string };

  async voiceOptions() {
    if (!this.providerEnabled) return { items: WHATIF_VOICE_PRESETS, source: 'local', traceId: randomUUID() };
    const cached = this.cachedOptions;
    if (cached && cached.expiresAt > Date.now()) {
      return { items: cached.options, source: cached.source, traceId: randomUUID() };
    }
    try {
      const response = await fetch(`${this.h5Base}/html/tts/queryAllRoles`, { signal: AbortSignal.timeout(10_000) });
      const data = await this.parseResponse(response);
      const roles = Array.isArray(data?.data) ? data.data as SoulH5Role[] : [];
      const options = roles.map((role) => this.mapSoulH5Role(role)).filter(Boolean) as WhatifVoiceProfile[];
      if (!options.length) throw new Error('empty Soul H5 TTS role list');
      this.cachedOptions = { expiresAt: Date.now() + 10 * 60 * 1000, options, source: 'soul-h5-openapi' };
      return { items: options, source: 'soul-h5-openapi', traceId: randomUUID() };
    } catch (error) {
      this.logger.warn(`Soul H5 TTS voices unavailable, using local presets: ${error instanceof Error ? error.message : error}`);
      return { items: WHATIF_VOICE_PRESETS, source: 'local_fallback', traceId: randomUUID() };
    }
  }

  async generatePreviewAudio(ownerId: string, voiceProfile: Partial<WhatifVoiceProfile>, text?: string) {
    const providerVoiceId = this.providerVoiceId(voiceProfile);
    const ttsText = String(text || voiceProfile.previewText || '').trim().slice(0, 160);
    if (!this.providerEnabled || !providerVoiceId || !ttsText) {
      return { audioUrl: voiceProfile.previewAudioUrl || '', source: 'unavailable', traceId: randomUUID() };
    }
    try {
      const response = await fetch(`${this.h5Base}/html/tts/generateText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqId: `${ownerId}-${Date.now()}`, voiceId: providerVoiceId, ttsText }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await this.parseResponse(response);
      const audioUrl = this.extractAudioUrl(data);
      return { audioUrl, source: audioUrl ? 'soul-h5-openapi' : 'empty', raw: audioUrl ? undefined : data, traceId: randomUUID() };
    } catch (error) {
      this.logger.warn(`Soul H5 TTS preview failed: ${error instanceof Error ? error.message : error}`);
      return { audioUrl: voiceProfile.previewAudioUrl || '', source: 'fallback', traceId: randomUUID() };
    }
  }

  normalizeVoiceProfile(value: unknown, fallback: WhatifVoiceProfile): WhatifVoiceProfile {
    const raw = value && typeof value === 'object' ? value as Partial<WhatifVoiceProfile> : {};
    const voiceId = String(raw.voiceId || fallback.voiceId);
    if (raw.voiceName && raw.voiceDesc && raw.promptVoiceLock) {
      return {
        ...fallback,
        ...raw,
        voiceId,
        voiceName: String(raw.voiceName),
        voiceDesc: String(raw.voiceDesc),
        previewText: String(raw.previewText || fallback.previewText),
        promptVoiceLock: String(raw.promptVoiceLock),
        preview: raw.preview || fallback.preview,
      };
    }
    return fallback;
  }

  private providerVoiceId(voiceProfile: Partial<WhatifVoiceProfile>) {
    return String(voiceProfile.providerVoiceId || voiceProfile.voiceId || '').replace(/^soul_h5:/, '');
  }

  private mapSoulH5Role(role: SoulH5Role) {
    const providerVoiceId = String(role.voiceId || '').trim();
    const voiceName = String(role.name || '').trim();
    if (!providerVoiceId || !voiceName) return null;
    const roleLine = role.msgs?.find((msg) => Number(msg.speaker) === 0 && msg.text)?.text;
    const previewAudioUrl = role.cloneAudioUrl || role.originAudioUrl || role.msgs?.find((msg) => msg.url)?.url || '';
    const voiceDesc = String(role.description || 'Soul 真实 TTS 声线').trim();
    return {
      voiceId: `soul_h5:${providerVoiceId}`,
      provider: 'soul-h5-openapi',
      providerVoiceId,
      voiceName,
      voiceDesc,
      avatarUrl: role.avatar || '',
      previewAudioUrl: previewAudioUrl || '',
      previewText: String(roleLine || '如果这一次故事重新开始，我会认真说出自己的选择。').slice(0, 160),
      promptVoiceLock: `${voiceName}；${voiceDesc}；使用 Soul TTS voiceId=${providerVoiceId}；跨幕保持同一真实声线，不随机换音色`,
      preview: { lang: 'zh-CN', rate: 1, pitch: 1 },
    } satisfies WhatifVoiceProfile;
  }

  private async parseResponse(response: Response) {
    const text = await response.text();
    let data: AnyRecord = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { rawText: text };
    }
    if (!response.ok) throw new Error(`Soul TTS HTTP ${response.status}: ${text.slice(0, 200)}`);
    if (data.success === false || (data.code && Number(data.code) !== 10001 && Number(data.code) !== 0)) {
      throw new Error(String(data.message || data.msg || `Soul TTS business code ${data.code}`));
    }
    return data;
  }

  private extractAudioUrl(value: unknown): string {
    if (!value || typeof value !== 'object') return '';
    const record = value as AnyRecord;
    for (const key of ['audioUrl', 'url', 'cloneAudioUrl', 'originAudioUrl']) {
      if (typeof record[key] === 'string' && /^https?:\/\//.test(record[key])) return record[key];
    }
    if (Array.isArray(record.data)) {
      for (const item of record.data) {
        const url = this.extractAudioUrl(item);
        if (url) return url;
      }
    }
    if (record.data) {
      const url = this.extractAudioUrl(record.data);
      if (url) return url;
    }
    if (Array.isArray(record.tts)) {
      for (const item of record.tts) {
        const url = this.extractAudioUrl(item);
        if (url) return url;
      }
    }
    return '';
  }
}
