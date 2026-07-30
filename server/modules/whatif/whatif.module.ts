import { Module } from '@nestjs/common';

import { WhatifController } from './whatif.controller';
import { WhatifAiService } from './whatif-ai.service';
import { WhatifService } from './whatif.service';

@Module({
  controllers: [WhatifController],
  providers: [WhatifService, WhatifAiService],
})
export class WhatifModule {}
