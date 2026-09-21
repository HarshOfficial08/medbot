/**
 * Clinic-local date/time arithmetic for the availability engine.
 *
 * Everything here is string-in, string-out: a working day is "09:00 to
 * 17:00 on 2026-09-21" at the clinic, and a JS `Date` would silently
 * re-interpret that in the server's timezone (see schedules.types.ts for
 * the same reasoning on the schedule side). Minutes-since-midnight is the
 * only numeric form used, and it never leaves this module's internals.
 */
import { TIME_PATTERN } from '../schedules/schedules.types.js';

/** ISO calendar date, "2026-09-21". */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** "HH:mm", 00:00-23:59 — re-exported so DTOs have one source for it. */
export { TIME_PATTERN };

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** Shape *and* calendar validity — "2026-02-30" is rejected. */
export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  // UTC construction, for the same off-by-one reason as dayOfWeekForDate.
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** "09:30" -> 570. Assumes a validated "HH:mm". */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * 570 -> "09:30".
 *
 * Deliberately does not wrap at midnight: a slot ending at 1440 formats
 * as "24:00", which sorts and compares correctly as the end of that day,
 * whereas wrapping to "00:00" would make an end look earlier than its
 * own start.
 */
export function toTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
