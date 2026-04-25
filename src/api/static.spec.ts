/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument --
 * Supertest's `Response.body` is typed `any` and `request(server)` expects an
 * `App` it can't infer from `INestApplication.getHttpServer()`. The assertions
 * here are validated at runtime via `.expect(status)` and explicit body shape
 * checks; type ceremony to silence the lint would not add safety.
 */
import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('Static / API route precedence', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const expressApp = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
    });
    expressApp.useLogger(false);
    expressApp.useStaticAssets(join(process.cwd(), 'public'));
    expressApp.setGlobalPrefix('api', { exclude: ['/health'] });
    await expressApp.init();
    app = expressApp;
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the static index page at /', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<title>Stock Price Analyzer</title>');
  });

  it('routes /api/dataset to the controller, not the static module', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dataset')
      .expect(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.symbol).toBe('ACME');
  });

  it('routes /health to the controller, not the static module', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
