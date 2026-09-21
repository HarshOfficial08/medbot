import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { DATE_PATTERN, TIME_PATTERN } from '../appointments.time.js';
import type { BookAppointmentRequest } from '../appointments.types.js';

/** Body for POST /appointments — a COMMIT-tier action (plan section 13). */
export class BookAppointmentDto implements BookAppointmentRequest {
  @ApiProperty({ example: 'PAT-0042' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  patientId!: string;

  @ApiProperty({ example: 'DOC001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  doctorId!: string;

  @ApiProperty({ description: 'Clinic-local date, "YYYY-MM-DD".', example: '2026-09-21' })
  @Matches(DATE_PATTERN, { message: 'date must be an ISO date "YYYY-MM-DD".' })
  date!: string;

  @ApiProperty({ description: 'Slot start, "HH:mm".', example: '14:00' })
  @Matches(TIME_PATTERN, { message: 'startTime must be a time "HH:mm".' })
  startTime!: string;

  @ApiProperty({
    description:
      'Must be true, and must come from a real patient confirmation turn. Verified server-side; the agent asserting it is not enough.',
    example: true,
  })
  // Read off the *raw* body rather than the transformed value: the global
  // ValidationPipe runs with `enableImplicitConversion`, under which
  // `Boolean("false")` is `true` — a patient's refusal would arrive here as
  // a confirmation. Only a real `true` (or the string "true" a form-encoded
  // client would send) counts; everything else stays false and is refused
  // by the service with a 403.
  @Transform(({ obj }: { obj: Record<string, unknown> }) =>
    obj.confirmed === true || obj.confirmed === 'true',
  )
  @IsBoolean()
  confirmed!: boolean;

  @ApiPropertyOptional({
    description: 'Retry-safe key. Re-sending the same key returns the original appointment instead of booking a second one.',
    example: 'session-abc-booking-1',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey?: string;
}
