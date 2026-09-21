import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { INTAKE_STATUSES } from '../intake.types.js';
import type { IntakeStatus } from '../intake.types.js';

/**
 * Response shapes exist as classes purely so the OpenAPI document carries
 * real types: the frontend's typed client is generated from that spec
 * (CLAUDE.md, Global setup), and an interface is erased before Swagger
 * can see it. Services still return the plain `IntakeSession` contract;
 * these are structurally the same thing.
 */
export class TranscriptTurnResponseDto {
  @ApiProperty({ enum: ['patient', 'agent'] })
  speaker!: 'patient' | 'agent';

  @ApiProperty()
  text!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  at!: Date;
}

export class AppointmentPreferenceResponseDto {
  @ApiPropertyOptional()
  preferredDoctorId?: string;

  @ApiPropertyOptional({ example: '2026-10-02' })
  preferredDate?: string;

  @ApiPropertyOptional({ example: 'evening' })
  preferredTime?: string;

  @ApiPropertyOptional({ example: '18:00' })
  earliestTime?: string;

  @ApiPropertyOptional({ example: '20:30' })
  latestTime?: string;
}

export class IntakeSessionResponseDto {
  @ApiProperty({ description: 'Database id of the intake session.' })
  id!: string;

  @ApiProperty({ example: 'SESSION-4f9c1b' })
  sessionId!: string;

  @ApiPropertyOptional({ description: 'Set once the patient has been identified.' })
  patientId?: string;

  @ApiPropertyOptional()
  intent?: string;

  @ApiPropertyOptional({ example: 'DENTAL' })
  departmentId?: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Only the answers the patient actually gave; nothing is defaulted.',
  })
  fields!: Record<string, string | number | boolean | string[]>;

  @ApiProperty({ type: AppointmentPreferenceResponseDto })
  preference!: AppointmentPreferenceResponseDto;

  @ApiProperty({ enum: INTAKE_STATUSES })
  status!: IntakeStatus;

  @ApiProperty({ type: [TranscriptTurnResponseDto] })
  transcript!: TranscriptTurnResponseDto[];
}
