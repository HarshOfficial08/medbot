/**
 * What this module needs from its neighbours, stated as narrow read
 * contracts.
 *
 * Availability is "schedule − booked − doctor status", so it has to read
 * doctors and schedules. It does that through their exported services —
 * never their models or schemas (CLAUDE.md, Architecture rules 1 and 2).
 * Declaring the *shape* we depend on here, and injecting the real service
 * by its class token, keeps this module compiling while those modules are
 * still being built, and documents exactly which of their methods are
 * load-bearing for booking.
 */
import type { DoctorsService } from '../doctors/doctors.service.js';
import type { SchedulesService } from '../schedules/schedules.service.js';
import type { Doctor, FindDoctorsQuery } from '../doctors/doctors.types.js';
import type { DayOfWeek, Schedule } from '../schedules/schedules.types.js';

export interface DoctorsReader {
  find(query: FindDoctorsQuery): Promise<Doctor[]>;
  findById(id: string): Promise<Doctor | null>;
  findManyByIds(ids: string[]): Promise<Doctor[]>;
}

export interface SchedulesReader {
  findByDoctorAndDay(doctorId: string, dayOfWeek: DayOfWeek): Promise<Schedule[]>;
  findByDoctorsAndDay(doctorIds: string[], dayOfWeek: DayOfWeek): Promise<Schedule[]>;
}

/**
 * Drift guards: if either service stops satisfying the contract above —
 * a renamed method, a changed signature, a dropped one — the conditional
 * type collapses to `never` and these assignments stop compiling. A
 * compile error here, rather than a `TypeError` in production.
 */
export const DOCTORS_SERVICE_MATCHES_READER: DoctorsService extends DoctorsReader
  ? true
  : never = true;

export const SCHEDULES_SERVICE_MATCHES_READER: SchedulesService extends SchedulesReader
  ? true
  : never = true;
