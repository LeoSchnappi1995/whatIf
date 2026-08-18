import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from './jwt.guard';

/** 可选认证：有 JWT 就填充 req.userContext，没有不拦截（兼容原 owner 回退逻辑） */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const payload = token ? verifyToken(token) : null;
    if (payload?.userId) {
      (req as any).userContext = { userId: String(payload.userId), phone: payload.phone };
    }
    next();
  }
}
