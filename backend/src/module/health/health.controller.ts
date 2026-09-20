import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  MongooseHealthIndicator,
} from '@nestjs/terminus';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Liveness/readiness check, including real database connectivity.',
  })
  check(): Promise<HealthCheckResult> {
    // Pings the actual Mongo connection — a health check that only
    // proves "the process is up" is worth very little.
    return this.health.check([() => this.mongoose.pingCheck('mongodb')]);
  }
}
