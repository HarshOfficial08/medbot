import { ApiProperty } from '@nestjs/swagger';
import { DAYS_OF_WEEK } from '../schedules.types.js';
import type { DayOfWeek, Schedule } from '../schedules.types.js';

/**
 * The response shape for a recurring working window.
 *
 * A class, not the `Schedule` interface: the OpenAPI spec the frontend
 * client is generated from is built from runtime metadata, and an
 * interface leaves nothing behind at runtime (CLAUDE.md, Global setup).
 */
export class ScheduleDto implements Schedule {
  @ApiProperty({ example: '66f0f2a1b5c3d4e5f6a7b8c9' })
  id!: string;

  @ApiProperty({ example: 'DOC001' })
  doctorId!: string;

  @ApiProperty({ enum: DAYS_OF_WEEK, example: 'MONDAY' })
  dayOfWeek!: DayOfWeek;

  @ApiProperty({
    description: 'Clinic-local "HH:mm" — deliberately not a Date, so a working day never shifts with the server timezone.',
    example: '09:00',
  })
  startTime!: string;

  @ApiProperty({ example: '17:00' })
  endTime!: string;

  @ApiProperty({ example: 30 })
  slotDurationMinutes!: number;
}
