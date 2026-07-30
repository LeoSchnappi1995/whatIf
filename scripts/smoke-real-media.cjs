const { WhatifAiService } = require('../dist/server/modules/whatif/whatif-ai.service.js');

async function main() {
  const ai = new WhatifAiService();
  const world = await ai.generateWorldviewImage({
    name: '2056年的上海旧城区',
    description: '原创电影动画风格，雨夜旧书店、悬浮公共交通与纸质书共存，无人物、无文字。',
  });
  const prompt = 'Create one complete 15-second 9:16 cinematic animated story event in an original fictional 2056 Shanghai bookstore. 0-4s: an adult woman rushes through the closing door from heavy rain. 4-9s: an adult man catches her sleeve and stops her. 9-15s: he gives her a worn old book; she takes it and silently realizes he remembered. Natural continuous action, motivated camera movement, stable original fictional identities, warm bookstore light against blue rain, native rain and paper sounds, restrained piano, no subtitles, no text, no collage, no slideshow.';
  const video = await ai.createVideo({ prompt, copyrightSafePrompt: `${prompt} Clearly stylized original animation; no real person.` });
  let status = await ai.getVideoStatus(video.providerTaskId);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (status.videoUrl || ['failed', 'error', 'cancelled', 'canceled'].includes(status.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 10000));
    status = await ai.getVideoStatus(video.providerTaskId);
  }
  process.stdout.write(JSON.stringify({ image: { ok: Boolean(world.imageUrl), promptVersion: world.promptVersion }, video: { taskId: video.providerTaskId, inputMode: video.inputMode, status: status.status, hasVideo: Boolean(status.videoUrl), error: status.error || '' } }, null, 2));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
