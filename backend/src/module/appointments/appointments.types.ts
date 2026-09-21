/** Public contract for the appointments module (owns availability too). */

/** Plan section 9. */
export const APPOINTMENT_STATUSES = [
  'HELD', 'PROPOSED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'EXPIRED',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Statuses that actually occupy a slot — everything else frees it. */
export const BLOCKING_STATUSES: readonly AppointmentStatus[] = [
  'HELD', 'PROPOSED', 'CONFIRMED',
];

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  /** ISO date, "2026-09-21", clinic-local. */
  date: string;
  /** "HH:mm". */
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
}

/** One bookable slot produced by the availability engine. */
export interface AvailableSlot {
  doctorId: string;
  doctorName: string;
  departmentId: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface FindSlotsQuery {
  departmentId?: string;
  doctorId?: string;
  /** ISO date. */
  date: string;
  /** "HH:mm" — only slots starting at or after this. */
  after?: string;
  /** "HH:mm" — only slots starting before this. */
  before?: string;
}

/**
 * Booking is a COMMIT-tier action (plan section 13): it requires explicit
 * patient confirmation, verified server-side. The agent cannot satisfy
 * this by asserting it in a prompt.
 */
export interface BookAppointmentRequest {
  patientId: string;
  doctorId: string;
  date: string;
  startTime: string;
  /** Must be true, and must come from a real confirmation turn. */
  confirmed: boolean;
  /** Makes a retried booking idempotent instead of double-booking. */
  idempotencyKey?: string;
}
