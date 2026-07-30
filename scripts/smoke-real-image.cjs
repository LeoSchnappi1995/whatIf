const { WhatifAiService } = require('../dist/server/modules/whatif/whatif-ai.service.js');

async function main() {
  const ai = new WhatifAiService();
  const world = await ai.generateWorldviewImage({
    name: '2056年的上海旧城区',
    description: '原创电影动画风格，雨夜旧书店、悬浮公共交通与纸质书共存，无人物、无文字。',
  });
  process.stdout.write(JSON.stringify({ ok: Boolean(world.imageUrl), promptVersion: world.promptVersion, traceId: world.traceId }, null, 2));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
