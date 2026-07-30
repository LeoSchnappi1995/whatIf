const { WhatifAiService } = require('../dist/server/modules/whatif/whatif-ai.service.js');

async function main() {
  const ai = new WhatifAiService();
  const compiled = await ai.compileSeedance({
    story: { title: '2056年的我们', setting: '2056年上海雨夜旧书店' },
    characters: [{ name: '林夏', description: '原创成年女性角色，黑色长发' }, { name: '江屿', description: '原创成年男性角色，深色短发' }],
    userScript: '林夏冲进书店，江屿拉住她并递出旧书。',
    directorPlan: {
      visual: { looks: { 林夏: '深蓝防雨外套', 江屿: '卡其工装外套' }, scene: '未来上海旧书店，外部大雨，室内暖光', props: '一本磨损旧书', continuity: '服装、雨水和旧书状态不变' },
      audio: { ambience: '雨声与门轴声', music: '递书时一个钢琴升调', mix: '对白优先' },
      shots: [
        { time: '0-4秒', stateIn: '店门将关', action: '林夏冲入', stateOut: '林夏站在门内', camera: '中景跟随' },
        { time: '4-9秒', stateIn: '林夏站在门内', action: '江屿拉住她衣袖', stateOut: '两人停下', camera: '中近景侧拍' },
        { time: '9-15秒', stateIn: '两人停下', action: '江屿递出旧书，林夏接住', stateOut: '旧书落入林夏手中', camera: '手部特写转表情' },
      ],
    },
  });
  process.stdout.write(JSON.stringify({ ok: Boolean(compiled.prompt), negativePrompt: Boolean(compiled.negativePrompt), promptVersion: compiled.promptVersion }, null, 2));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
