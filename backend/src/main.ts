import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp, corsOrigins } from './bootstrap.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  configureApp(app);

  // The browser frontend is served from a different origin in dev, so
  // without this the first real fetch from Vite is blocked. Supertest
  // and curl bypass CORS entirely, which is why no test catches it.
  app.enableCors({
    origin: corsOrigins(config.get<string>('CORS_ORIGINS')),
    credentials: true,
  });

  // Swagger is load-bearing (the frontend client is generated from this
  // spec) but it is *not* exposed in production: this service will
  // handle PHI, and publishing a complete map of its API surface there
  // is gratuitous exposure. Generate the spec in CI/dev instead.
  if (config.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Medbot API')
      .setDescription('Healthcare front desk / patient intake backend')
      .setVersion('0.1')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(config.get<number>('PORT') ?? 3000);
}
await bootstrap();
