import { Controller, Get, Render, Req } from '@nestjs/common';
import type { Request } from 'express';

const BASE_PATH = (process.env.BASE_PATH || '/whatif').replace(/\/+$/, '');

@Controller()
export class ViewController {
  @Get(['/', '*'])
  @Render('index')
  async render(@Req() req: Request) {
    return { __platform__: '{}', BASE_PATH };
  }
}
