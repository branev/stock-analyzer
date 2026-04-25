import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { FilePriceRepository } from './file-price.repository';
import { PriceRepository } from './price.repository';

@Module({
  providers: [
    {
      provide: PriceRepository,
      useFactory: (config: ConfigService<Env, true>): PriceRepository =>
        new FilePriceRepository(config.get('DATA_FILE_PATH', { infer: true })),
      inject: [ConfigService],
    },
  ],
  exports: [PriceRepository],
})
export class DataModule {}
