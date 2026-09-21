import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * A boolean query parameter that actually respects `false`.
 *
 * The global ValidationPipe runs with `enableImplicitConversion`, and
 * class-transformer's boolean conversion is a bare `Boolean(value)` — so
 * the string `"false"` converts to `true`. A filter like
 * `?bookableOnly=false` would silently mean the opposite of what the
 * caller asked for, which on this system means offering appointments
 * with doctors who are on leave.
 *
 * This reads the raw value off the untouched source object before the
 * pipe can coerce it, accepts only the exact strings `true`/`false`
 * (plus real booleans), and lets `@IsBoolean()` reject anything else with
 * a 400 rather than guessing.
 */
export function BooleanQuery(): PropertyDecorator {
  return applyDecorators(
    Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
      const raw = obj?.[key];
      if (raw === undefined || raw === '') return undefined;
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      // Anything else stays as-is so @IsBoolean() produces a 400.
      return raw;
    }),
    IsOptional(),
    IsBoolean(),
  );
}
