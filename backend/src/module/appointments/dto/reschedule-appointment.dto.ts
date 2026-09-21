import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { DATE_PATTERN, TIME_PATTERN } from '../appointments.time.js';

/** Body for POST /appointments/:id/reschedule. */
export class RescheduleAppointmentDto {
  @ApiProperty({ description: 'New clinic-local date, "YYYY-MM-DD".', example: '2026-09-22' })
  @Matches(DATE_PATTERN, { message: 'date must be an ISO date "YYYY-MM-DD".' })
  date!: string;

  @ApiProperty({ description: 'New slot start, "HH:mm".', example: '10:30' })
  @Matches(TIME_PATTERN, { message: 'startTime must be a time "HH:mm".' })
  startTime!: string;
}
