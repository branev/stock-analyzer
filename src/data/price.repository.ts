export interface DatasetMetadata {
  symbol: string;
  name: string;
  currency: string;
  from: Date;
  to: Date;
  intervalSeconds: number;
}

export class OutOfBoundsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutOfBoundsError';
  }
}

export abstract class PriceRepository {
  abstract getDataset(): DatasetMetadata;
  abstract getPriceSeries(from: Date, to: Date): readonly number[];
}
