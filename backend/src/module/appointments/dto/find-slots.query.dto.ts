import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { DATE_PATTERN, TIME_PATTERN } from '../appointments.time.js';
import type { FindSlotsQuery } from '../appointments.types.js';

/**
 * Query for GET /appointments/availability.
 *
 * A class, not the bare interface: the global ValidationPipe and Swagger
 * both need something that exists at runtime (CLAUDE.md, Building blocks).
 */
export class FindSlotsQueryDto implements FindSlotsQuery {
  @ApiProperty({
    description: 'Clinic-local date to search, "YYYY-MM-DD".',
    example: '2026-09-21',
  })
  @Matches(DATE_PATTERN, { message: 'date must be an ISO date "YYYY-MM-DD".' })
  date!: string;

  @ApiPropertyOptional({
    description: 'Restrict to one department. One of departmentId or doctorId is required.',
    example: 'DENTAL',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Restrict to one doctor.', example: 'DOC001' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  doctorId?: string;

  @ApiPropertyOptional({
    description: 'Earliest slot start, "HH:mm". Inclusive: a slot starting exactly at this time is returned.',
    example: '14:00',
  })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'after must be a time "HH:mm".' })
  after?: string;

  @ApiPropertyOptional({
    description: 'Latest slot start, "HH:mm". Exclusive: a slot starting exactly at this time is not returned.',
    example: '17:00',
  })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'before must be a time "HH:mm".' })
  before?: string;
}
