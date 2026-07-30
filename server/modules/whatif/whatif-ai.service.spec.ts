import { WhatifAiService } from './whatif-ai.service';
import { renderPrompt } from '../../prompts/whatif-prompt-registry';

describe('WhatifAiService', () => {
  const service = new WhatifAiService() as WhatifAiService & {
    taskId(data: unknown): string;
    taskStatus(data: unknown): string;
    videoUrl(data: unknown): string;
    shouldRetryWithoutReferences(message: string): boolean;
    rejectedContentIndex(message: string): number;
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

  it('retries text-only when Seedance rejects an image format', () => {
    expect(service.shouldRetryWithoutReferences(
      'The request failed because the image format is not supported by the API.',
    )).toBe(true);
  });

  it('recognizes copyright policy violations and locates the rejected reference', () => {
    const message = "The input image 'content[2]' may be related to copyright restrictions. PolicyViolation";
    expect(service.shouldRetryWithoutReferences(message)).toBe(true);
    expect(service.rejectedContentIndex(message)).toBe(2);
  });
});

describe('WhatifAiService Seedance compiler', () => {
  it('binds numbered reference assets into both compiler input and final Seedance prompt', async () => {
    const service = new WhatifAiService();
    const textJson = jest.spyOn(service as any, 'textJson').mockResolvedValue({
      prompt: 'Create one continuous 15-second scene. Lin Xia enters the bookstore.',
      negativePrompt: 'no identity drift',
      referencePlan: [],
    });

    const result = await service.compileSeedance({
      userScript: '林夏进入书店。',
      referenceAssets: [
        { token: '@图片1', role: 'reference_image', purpose: '林夏的人物身份参考' },
        { token: '@图片2', role: 'reference_image', purpose: '旧书店的世界与场景美术参考' },
      ],
    });

    expect(textJson.mock.calls[0][0]).toContain('@图片1：林夏的人物身份参考');
    expect(textJson.mock.calls[0][0]).toContain('@图片2：旧书店的世界与场景美术参考');
    expect(result.prompt).toContain('@图片1：林夏的人物身份参考');
    expect(result.prompt).toContain('@图片2：旧书店的世界与场景美术参考');
    expect(result.promptBody).toBe('Create one continuous 15-second scene. Lin Xia enters the bookstore.');
    expect(result.textOnlyPrompt).toBe('Create one continuous 15-second scene. Lin Xia enters the bookstore.');
    expect(result.referencePlan).toEqual([
      { token: '@图片1', role: 'reference_image', purpose: '林夏的人物身份参考' },
      { token: '@图片2', role: 'reference_image', purpose: '旧书店的世界与场景美术参考' },
    ]);
    expect(result.promptVersion).toBe('seedance-compiler-v3');
  });

  it('renumbers prompt bindings when Seedance rejects one reference image', async () => {
    process.env.SEEDANCE_API_KEY = 'test-key';
    process.env.SEEDANCE_MODEL = 'test-model';
    const service = new WhatifAiService();
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: "input image 'content[1]' may be related to copyright restrictions" } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'video-task-1', status: 'queued' }),
      } as Response);

    await service.createVideo({
      prompt: '@图片1 is Lin Xia. @图片2 is Jiang Yu.',
      promptBody: '@图片1 is Lin Xia. @图片2 is Jiang Yu.',
      referenceAssets: [
        { url: 'https://example.com/linxia.png', token: '@图片1', purpose: '林夏的人物身份参考' },
        { url: 'https://example.com/jiangyu.png', token: '@图片2', purpose: '江屿的人物身份参考' },
      ],
    });

    const retryBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(retryBody.content).toHaveLength(2);
    expect(retryBody.content[0].text).toContain('@图片1：江屿的人物身份参考');
    expect(retryBody.content[0].text).toContain('@图片1 is Jiang Yu.');
    expect(retryBody.content[0].text).not.toContain('@图片2');
    expect(retryBody.content[1].image_url.url).toBe('https://example.com/jiangyu.png');

    fetchMock.mockRestore();
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.SEEDANCE_MODEL;
  });
});
