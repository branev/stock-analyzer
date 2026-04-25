import * as fs from 'node:fs';
import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  DatasetMetadata,
  OutOfBoundsError,
  PriceRepository,
} from './price.repository';

interface LoadedState {
  metadata: DatasetMetadata;
  startTimeMs: number;
  intervalMs: number;
  prices: readonly number[];
}

@Injectable()
export class FilePriceRepository
  extends PriceRepository
  implements OnModuleInit
{
  private loaded!: LoadedState;

  constructor(private readonly filePath: string) {
    super();
  }

  onModuleInit(): void {
    if (!fs.existsSync(this.filePath)) {
      this.fail('does not exist');
    }
    const parsed = this.parseFile();
    this.assertValidIntervalSeconds(parsed.intervalSeconds);
    this.assertValidPrices(parsed.prices);

    const intervalSeconds = parsed.intervalSeconds as number;
    const prices = parsed.prices as readonly number[];
    const startTimeMs = new Date(parsed.startTime as string).getTime();
    const intervalMs = intervalSeconds * 1000;
    const lastTickMs = startTimeMs + (prices.length - 1) * intervalMs;

    this.loaded = {
      metadata: {
        symbol: parsed.symbol as string,
        name: parsed.name as string,
        currency: parsed.currency as string,
        from: new Date(startTimeMs),
        to: new Date(lastTickMs),
        intervalSeconds,
      },
      startTimeMs,
      intervalMs,
      prices,
    };
  }

  getDataset(): DatasetMetadata {
    return this.loaded.metadata;
  }

  getPriceSeries(from: Date, to: Date): readonly number[] {
    const { startTimeMs, intervalMs, prices } = this.loaded;
    const maxOffsetMs = (prices.length - 1) * intervalMs;
    const fromOffsetMs = from.getTime() - startTimeMs;
    const toOffsetMs = to.getTime() - startTimeMs;

    if (
      fromOffsetMs < 0 ||
      toOffsetMs < 0 ||
      fromOffsetMs > maxOffsetMs ||
      toOffsetMs > maxOffsetMs
    ) {
      throw new OutOfBoundsError(
        `Window [${from.toISOString()}, ${to.toISOString()}] is outside the dataset`,
      );
    }
    if (fromOffsetMs % intervalMs !== 0 || toOffsetMs % intervalMs !== 0) {
      throw new OutOfBoundsError(
        `Window [${from.toISOString()}, ${to.toISOString()}] is misaligned to the tick grid (intervalSeconds = ${(intervalMs / 1000).toString()})`,
      );
    }

    const fromIdx = fromOffsetMs / intervalMs;
    const toIdx = toOffsetMs / intervalMs;
    return prices.slice(fromIdx, toIdx + 1);
  }

  private fail(detail: string): never {
    throw new Error(`Data file ${this.filePath}: ${detail}`);
  }

  private parseFile(): Record<string, unknown> {
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.fail(`is not valid JSON (${message})`);
    }
  }

  private assertValidIntervalSeconds(value: unknown): void {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      this.fail(
        `invalid intervalSeconds (must be a positive integer, got ${String(value)})`,
      );
    }
  }

  private assertValidPrices(value: unknown): void {
    if (!Array.isArray(value) || value.length === 0) {
      this.fail('invalid prices (must be a non-empty array)');
    }
    for (let i = 0; i < value.length; i++) {
      const entry: unknown = value[i];
      if (typeof entry !== 'number' || !Number.isFinite(entry)) {
        this.fail(
          `invalid prices entry at index ${i.toString()}: not a finite number (${String(entry)})`,
        );
      }
    }
  }
}
