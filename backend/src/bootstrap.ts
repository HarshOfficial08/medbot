import { INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * Applies the runtime configuration every instance of this app must
 * have, wherever it is created.
 *
 * Shared between `main.ts` and the e2e suites on purpose: when tests
 * build their own app they otherwise skip this, so the mandatory
 * ValidationPipe guarantees (CLAUDE.md, Global setup) would go untested
 * and e2e would quietly diverge from production behaviour.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      // An unexpected field is a hard 400, not a silently-dropped one —
      // "never trust extracted information blindly" (plan section 42),
      // enforced by the framework rather than by discipline.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
}

/** Origins allowed to call the API from a browser. */
export function corsOrigins(raw: string | undefined): string[] {
  return (raw ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
