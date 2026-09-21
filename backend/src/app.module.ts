import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_FILTER } from '@nestjs/core';
import Joi from 'joi';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { DatabaseModule } from './infra/database/database.module.js';
import { AuditModule } from './infra/audit/audit.module.js';
import { HealthModule } from './module/health/health.module.js';
import { DepartmentsModule } from './module/departments/departments.module.js';
import { DoctorsModule } from './module/doctors/doctors.module.js';
import { SchedulesModule } from './module/schedules/schedules.module.js';
import { PatientsModule } from './module/patients/patients.module.js';
import { AppointmentsModule } from './module/appointments/appointments.module.js';
import { IntakeModule } from './module/intake/intake.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Every env var the app reads is declared here, so a missing or
      // malformed one fails at boot rather than on the first request
      // that happens to need it (CLAUDE.md, Global setup).
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),
        PORT: Joi.number().default(3000),
        // Comma-separated list of browser origins allowed to call the API.
        CORS_ORIGINS: Joi.string().optional(),
        MONGODB_URI: Joi.string()
          .uri({ scheme: ['mongodb', 'mongodb+srv'] })
          .required(),
      }),
    }),
    // In-process event bus. Deliberately the same shape a broker message
    // would take, so extracting a module into its own service later is
    // mechanical (see the architecture rules in the build plan).
    EventEmitterModule.forRoot(),
    DatabaseModule,
    AuditModule,
    HealthModule,
    DepartmentsModule,
    DoctorsModule,
    SchedulesModule,
    PatientsModule,
    AppointmentsModule,
    IntakeModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Registered via the APP_FILTER token rather than app.useGlobalFilters()
    // so it can inject dependencies and be overridden in tests.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // '*splat' rather than '*': Express 5 (NestJS 12's default) uses
    // path-to-regexp v8, where a bare '*' is no longer a valid pattern.
    consumer.apply(RequestIdMiddleware).forRoutes('*splat');
  }
}
