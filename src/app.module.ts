import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AnalyzeController } from './api/analyze.controller';
import { DatasetController } from './api/dataset.controller';
import { HealthController } from './api/health.controller';
import { validateEnv } from './config/env.schema';
import { DataModule } from './data/data.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate: validateEnv,
      isGlobal: true,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level:
          process.env.NODE_ENV === 'test'
            ? 'silent'
            : (process.env.LOG_LEVEL ?? 'info'),
        autoLogging: true,
      },
    }),
    ThrottlerModule.forRoot([
      { name: 'analyze', limit: 60, ttl: 60_000 },
      { name: 'dataset', limit: 120, ttl: 60_000 },
    ]),
    DataModule,
  ],
  controllers: [DatasetController, AnalyzeController, HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
