import { Controller, Get, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { bestTrade } from '../analysis/best-trade';
import { PriceRepository } from '../data/price.repository';
import { AnalyzeDto } from './dto/analyze.dto';
import { InvalidRangeError } from './errors';
import { mapAnalyzeResponse } from './response-mapper';
import type { AnalyzeResponse } from './response-mapper';

@Controller('analyze')
@SkipThrottle({ dataset: true })
export class AnalyzeController {
  constructor(private readonly repo: PriceRepository) {}

  @Get()
  analyze(@Query() query: AnalyzeDto): AnalyzeResponse {
    const from = new Date(query.from);
    const to = new Date(query.to);

    if (from.getTime() >= to.getTime()) {
      throw new InvalidRangeError();
    }

    const prices = this.repo.getPriceSeries(from, to);
    const trade = bestTrade(prices);
    const intervalSeconds = this.repo.getDataset().intervalSeconds;
    return mapAnalyzeResponse(from, to, intervalSeconds, prices, trade);
  }
}
