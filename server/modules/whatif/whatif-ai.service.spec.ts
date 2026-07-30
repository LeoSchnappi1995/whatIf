import { WhatifAiService } from './whatif-ai.service';
import { renderPrompt } from '../../prompts/whatif-prompt-registry';

describe('WhatifAiService', () => {
  const service = new WhatifAiService() as WhatifAiService & {
    taskId(data: unknown): string;
    taskStatus(data: unknown): string;
    videoUrl(data: unknown): string;
  };

  it('renders every dynamic prompt variable', () => {
    expect(renderPrompt('Hello {{NAME}}, {{ACTION}}', { NAME: '林夏', ACTION: '递书' }))
      .toBe('Hello 林夏, 递书');
  });

  it('parses Seedance task id and status from nested responses', () => {
    const data = { data: { task_id: 'task_123', status: 'queued' } };
    expect(service.taskId(data)).toBe('task_123');
    expect(service.taskStatus(data)).toBe('queued');
  });

  it('does not mistake an input image for a generated video', () => {
    const data = { content: [{ type: 'image_url', image_url: { url: 'https://cdn.example.com/input.jpg' } }] };
    expect(service.videoUrl(data)).toBe('');
  });

  it('finds a completed video URL in official output shapes', () => {
    const data = { output: { video_url: 'https://cdn.example.com/final.mp4' } };
    expect(service.videoUrl(data)).toBe('https://cdn.example.com/final.mp4');
  });
});
