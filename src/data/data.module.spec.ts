import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { DataModule } from './data.module';
import { PriceRepository } from './price.repository';
import { validateEnv } from '../config/env.schema';

describe('DataModule (integration)', () => {
  it('provides a working PriceRepository against the committed data/acme.json', async () => {
    // Arrange — boot a tiny module graph with the same env validation the app uses.
    // DATA_FILE_PATH defaults to ./data/acme.json via the Zod schema.
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ validate: validateEnv, isGlobal: true }),
        DataModule,
      ],
    }).compile();
    await moduleRef.init();

    const repo = moduleRef.get(PriceRepository);

    // Act
    const dataset = repo.getDataset();
    const single = repo.getPriceSeries(dataset.from, dataset.from);

    // Assert
    expect(dataset.symbol).toBe('ACME');
    expect(dataset.intervalSeconds).toBe(1);
    expect(dataset.from.getTime()).toBeLessThan(dataset.to.getTime());
    expect(single).toHaveLength(1);

    await moduleRef.close();
  });
});
