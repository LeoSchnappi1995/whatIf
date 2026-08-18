import { Body, Controller, Get, HttpException, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { Request } from 'express';
import { ObjectId } from 'mongodb';
import { MONGO, type WhatifMongo } from '../mongo/mongo.module';
import { hashPassword, verifyPassword } from './password';
import { JwtGuard, signToken } from './jwt.guard';

const PHONE_RE = /^1[3-9]\d{9}$/;

@Controller()
export class AuthController {
  constructor(@Inject(MONGO) private readonly mongo: WhatifMongo) {}

  /** 登录/注册一体：复用记账账号（ai_jizhang.users） */
  @Post('api/auth/login')
  async login(@Body() body: Record<string, unknown>) {
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    if (!PHONE_RE.test(phone)) throw new HttpException('手机号格式不对', HttpStatus.BAD_REQUEST);
    if (password.length < 6) throw new HttpException('密码至少 6 位', HttpStatus.BAD_REQUEST);

    let user = (await this.mongo.users.findOne({ phone })) as any;
    if (!user) {
      // 复用记账注册逻辑：自动注册
      const doc = {
        _id: new ObjectId(),
        phone,
        nickname: '账友' + phone.slice(-4),
        settings: { categoryLevel: null, autoCreateCategory: true },
        passwordHash: hashPassword(password),
        createdAt: new Date(),
      };
      await this.mongo.users.insertOne(doc);
      user = doc;
    } else {
      if (!user.passwordHash) {
        throw new HttpException('该账号还没设置密码，请先在记账 App 设置', HttpStatus.UNAUTHORIZED);
      }
      if (!verifyPassword(password, user.passwordHash)) {
        throw new HttpException('密码不对', HttpStatus.UNAUTHORIZED);
      }
    }
    const token = signToken({ userId: String(user._id), phone });
    return { ok: true, token, phone, nickname: user.nickname || user.phone };
  }

  @UseGuards(JwtGuard)
  @Get('api/auth/me')
  async me(@Req() req: Request) {
    const userId = (req as any).userContext?.userId as string;
    const user = await this.mongo.users.findOne({ _id: new ObjectId(userId) });
    if (!user) throw new HttpException('用户不存在', HttpStatus.UNAUTHORIZED);
    return { ok: true, user: { id: String(user._id), phone: user.phone, nickname: user.nickname } };
  }
}
