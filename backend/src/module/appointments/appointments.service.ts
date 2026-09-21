import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { AppointmentEntity } from './appointments.schema.js';
import type { AppointmentDocument } from './appointments.schema.js';
import { BLOCKING_STATUSES } from './appointments.types.js';
import type {
  Appointment,
  AppointmentStatus,
  AvailableSlot,
  BookAppointmentRequest,
  FindSlotsQuery,
} from './appointments.types.js';
import { DoctorsService } from '../doctors/doctors.service.js';
import { SchedulesService } from '../schedules/schedules.service.js';
import type { DoctorsReader, SchedulesReader } from './appointments.dependencies.js';
import { BOOKABLE_STATUSES } from '../doctors/doctors.types.js';
import type { Doctor } from '../doctors/doctors.types.js';
import { dayOfWeekForDate } from '../schedules/schedules.types.js';
import type { DayOfWeek, Schedule } from '../schedules/schedules.types.js';
import { isValidDate, isValidTime, toMinutes, toTime } from './appointments.time.js';

/** The fields this module reads back off a stored appointment. */
interface AppointmentRecord {
  _id: unknown;
  patientId: string;
  doctorId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
}

/** Just enough of a booked row to know which slot it occupies. */
interface BlockedSlotRow {
  doctorId: string;
  startTime: string;
}

/** MongoDB's duplicate-key shape, narrowed from `unknown` without `any`. */
interface MongoWriteError {
  code?: unknown;
}

const DUPLICATE_KEY = 11000;

/** Did a unique index reject this write? */
function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  return (error as MongoWriteError).code === DUPLICATE_KEY;
}

function isBookable(doctor: Doctor): boolean {
  return BOOKABLE_STATUSES.includes(doctor.status);
}

/** Identity of one slot: a doctor at a time on a given day. */
function slotKey(doctorId: string, startTime: string): string {
  return `${doctorId}\u0000${startTime}`;
}

function toContract(record: AppointmentRecord): Appointment {
  return {
    id: String(record._id),
    patientId: record.patientId,
    doctorId: record.doctorId,
    date: record.date,
    startTime: record.startTime,
    endTime: record.endTime,
    status: record.status,
  };
}

/**
 * Owns availability *and* booking.
 *
 * Availability is computed, never stored: schedule windows, minus slots
 * already taken by a blocking appointment, minus doctors who aren't
 * bookable right now. Because that answer can go stale between the turn
 * where the agent offers a slot and the turn where the patient accepts
 * it, `book()` recomputes it immediately before inserting (plan section
 * 15) — and then still relies on the partial unique index to settle the
 * race it cannot win by reading (plan section 15, appointments.schema.ts).
 */
