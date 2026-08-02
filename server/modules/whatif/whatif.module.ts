import { Module } from '@nestjs/common';

import { WhatifController } from './whatif.controller';
import { WhatifAiService } from './whatif-ai.service';
import { WhatifService } from './whatif.service';
import { WhatifVoiceService } from './whatif-voice.service';

@Module({
  controllers: [WhatifController],
  providers: [WhatifService, WhatifAiService, WhatifVoiceService],
})
export class WhatifModule {}
