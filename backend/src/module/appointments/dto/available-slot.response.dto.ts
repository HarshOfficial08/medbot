import { ApiProperty } from '@nestjs/swagger';
import type { AvailableSlot } from '../appointments.types.js';

/** One bookable slot, as returned by GET /appointments/availability. */
export class AvailableSlotResponseDto implements AvailableSlot {
  @ApiProperty({ example: 'DOC001' })
  doctorId!: string;

  @ApiProperty({ example: 'Dr Anita Rao' })
  doctorName!: string;

  @ApiProperty({ example: 'DENTAL' })
  departmentId!: string;

  @ApiProperty({ description: 'Clinic-local date.', example: '2026-09-21' })
  date!: string;

  @ApiProperty({ example: '14:00' })
  startTime!: string;

  @ApiProperty({ example: '14:30' })
  endTime!: string;
}
