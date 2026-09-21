import { ApiProperty } from '@nestjs/swagger';
import { APPOINTMENT_STATUSES } from '../appointments.types.js';
import type { Appointment, AppointmentStatus } from '../appointments.types.js';

/**
 * Response shape for the appointment endpoints.
 *
 * Declared so the OpenAPI document carries real types: the frontend's
 * TanStack Query hooks are generated from that spec (CLAUDE.md, Global
 * setup), so an undocumented response silently loses type fidelity.
 */
export class AppointmentResponseDto implements Appointment {
  @ApiProperty({ example: '66f1a2b3c4d5e6f708091a2b' })
  id!: string;

  @ApiProperty({ example: 'PAT-0042' })
  patientId!: string;

  @ApiProperty({ example: 'DOC001' })
  doctorId!: string;

  @ApiProperty({ description: 'Clinic-local date.', example: '2026-09-21' })
  date!: string;

  @ApiProperty({ example: '14:00' })
  startTime!: string;

  @ApiProperty({ example: '14:30' })
  endTime!: string;

  @ApiProperty({ enum: APPOINTMENT_STATUSES, example: 'CONFIRMED' })
  status!: AppointmentStatus;
}
