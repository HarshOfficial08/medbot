/** Public contract for the schedules module. */

export const DAYS_OF_WEEK = [
  'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY',
] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

/**
 * A doctor's recurring working window for one weekday.
 * Times are "HH:mm" in clinic-local time — deliberately not Date objects,
 * so a working day never shifts with the server's timezone.
 */
export interface Schedule {
  id: string;
  doctorId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
}

/** "HH:mm", 00:00–23:59. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Weekday name for an ISO date ("2026-09-21"), clinic-local. */
export function dayOfWeekForDate(isoDate: string): DayOfWeek {
  const [year, month, day] = isoDate.split('-').map(Number);
  // UTC construction avoids the local-timezone off-by-one that
  // `new Date('2026-09-21')` causes west of Greenwich.
  return DAYS_OF_WEEK[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}
