import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { JwtGuard } from './jwt.guard';

@Module({
  controllers: [AuthController],
  providers: [JwtGuard],
  exports: [JwtGuard],
})
export class AuthModule {}
