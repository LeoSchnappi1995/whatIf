export interface WhatifVoiceProfile {
  voiceId: string;
  voiceName: string;
  voiceDesc: string;
  previewText: string;
  promptVoiceLock: string;
  preview: {
    lang: string;
    rate: number;
    pitch: number;
  };
}

export const WHATIF_VOICE_PRESETS: WhatifVoiceProfile[] = [
  {
    voiceId: 'whatif_warm_clear_female',
    voiceName: '温柔清亮女声',
    voiceDesc: '年轻、清澈、情绪细腻，适合都市爱情和温柔角色。',
    previewText: '我一直记得那个雨夜，也记得你转身看向我的样子。',
    promptVoiceLock: 'young warm clear female voice, gentle and emotionally detailed, medium speaking pace, natural Mandarin, stable across every scene',
    preview: { lang: 'zh-CN', rate: 0.95, pitch: 1.16 },
  },
  {
    voiceId: 'whatif_calm_low_female',
    voiceName: '冷静低柔女声',
    voiceDesc: '成熟、克制、低柔，适合理性、清醒、有距离感的角色。',
    previewText: '先别急着解释，我想听你把真正的原因说完。',
    promptVoiceLock: 'calm low female voice, mature and restrained, soft but decisive, natural Mandarin, stable across every scene',
    preview: { lang: 'zh-CN', rate: 0.9, pitch: 0.92 },
  },
  {
    voiceId: 'whatif_steady_low_male',
    voiceName: '沉稳低音男声',
    voiceDesc: '稳定、低沉、可靠，适合成熟男性和保护型角色。',
    previewText: '别怕，我会在这里等你，直到这一切都结束。',
    promptVoiceLock: 'steady low male voice, reliable and grounded, calm emotional delivery, natural Mandarin, stable across every scene',
    preview: { lang: 'zh-CN', rate: 0.88, pitch: 0.82 },
  },
  {
    voiceId: 'whatif_bright_young_male',
    voiceName: '少年感男声',
    voiceDesc: '明亮、直接、带一点冲劲，适合青春感和主动型角色。',
    previewText: '如果这次再错过，我真的会后悔很久很久。',
    promptVoiceLock: 'bright young male voice, sincere and energetic, slightly urgent emotional tone, natural Mandarin, stable across every scene',
    preview: { lang: 'zh-CN', rate: 1.02, pitch: 1.06 },
  },
  {
    voiceId: 'whatif_lively_female',
    voiceName: '元气轻快女声',
    voiceDesc: '活泼、轻快、反应鲜明，适合直率、明亮的角色。',
    previewText: '你看，我就说我们一定还会再见面的吧。',
    promptVoiceLock: 'lively bright female voice, quick and expressive, warm upbeat emotion, natural Mandarin, stable across every scene',
    preview: { lang: 'zh-CN', rate: 1.06, pitch: 1.22 },
  },
  {
    voiceId: 'whatif_cinematic_narrator',
    voiceName: '电影旁白声',
    voiceDesc: '中性、沉浸、叙事感强，适合作为旁白或特殊角色声线。',
    previewText: '在另一个时间节点，他们终于看见了命运留下的答案。',
    promptVoiceLock: 'cinematic neutral narrator voice, immersive and composed, clear natural Mandarin, stable across every scene',
    preview: { lang: 'zh-CN', rate: 0.86, pitch: 0.98 },
  },
];

export const DEFAULT_WHATIF_VOICE_ID = 'whatif_warm_clear_female';

export function findWhatifVoicePreset(voiceId?: string | null) {
  return WHATIF_VOICE_PRESETS.find((item) => item.voiceId === voiceId) || WHATIF_VOICE_PRESETS[0]!;
}
