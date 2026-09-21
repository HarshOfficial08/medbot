import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import { DoctorEntity, DoctorDocument } from './doctors.schema.js';
import { BOOKABLE_STATUSES } from './doctors.types.js';
import type { Doctor, DoctorStatus, FindDoctorsQuery } from './doctors.types.js';

/** The fields a lean read returns — never a Mongoose document. */
type LeanDoctor = Pick<
  DoctorEntity,
  '_id' | 'name' | 'departmentId' | 'specialization' | 'status'
>;

/**
 * Maps storage to contract. The `_id` -> `id` rename is the boundary:
 * nothing leaves this module in its persisted shape, so the collection
 * stays this module's private business (CLAUDE.md, architecture rules 1
 * and 4).
 */
function toDoctor(doc: LeanDoctor): Doctor {
  return {
    id: String(doc._id),
    name: doc.name,
    departmentId: doc.departmentId,
    specialization: doc.specialization,
    status: doc.status,
  };
}

@Injectable()
export class DoctorsService {
  constructor(
    @InjectModel(DoctorEntity.name)
    private readonly doctorModel: Model<DoctorDocument>,
  ) {}

  /**
   * Doctors matching a filter, name-ordered so results are stable.
   *
   * `bookableOnly` and `status` intersect rather than override: asking
   * for bookable ON_LEAVE doctors returns nothing, which is the safe
   * answer. Failing open here would mean the agent offering a slot with
   * a doctor who is not there.
   */
  async find(query: FindDoctorsQuery = {}): Promise<Doctor[]> {
    const filter: QueryFilter<DoctorDocument> = {};

    if (query.departmentId !== undefined) {
      filter.departmentId = query.departmentId;
    }

    const statuses = resolveStatuses(query);
    if (statuses !== undefined) {
      filter.status = { $in: statuses };
    }

    const docs = await this.doctorModel.find(filter).sort({ name: 1 }).lean().exec();

    return docs.map(toDoctor);
  }

  async findById(id: string): Promise<Doctor | null> {
    const doc = await this.doctorModel.findById(id).lean().exec();

    return doc ? toDoctor(doc) : null;
  }

  /**
   * Batch lookup, so the availability engine resolves a whole slate of
   * doctors in one round trip instead of one query per doctor.
   */
  async findManyByIds(ids: string[]): Promise<Doctor[]> {
    const unique = [...new Set(ids)];
    // An empty `$in` matches nothing; skipping the round trip entirely
    // is the same answer for less work.
    if (unique.length === 0) return [];

    const docs = await this.doctorModel
      .find({ _id: { $in: unique } })
      .sort({ name: 1 })
      .lean()
      .exec();

    return docs.map(toDoctor);
  }
}

/** The statuses a query admits, or undefined for "no status filter". */
function resolveStatuses(query: FindDoctorsQuery): DoctorStatus[] | undefined {
  const bookable = query.bookableOnly ? [...BOOKABLE_STATUSES] : undefined;

  if (query.status === undefined) return bookable;
  if (bookable === undefined) return [query.status];

  // Both constraints apply; an impossible combination yields [] and
  // therefore no doctors.
  return bookable.filter((status) => status === query.status);
}
