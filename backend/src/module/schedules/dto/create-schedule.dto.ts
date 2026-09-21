import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
} from 'class-validator';
import type {
  ValidationArguments,
  ValidatorConstraintInterface,
} from 'class-validator';
import { DAYS_OF_WEEK, TIME_PATTERN } from '../schedules.types.js';
import type { DayOfWeek, Schedule } from '../schedules.types.js';

/** Minutes since midnight for a validated "HH:mm". */
export function minutesSinceMidnight(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * `endTime` must be later in the day than `startTime`.
 *
 * A window that ends before it starts produces zero slots silently —
 * the agent would simply find no availability for a doctor who is in
 * fact working, with nothing in the logs to explain it. Rejecting the
 * row at the edge is the cheapest place to catch it.
 */
@ValidatorConstraint({ name: 'isAfterStartTime' })
export class IsAfterStartTime implements ValidatorConstraintInterface {
  validate(endTime: unknown, args: ValidationArguments): boolean {
    const { startTime } = args.object as { startTime?: unknown };

    if (typeof endTime !== 'string' || typeof startTime !== 'string') return false;
    if (!TIME_PATTERN.test(endTime) || !TIME_PATTERN.test(startTime)) return false;

    return minutesSinceMidnight(endTime) > minutesSinceMidnight(startTime);
  }

  defaultMessage(): string {
    return 'endTime must be later than startTime';
  }
}

export class CreateScheduleDto implements Omit<Schedule, 'id'> {
  @ApiProperty({ example: 'DOC001' })
  @IsString()
  @IsNotEmpty()
  doctorId!: string;

  @ApiProperty({ enum: DAYS_OF_WEEK, example: 'MONDAY' })
  @IsIn(DAYS_OF_WEEK)
  dayOfWeek!: DayOfWeek;

  @ApiProperty({ description: 'Clinic-local "HH:mm".', example: '09:00' })
  @Matches(TIME_PATTERN, { message: 'startTime must be "HH:mm" (00:00-23:59)' })
  startTime!: string;

  @ApiProperty({ description: 'Clinic-local "HH:mm", after startTime.', example: '17:00' })
  @Matches(TIME_PATTERN, { message: 'endTime must be "HH:mm" (00:00-23:59)' })
  @Validate(IsAfterStartTime)
  endTime!: string;

  @ApiProperty({ minimum: 5, maximum: 240, default: 30, example: 30 })
  @IsInt()
  @Min(5)
  @Max(240)
  slotDurationMinutes: number = 30;
}
