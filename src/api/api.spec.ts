/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument --
 * Supertest's `Response.body` is typed `any` and `request(server)` expects an
 * `App` it can't infer from `INestApplication.getHttpServer()`. The assertions
 * here are validated at runtime via `.expect(status)` and explicit body shape
 * checks; type ceremony to silence the lint would not add safety. Per
 * CLAUDE.md, "no any unless escaped with a comment" — this is the comment.
 */
import {
  INestApplication,
  ValidationPipe,
  type ModuleMetadata,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  ThrottlerGuard,
  ThrottlerModule,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { validateEnv } from '../config/env.schema';
import { DataModule } from '../data/data.module';
import { OutOfBoundsError, PriceRepository } from '../data/price.repository';
import { AnalyzeController } from './analyze.controller';
import { DatasetController } from './dataset.controller';
import { DataUnavailableError } from './errors';
import { AllExceptionsFilter } from './exception-filter';
import { HealthController } from './health.controller';

const SILENT_LOGGER = LoggerModule.forRoot({ pinoHttp: { level: 'silent' } });

async function bootApp(
  overrides: Partial<ModuleMetadata> = {},
  throttlerLimits: ThrottlerModuleOptions = [
    { name: 'analyze', limit: 60, ttl: 60_000 },
    { name: 'dataset', limit: 120, ttl: 60_000 },
  ],
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ validate: validateEnv, isGlobal: true }),
      SILENT_LOGGER,
      ThrottlerModule.forRoot(throttlerLimits),
      DataModule,
      ...(overrides.imports ?? []),
    ],
    controllers: [
      DatasetController,
      AnalyzeController,
      HealthController,
      ...(overrides.controllers ?? []),
    ],
    providers: [
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      ...(overrides.providers ?? []),
    ],
  }).compile();

  const app = moduleRef.createNestApplication({ bufferLogs: true });
  app.useLogger(false);
  app.setGlobalPrefix('api', { exclude: ['/health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}

describe('API integration', () => {
  describe('happy paths', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await bootApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /api/dataset returns the metadata for the committed dataset', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dataset')
        .expect(200);

      expect(res.body).toEqual({
        symbol: 'ACME',
        name: 'Acme Corporation',
        currency: 'USD',
        from: '2026-04-22T09:30:00Z',
        to: '2026-04-22T15:59:59Z',
        intervalSeconds: 1,
      });
    });

    it('GET /api/analyze returns the buy/sell pair with prices rounded to two decimals', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/analyze')
        .query({
          from: '2026-04-22T09:30:00Z',
          to: '2026-04-22T15:59:59Z',
        })
        .expect(200);

      expect(res.body.window).toEqual({
        from: '2026-04-22T09:30:00Z',
        to: '2026-04-22T15:59:59Z',
      });
      expect(res.body.buy.time).toBe('2026-04-22T09:30:13Z');
      expect(res.body.sell.time).toBe('2026-04-22T11:39:22Z');
      expect(res.body.buy.price).toBeCloseTo(107.89, 2);
      expect(res.body.sell.price).toBeCloseTo(129.43, 2);
      expect(res.body.profitPerShare).toBeCloseTo(21.54, 2);
      expect(typeof res.body.buy.price).toBe('number');
      expect(typeof res.body.sell.price).toBe('number');
      expect(typeof res.body.profitPerShare).toBe('number');
    });

    it('GET /api/analyze returns null buy/sell/profitPerShare when no profitable trade exists in the window', async () => {
      const flatRepo: Pick<PriceRepository, 'getDataset' | 'getPriceSeries'> = {
        getDataset: () => ({
          symbol: 'ACME',
          name: 'Acme Corporation',
          currency: 'USD',
          from: new Date('2026-04-22T09:30:00Z'),
          to: new Date('2026-04-22T15:59:59Z'),
          intervalSeconds: 1,
        }),
        getPriceSeries: () => [10, 10, 10, 10, 10],
      };
      const flatApp = await bootFlatApp(flatRepo);
      const res = await request(flatApp.getHttpServer())
        .get('/api/analyze')
        .query({
          from: '2026-04-22T10:00:00Z',
          to: '2026-04-22T10:00:04Z',
        })
        .expect(200);

      expect(res.body).toEqual({
        window: {
          from: '2026-04-22T10:00:00Z',
          to: '2026-04-22T10:00:04Z',
        },
        buy: null,
        sell: null,
        profitPerShare: null,
      });
      await flatApp.close();
    });
  });

  describe('error paths', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await bootApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('rejects sub-second precision in from with INVALID_TIMESTAMP', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/analyze')
        .query({
          from: '2026-04-22T09:30:00.500Z',
          to: '2026-04-22T16:00:00Z',
        })
        .expect(400);
      expect(res.body.code).toBe('INVALID_TIMESTAMP');
      expect(res.body.statusCode).toBe(400);
    });

    it('rejects a missing from with INVALID_TIMESTAMP', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/analyze')
        .query({ to: '2026-04-22T16:00:00Z' })
        .expect(400);
      expect(res.body.code).toBe('INVALID_TIMESTAMP');
    });

    it('rejects a malformed from with INVALID_TIMESTAMP', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/analyze')
        .query({ from: 'not-a-date', to: '2026-04-22T16:00:00Z' })
        .expect(400);
      expect(res.body.code).toBe('INVALID_TIMESTAMP');
    });

    it('rejects from === to with INVALID_RANGE', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/analyze')
        .query({
          from: '2026-04-22T10:00:00Z',
          to: '2026-04-22T10:00:00Z',
        })
        .expect(400);
      expect(res.body.code).toBe('INVALID_RANGE');
    });

    it('rejects from > to with INVALID_RANGE', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/analyze')
        .query({
          from: '2026-04-22T11:00:00Z',
          to: '2026-04-22T10:00:00Z',
        })
        .expect(400);
      expect(res.body.code).toBe('INVALID_RANGE');
    });

    it('rejects a window with from before the dataset start with OUT_OF_BOUNDS', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/analyze')
        .query({
          from: '2026-04-22T09:00:00Z',
          to: '2026-04-22T10:00:00Z',
        })
        .expect(400);
      expect(res.body.code).toBe('OUT_OF_BOUNDS');
    });

    it('rejects a window with to after the dataset end with OUT_OF_BOUNDS', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/analyze')
        .query({
          from: '2026-04-22T15:00:00Z',
          to: '2026-04-22T17:00:00Z',
        })
        .expect(400);
      expect(res.body.code).toBe('OUT_OF_BOUNDS');
    });

    it('maps DataUnavailableError to a 500 envelope with code DATA_UNAVAILABLE', async () => {
      const failingRepo: Pick<
        PriceRepository,
        'getDataset' | 'getPriceSeries'
      > = {
        getDataset: () => ({
          symbol: 'ACME',
          name: 'Acme Corporation',
          currency: 'USD',
          from: new Date('2026-04-22T09:30:00Z'),
          to: new Date('2026-04-22T15:59:59Z'),
          intervalSeconds: 1,
        }),
        getPriceSeries: () => {
          throw new DataUnavailableError('simulated runtime corruption');
        },
      };
      const failingApp = await bootFlatApp(failingRepo);
      const res = await request(failingApp.getHttpServer())
        .get('/api/analyze')
        .query({
          from: '2026-04-22T10:00:00Z',
          to: '2026-04-22T11:00:00Z',
        })
        .expect(500);
      expect(res.body.code).toBe('DATA_UNAVAILABLE');
      expect(res.body.statusCode).toBe(500);
      await failingApp.close();
    });

    it('maps an unexpected exception to a 500 envelope with code INTERNAL_ERROR and does not leak the original message or stack trace', async () => {
      const failingRepo: Pick<
        PriceRepository,
        'getDataset' | 'getPriceSeries'
      > = {
        getDataset: () => ({
          symbol: 'ACME',
          name: 'Acme Corporation',
          currency: 'USD',
          from: new Date('2026-04-22T09:30:00Z'),
          to: new Date('2026-04-22T15:59:59Z'),
          intervalSeconds: 1,
        }),
        getPriceSeries: () => {
          throw new Error('boom-secret-internal-detail');
        },
      };
      const failingApp = await bootFlatApp(failingRepo);
      const res = await request(failingApp.getHttpServer())
        .get('/api/analyze')
        .query({
          from: '2026-04-22T10:00:00Z',
          to: '2026-04-22T11:00:00Z',
        })
        .expect(500);
      expect(res.body.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(res.body)).not.toContain(
        'boom-secret-internal-detail',
      );
      expect(JSON.stringify(res.body)).not.toContain('at ');
      await failingApp.close();
    });
  });

  describe('wiring sanity', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await bootApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 404 for /dataset without the /api prefix', async () => {
      await request(app.getHttpServer()).get('/dataset').expect(404);
    });

    it('returns 404 for /api/health (health is excluded from the global prefix)', async () => {
      await request(app.getHttpServer()).get('/api/health').expect(404);
    });

    it('returns 200 from /health on the unprefixed path', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('throttler', () => {
    it('returns 429 when /api/analyze exceeds its rate limit', async () => {
      const limitedApp = await bootApp({}, [
        { name: 'analyze', limit: 3, ttl: 60_000 },
        { name: 'dataset', limit: 120, ttl: 60_000 },
      ]);
      const baseQuery = {
        from: '2026-04-22T09:30:00Z',
        to: '2026-04-22T10:00:00Z',
      };

      for (let i = 0; i < 3; i++) {
        await request(limitedApp.getHttpServer())
          .get('/api/analyze')
          .query(baseQuery)
          .expect(200);
      }
      await request(limitedApp.getHttpServer())
        .get('/api/analyze')
        .query(baseQuery)
        .expect(429);
      // Retry-After header is not asserted: that's @nestjs/throttler's
      // internal behaviour, not our contract. The 429 status is what we
      // promise.
      await limitedApp.close();
    });

    it('does not throttle /health regardless of request volume', async () => {
      const limitedApp = await bootApp({}, [
        { name: 'analyze', limit: 1, ttl: 60_000 },
        { name: 'dataset', limit: 1, ttl: 60_000 },
      ]);
      for (let i = 0; i < 10; i++) {
        await request(limitedApp.getHttpServer()).get('/health').expect(200);
      }
      await limitedApp.close();
    });
  });
});

async function bootFlatApp(
  repo: Pick<PriceRepository, 'getDataset' | 'getPriceSeries'>,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ validate: validateEnv, isGlobal: true }),
      SILENT_LOGGER,
      ThrottlerModule.forRoot([
        { name: 'analyze', limit: 60, ttl: 60_000 },
        { name: 'dataset', limit: 120, ttl: 60_000 },
      ]),
    ],
    controllers: [DatasetController, AnalyzeController, HealthController],
    providers: [
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: PriceRepository, useValue: repo },
    ],
  }).compile();

  const app = moduleRef.createNestApplication({ bufferLogs: true });
  app.useLogger(false);
  app.setGlobalPrefix('api', { exclude: ['/health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}

// Suppress unused-import warning for OutOfBoundsError (used implicitly via the
// real repository in OUT_OF_BOUNDS tests; importing the type keeps the test
// file's intent explicit).
void OutOfBoundsError;
