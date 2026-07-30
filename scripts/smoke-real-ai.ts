import { WhatifAiService } from '../server/modules/whatif/whatif-ai.service';

async function main() {
  const ai = new WhatifAiService();
  const config = ai.configSummary();
  if (!config.text.configured || !config.image.configured || !config.video.configured) {
    throw new Error(`AI configuration incomplete: ${JSON.stringify(config)}`);
  }

  const input = {
    script: '雨夜，林夏冲进即将关闭的旧书店。江屿拉住她，把寻找多年的旧书交到她手中。',
    story: {
      title: '2056年的我们',
      setting: '2056年的上海，AI拥有独立身份，旧城区仍保留纸质书店。',
      worldview: { name: '未来平行线', stylePrompt: 'grounded cinematic animation, near-future Shanghai' },
    },
    characters: [
      { name: '林夏', description: '25岁，黑色长发，温柔坚定的原创成年女性角色' },
      { name: '江屿', description: '27岁，深色短发，温柔克制的原创成年男性角色' },
    ],
    previous: null,
  };

  const director = await ai.directScene(input);
  const world = await ai.generateWorldviewImage({
    name: '2056年的上海旧城区',
    description: '原创电影动画风格，雨夜旧书店、悬浮公共交通与纸质书共存，无人物。',
  });
  const compiled = await ai.compileSeedance({ ...input, directorPlan: director });
  const video = await ai.createVideo({
    prompt: compiled.prompt,
    copyrightSafePrompt: `${compiled.prompt}\nAll people are original fictional adults in cinematic animation.`,
  });

  let status = await ai.getVideoStatus(video.providerTaskId);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (status.videoUrl || ['failed', 'error', 'cancelled', 'canceled'].includes(status.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    status = await ai.getVideoStatus(video.providerTaskId);
  }

  process.stdout.write(JSON.stringify({
    config,
    director: {
      title: director.title,
      capacity: director.capacity,
      shotCount: director.shots.length,
      promptVersion: director.promptVersion,
    },
    image: { ok: Boolean(world.imageUrl), promptVersion: world.promptVersion },
    video: {
      taskId: video.providerTaskId,
      inputMode: video.inputMode,
      status: status.status,
      hasVideo: Boolean(status.videoUrl),
      error: status.error || '',
      promptVersion: compiled.promptVersion,
    },
  }, null, 2));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
