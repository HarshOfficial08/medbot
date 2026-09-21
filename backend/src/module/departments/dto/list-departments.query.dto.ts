import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Reads the raw query value off the *source* object rather than the
 * already-converted one.
 *
 * The global ValidationPipe runs with `enableImplicitConversion`, and
 * class-transformer's implicit Boolean conversion is a bare
 * `Boolean(value)` — so the string "false" would arrive here as `true`.
 * `obj` is the untouched query object, so the real value is still
 * recoverable. Anything that is neither "true" nor "false" is passed
 * through untouched for `@IsBoolean()` to reject with a 400.
 */
function rawBoolean({ obj, key }: TransformFnParams): unknown {
  const raw: unknown = (obj as Record<string, unknown>)[key];

  if (raw === undefined || raw === '') {
    return undefined;
  }
  if (raw === true || raw === 'true') {
    return true;
  }
  if (raw === false || raw === 'false') {
    return false;
  }
  return raw;
}

export class ListDepartmentsQueryDto {
  @ApiPropertyOptional({
    description: 'When true, only departments currently accepting patients.',
    example: true,
  })
  @IsOptional()
  @Transform(rawBoolean)
  @IsBoolean()
  activeOnly?: boolean;
}
