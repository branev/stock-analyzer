import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('health')
@SkipThrottle({ analyze: true, dataset: true })
export class HealthController {
  @Get()
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
