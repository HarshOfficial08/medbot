import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import { ScheduleEntity, ScheduleDocument } from './schedules.schema.js';
import type { DayOfWeek, Schedule } from './schedules.types.js';

/** The fields a lean read returns — never a Mongoose document. */
type LeanSchedule = Pick<
  ScheduleEntity,
  'doctorId' | 'dayOfWeek' | 'startTime' | 'endTime' | 'slotDurationMinutes'
> & { _id: unknown };

/**
 * Maps storage to contract. `_id` (an ObjectId here) becomes a string
 * `id`, so no caller ever needs mongoose types to read a schedule
 * (CLAUDE.md, architecture rule 4).
 */
function toSchedule(doc: LeanSchedule): Schedule {
  return {
    id: String(doc._id),
    doctorId: doc.doctorId,
    dayOfWeek: doc.dayOfWeek,
    startTime: doc.startTime,
    endTime: doc.endTime,
    slotDurationMinutes: doc.slotDurationMinutes,
  };
}

@Injectable()
export class SchedulesService {
  constructor(
    @InjectModel(ScheduleEntity.name)
    private readonly scheduleModel: Model<ScheduleDocument>,
  ) {}

  /** A doctor's whole week. */
  findByDoctor(doctorId: string): Promise<Schedule[]> {
    return this.query({ doctorId });
  }

  /** One doctor, one weekday — the availability engine's hot path. */
  findByDoctorAndDay(doctorId: string, dayOfWeek: DayOfWeek): Promise<Schedule[]> {
    return this.query({ doctorId, dayOfWeek });
  }

  /**
   * Batch version: every candidate doctor's windows for one weekday in a
   * single round trip, so availability does not issue one query per
   * doctor.
   */
  async findByDoctorsAndDay(
    doctorIds: string[],
    dayOfWeek: DayOfWeek,
  ): Promise<Schedule[]> {
    const unique = [...new Set(doctorIds)];
    // An empty `$in` matches nothing; skip the round trip.
    if (unique.length === 0) return [];

    return this.query({ doctorId: { $in: unique }, dayOfWeek });
  }

  /**
   * Persist a working window. The window's own validity (well-formed
   * "HH:mm", end after start) is enforced by CreateScheduleDto through
   * the global ValidationPipe, not re-checked here.
   */
  async create(input: Omit<Schedule, 'id'>): Promise<Schedule> {
    const created = await this.scheduleModel.create(input);

    return toSchedule(created.toObject());
  }

  /** One place where a filter becomes contracts, sorted for stable output. */
  private async query(filter: QueryFilter<ScheduleDocument>): Promise<Schedule[]> {
    const docs = await this.scheduleModel
      .find(filter)
      .sort({ doctorId: 1, startTime: 1 })
      .lean()
      .exec();

    return docs.map(toSchedule);
  }
}
