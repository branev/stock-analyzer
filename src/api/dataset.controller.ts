import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PriceRepository } from '../data/price.repository';

interface DatasetResponse {
  symbol: string;
  name: string;
  currency: string;
  from: string;
  to: string;
  intervalSeconds: number;
}

@Controller('dataset')
@SkipThrottle({ analyze: true })
export class DatasetController {
  constructor(private readonly repo: PriceRepository) {}

  @Get()
  getDataset(): DatasetResponse {
    const dataset = this.repo.getDataset();
    return {
      symbol: dataset.symbol,
      name: dataset.name,
      currency: dataset.currency,
      from: dataset.from.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      to: dataset.to.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      intervalSeconds: dataset.intervalSeconds,
    };
  }
}
