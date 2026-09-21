import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DAYS_OF_WEEK } from '../schedules.types.js';
import type { DayOfWeek } from '../schedules.types.js';

export class FindSchedulesQueryDto {
  /**
   * Required on purpose: every read of this collection is "this
   * doctor's week", which is exactly what the {doctorId, dayOfWeek}
   * index serves. An unfiltered dump of every schedule in the clinic has
   * no caller and would be an unbounded scan.
   */
  @ApiProperty({ description: 'Doctor whose schedules to return.', example: 'DOC001' })
  @IsString()
  @IsNotEmpty()
  doctorId!: string;

  @ApiPropertyOptional({ enum: DAYS_OF_WEEK, example: 'MONDAY' })
  @IsOptional()
  @IsIn(DAYS_OF_WEEK)
  dayOfWeek?: DayOfWeek;
}
