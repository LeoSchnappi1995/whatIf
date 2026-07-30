const { WhatifAiService } = require('../dist/server/modules/whatif/whatif-ai.service.js');

async function main() {
  const ai = new WhatifAiService();
  const director = await ai.directScene({
    script: '雨夜，林夏冲进即将关闭的旧书店。江屿拉住她，把寻找多年的旧书交到她手中。',
    story: { title: '2056年的我们', setting: '2056年的上海，AI拥有独立身份，旧城区仍保留纸质书店。', worldview: { name: '未来平行线', stylePrompt: 'grounded cinematic animation' } },
    characters: [{ name: '林夏', description: '25岁，黑色长发，温柔坚定' }, { name: '江屿', description: '27岁，深色短发，温柔克制' }],
    previous: null,
  });
  process.stdout.write(JSON.stringify({ title: director.title, capacity: director.capacity, shotCount: director.shots.length, promptVersion: director.promptVersion }, null, 2));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
