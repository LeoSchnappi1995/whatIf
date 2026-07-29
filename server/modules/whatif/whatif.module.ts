import { Module } from '@nestjs/common';

import { WhatifController } from './whatif.controller';
import { WhatifService } from './whatif.service';

@Module({
  controllers: [WhatifController],
  providers: [WhatifService],
})
export class WhatifModule {}
