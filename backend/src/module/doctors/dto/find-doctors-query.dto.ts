import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { DOCTOR_STATUSES } from '../doctors.types.js';
import type { DoctorStatus, FindDoctorsQuery } from '../doctors.types.js';

/**
 * Reads a query-string value as a boolean.
 *
 * Deliberately explicit rather than relying on the global
 * ValidationPipe's `enableImplicitConversion`: a query string is always
 * text, and a naive `Boolean('false')` is `true` — which would quietly
 * turn `?bookableOnly=false` into the opposite of what was asked for.
 * Anything that is not a recognised boolean is passed through untouched
 * so `@IsBoolean()` rejects it with a 400 instead of guessing.
 */
function parseBoolean(value: unknown): unknown {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
}

export class FindDoctorsQueryDto implements FindDoctorsQuery {
  @ApiPropertyOptional({
    description: 'Restrict to one department.',
    example: 'DENTAL',
  })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ enum: DOCTOR_STATUSES, example: 'ACTIVE' })
  @IsOptional()
  @IsIn(DOCTOR_STATUSES)
  status?: DoctorStatus;

  @ApiPropertyOptional({
    description:
      'Only doctors who can actually be booked right now. This is what stops the agent offering a slot with an ON_LEAVE doctor.',
    example: true,
  })
  // Reads the *raw* source value rather than the already-converted one,
  // so the pipe's implicit conversion can never get a say in it.
  @Transform(({ obj, key }) => parseBoolean((obj as Record<string, unknown>)[key]))
  @IsOptional()
  @IsBoolean()
  bookableOnly?: boolean;
}