@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @InjectModel(AppointmentEntity.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    // Injected by class token, typed as the narrow read contract this
    // module actually depends on (appointments.dependencies.ts).
    @Inject(DoctorsService) private readonly doctors: DoctorsReader,
    @Inject(SchedulesService) private readonly schedules: SchedulesReader,
  ) {}

  /**
   * Bookable slots for a date, sorted by time then doctor.
   *
   * Boundary semantics, fixed here and tested: `after` is **inclusive**
   * (a slot starting exactly at `after` is offered — "anything from 2pm"
   * must include 2pm) and `before` is **exclusive** (a slot starting
   * exactly at `before` is not — "before 5pm" excludes the 5pm slot).
   * Both compare slot *start* times, per FindSlotsQuery.
   */
  async findAvailableSlots(query: FindSlotsQuery): Promise<AvailableSlot[]> {
    return this.computeSlots(query);
  }

  /**
   * @param excludeAppointmentId an appointment that should not block its
   * own slot — used by reschedule, so moving 10:00 -> 10:00 tomorrow
   * isn't refused by yesterday's own booking.
   */
  private async computeSlots(
    query: FindSlotsQuery,
    excludeAppointmentId?: string,
  ): Promise<AvailableSlot[]> {
    this.assertDate(query.date);
    if (!query.doctorId && !query.departmentId) {
      throw new BadRequestException(
        'Specify doctorId or departmentId when searching for slots.',
      );
    }
    for (const [name, value] of [
      ['after', query.after],
      ['before', query.before],
    ] as const) {
      if (value !== undefined && !isValidTime(value)) {
        throw new BadRequestException(`${name} must be "HH:mm", got "${value}".`);
      }
    }

    const doctors = await this.resolveBookableDoctors(query);
    if (doctors.length === 0) {
      return [];
    }

    const doctorIds = doctors.map((doctor) => doctor.id);
    // Both lookups are batched across every candidate doctor: one
    // schedules call and one appointments query, never one per doctor.
    const [schedules, blocked] = await Promise.all([
      this.loadSchedules(doctorIds, dayOfWeekForDate(query.date)),
      this.loadBlockedSlots(doctorIds, query.date, excludeAppointmentId),
    ]);

    return this.generateSlots(query, doctors, schedules, blocked);
  }

  private async resolveBookableDoctors(query: FindSlotsQuery): Promise<Doctor[]> {
    if (query.doctorId) {
      const doctor = await this.doctors.findById(query.doctorId);
      if (!doctor) {
        return [];
      }
      if (query.departmentId && doctor.departmentId !== query.departmentId) {
        return [];
      }
      // Re-checked here rather than trusted from the caller: an ON_LEAVE
      // doctor must never produce a slot, whatever was asked for.
      return isBookable(doctor) ? [doctor] : [];
    }

    const found = await this.doctors.find({
      departmentId: query.departmentId,
      bookableOnly: true,
    });
    return found.filter(isBookable);
  }

  private async loadSchedules(
    doctorIds: string[],
    dayOfWeek: DayOfWeek,
  ): Promise<Schedule[]> {
    return doctorIds.length === 1
      ? this.schedules.findByDoctorAndDay(doctorIds[0], dayOfWeek)
      : this.schedules.findByDoctorsAndDay(doctorIds, dayOfWeek);
  }

  /** Slots already occupied — cancelled/expired rows deliberately free theirs. */
  private async loadBlockedSlots(
    doctorIds: string[],
    date: string,
    excludeAppointmentId?: string,
  ): Promise<Set<string>> {
    const filter = {
      doctorId: { $in: doctorIds },
      date,
      status: { $in: [...BLOCKING_STATUSES] },
      // Reschedule excludes the row being moved, so an appointment never
      // blocks its own new slot.
      ...(excludeAppointmentId && Types.ObjectId.isValid(excludeAppointmentId)
        ? { _id: { $ne: new Types.ObjectId(excludeAppointmentId) } }
        : {}),
    };

    const rows = await this.appointmentModel
      .find(filter)
      .select('doctorId startTime')
      .lean<BlockedSlotRow[]>()
      .exec();

    return new Set(rows.map((row) => slotKey(row.doctorId, row.startTime)));
  }

  private generateSlots(
    query: FindSlotsQuery,
    doctors: Doctor[],
    schedules: Schedule[],
    blocked: Set<string>,
  ): AvailableSlot[] {
    const byId = new Map(doctors.map((doctor) => [doctor.id, doctor]));
    const after = query.after === undefined ? null : toMinutes(query.after);
    const before = query.before === undefined ? null : toMinutes(query.before);
    const emitted = new Set<string>();
    const slots: AvailableSlot[] = [];

    for (const schedule of schedules) {
      const doctor = byId.get(schedule.doctorId);
      if (!doctor) {
        // A schedule for a doctor who isn't a candidate (or isn't bookable).
        continue;
      }
      const step = schedule.slotDurationMinutes;
      if (!Number.isFinite(step) || step <= 0) {
        // Bad reference data must not spin this loop forever.
        this.logger.warn(
          `Schedule ${schedule.id} for doctor ${schedule.doctorId} has slotDurationMinutes=${String(step)}; skipped.`,
        );
        continue;
      }

      const windowEnd = toMinutes(schedule.endTime);
      // `start + step <= windowEnd`: a trailing partial slot is not a slot.
      for (let start = toMinutes(schedule.startTime); start + step <= windowEnd; start += step) {
        const startTime = toTime(start);
        const key = slotKey(schedule.doctorId, startTime);
        if (blocked.has(key) || emitted.has(key)) {
          // emitted: two overlapping schedule windows must not offer the
          // same slot twice.
          continue;
        }
        if (after !== null && start < after) {
          continue;
        }
        if (before !== null && start >= before) {
          continue;
        }

        emitted.add(key);
        slots.push({
          doctorId: doctor.id,
          doctorName: doctor.name,
          departmentId: doctor.departmentId,
          date: query.date,
          startTime,
          endTime: toTime(start + step),
        });
      }
    }

    return slots.sort(
      (a, b) =>
        a.startTime.localeCompare(b.startTime) || a.doctorId.localeCompare(b.doctorId),
    );
  }

  /**
   * COMMIT-tier action (plan section 13).
   *
   * Three separate guarantees, in order: the server verifies confirmation
   * rather than trusting the agent's claim; availability is recomputed at
   * commit time; and the database's partial unique index — not the read
   * above it — is what actually decides who gets the slot.
   */
  async book(request: BookAppointmentRequest): Promise<Appointment> {
    if (request.confirmed !== true) {
      throw new ForbiddenException(
        'Booking requires explicit patient confirmation. Ask the patient to confirm this exact slot, then retry with confirmed: true.',
      );
    }

    if (request.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(request.idempotencyKey);
      if (existing) {
        // A retry of the same COMMIT, not a second appointment.
        return existing;
      }
    }

    const slot = await this.requireBookableSlot(
      request.doctorId,
      request.date,
      request.startTime,
    );

    try {
      const created = await this.appointmentModel.create({
        patientId: request.patientId,
        doctorId: request.doctorId,
        date: request.date,
        startTime: request.startTime,
        endTime: slot.endTime,
        // Confirmed by the patient in this turn, so it goes straight to
        // CONFIRMED rather than HELD.
        status: 'CONFIRMED' satisfies AppointmentStatus,
        idempotencyKey: request.idempotencyKey,
      });
      return toContract(created);
    } catch (error) {
      return await this.resolveWriteConflict(error, request);
    }
  }

  /**
   * The write lost a race against a unique index: either this same COMMIT
   * was retried concurrently, or someone else took the slot.
   */
  private async resolveWriteConflict(
    error: unknown,
    request: BookAppointmentRequest,
  ): Promise<Appointment> {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    // Checked before blaming the slot: a concurrent retry of this same
    // COMMIT collides with *both* unique indexes, and which one MongoDB
    // reports is not something to depend on. If a row carries this key,
    // it is this booking — return it rather than failing the retry.
    if (request.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(request.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    throw new ConflictException(
      `${request.startTime} on ${request.date} with doctor ${request.doctorId} was taken while this booking was being confirmed. Offer the patient another slot.`,
    );
  }

  /** Recomputes availability and returns the one slot asked for. */
  private async requireBookableSlot(
    doctorId: string,
    date: string,
    startTime: string,
    excludeAppointmentId?: string,
  ): Promise<AvailableSlot> {
    this.assertDate(date);
    if (!isValidTime(startTime)) {
      throw new BadRequestException(`startTime must be "HH:mm", got "${startTime}".`);
    }

    // Distinguished from "slot gone" on purpose: the agent should say
    // something different for an unknown doctor than for a taken slot.
    const doctor = await this.doctors.findById(doctorId);
    if (!doctor) {
      throw new NotFoundException(`Unknown doctor ${doctorId}.`);
    }
    if (!isBookable(doctor)) {
      throw new ConflictException(
        `${doctor.name} is not taking appointments right now (status ${doctor.status}). Offer another doctor.`,
      );
    }

    const slots = await this.computeSlots(
      // `after` is inclusive, so this narrows the scan to the slot asked
      // for and everything later that day.
      { doctorId, date, after: startTime },
      excludeAppointmentId,
    );
    const slot = slots.find((candidate) => candidate.startTime === startTime);
    if (!slot) {
      throw new ConflictException(
        `${doctor.name} has no free slot at ${startTime} on ${date}. Re-check availability and offer the patient a different time.`,
      );
    }
    return slot;
  }

  /** Null for an unknown or malformed id, rather than a cast error. */
  async findById(id: string): Promise<Appointment | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const found = await this.appointmentModel
      .findById(id)
      .lean<AppointmentRecord | null>()
      .exec();
    return found ? toContract(found) : null;
  }

  /** Same lookup, but the caller requires it to exist. */
  async getById(id: string): Promise<Appointment> {
    const found = await this.findById(id);
    if (!found) {
      throw new NotFoundException(`Appointment ${id} not found.`);
    }
    return found;
  }

  private async findByIdempotencyKey(key: string): Promise<Appointment | null> {
    const found = await this.appointmentModel
      .findOne({ idempotencyKey: key })
      .lean<AppointmentRecord | null>()
      .exec();
    return found ? toContract(found) : null;
  }

  /** The doctor dashboard's query: one doctor's day, earliest first. */
  async findByDoctorAndDate(doctorId: string, date: string): Promise<Appointment[]> {
    this.assertDate(date);
    const rows = await this.appointmentModel
      .find({ doctorId, date })
      .sort({ startTime: 1 })
      .lean<AppointmentRecord[]>()
      .exec();
    return rows.map(toContract);
  }

  /** Frees the slot: CANCELLED is outside BLOCKING_STATUSES by design. */
  async cancel(id: string): Promise<Appointment> {
    const current = await this.getById(id);
    if (current.status === 'CANCELLED') {
      // Idempotent: a repeated cancel is not an error to hand the agent.
      return current;
    }
    if (current.status === 'COMPLETED') {
      throw new ConflictException('A completed appointment cannot be cancelled.');
    }

    const updated = await this.appointmentModel
      .findByIdAndUpdate(id, { status: 'CANCELLED' satisfies AppointmentStatus }, { returnDocument: 'after' })
      .lean<AppointmentRecord | null>()
      .exec();
    if (!updated) {
      throw new NotFoundException(`Appointment ${id} not found.`);
    }
    return toContract(updated);
  }

  /**
   * Move an appointment. Same commit-time guarantees as book(): the new
   * slot is re-checked, and the unique index settles a concurrent race.
   */
  async reschedule(
    id: string,
    newDate: string,
    newStartTime: string,
  ): Promise<Appointment> {
    const current = await this.getById(id);
    if (!BLOCKING_STATUSES.includes(current.status)) {
      throw new ConflictException(
        `A ${current.status.toLowerCase()} appointment cannot be rescheduled; book a new one instead.`,
      );
    }
    if (current.date === newDate && current.startTime === newStartTime) {
      return current;
    }

    // Excludes itself, so its own row doesn't make its new slot look taken.
    const slot = await this.requireBookableSlot(
      current.doctorId,
      newDate,
      newStartTime,
      id,
    );

    try {
      const updated = await this.appointmentModel
        .findOneAndUpdate(
          // Re-asserts the status in the filter: if it was cancelled
          // between the read and this write, the move must not land.
          { _id: id, status: { $in: [...BLOCKING_STATUSES] } },
          { date: newDate, startTime: newStartTime, endTime: slot.endTime },
          { returnDocument: 'after' },
        )
        .lean<AppointmentRecord | null>()
        .exec();
      if (!updated) {
        throw new ConflictException(
          `Appointment ${id} changed while it was being rescheduled. Re-read it and try again.`,
        );
      }
      return toContract(updated);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(
          `${newStartTime} on ${newDate} was taken while this appointment was being moved. Offer the patient another slot.`,
        );
      }
      throw error;
    }
  }

  private assertDate(date: string): void {
    if (!isValidDate(date)) {
      throw new BadRequestException(
        `date must be an ISO calendar date "YYYY-MM-DD", got "${date}".`,
      );
    }
  }
}
