import 'express';
declare module 'express-serve-static-core' {
  interface Request {
    userContext?: { userId: string; phone?: string };
    __platform_data__?: Record<string, any>;
  }
}
