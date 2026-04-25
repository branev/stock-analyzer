import { Logger as NestLogger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { join } from 'node:path';
import { AllExceptionsFilter } from './api/exception-filter';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));

  // Helmet defaults plus a CSP tuned for our two committed vendor libraries.
  // - style-src 'unsafe-inline' is required by Pico CSS, which applies inline
  //   style attributes to a few form elements.
  // - script-src 'unsafe-eval' is required by Alpine.js v3, which evaluates
  //   its `x-*` directive expressions via `new Function(...)` at runtime.
  //   The CSP-friendly Alpine build (`cdn.csp.min.js`) avoids this but only
  //   supports property-access expressions, not function calls — incompatible
  //   with our `x-text="formatCurrency(...)"` patterns. We accept the looser
  //   policy as a known cost of using Alpine. No other inline scripts.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'style-src': ["'self'", "'unsafe-inline'"],
          'script-src': ["'self'", "'unsafe-eval'"],
        },
      },
    }),
  );

  // Static assets served from <repo>/public via Express's static middleware.
  // process.cwd() is reliable across `nest start` (ts-node), `node dist/main.js`,
  // and Jest — all three run from the repo root. Picking this over
  // @nestjs/serve-static avoids a lifecycle gotcha where the module's
  // onModuleInit doesn't attach middleware reliably under
  // Test.createTestingModule.
  app.useStaticAssets(join(process.cwd(), 'public'));

  app.setGlobalPrefix('api', { exclude: ['/health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get('PORT', { infer: true });
  await app.listen(port);
}

bootstrap().catch((err: unknown) => {
  NestLogger.error('Bootstrap failed', err);
  process.exit(1);
});
